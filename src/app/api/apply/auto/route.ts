import { NextResponse } from "next/server";
import { z } from "zod";
import { enqueueApplications, getAutoSettings, getResumeFile, helperLastSeen, listTasks } from "@/lib/apply/auto";
import { TASK_STATUSES, type TaskStatus } from "@/lib/apply/auto-schema";
import { getAiStatus } from "@/lib/ai/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/apply/auto?status=held,needs_you&batch=…&limit=50: Auto apply's applications, with counts,
// its settings, whether the browser helper is running and whether the AI is set up.
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const status = (p.get("status") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is TaskStatus => (TASK_STATUSES as readonly string[]).includes(s));
  const [list, settings, resumeFile, ai] = await Promise.all([
    listTasks({ status, batchId: p.get("batch") ?? undefined, limit: Number(p.get("limit")) || 100 }),
    getAutoSettings(),
    getResumeFile(),
    getAiStatus(),
  ]);
  const seen = helperLastSeen();
  return NextResponse.json({
    ...list,
    settings,
    resumeFile,
    ai: { ready: ai.ready, label: ai.label, applyModel: ai.settings.applyModel },
    helper: seen ? { lastSeen: new Date(seen.at).toISOString(), running: Date.now() - seen.at < 90_000, version: seen.version ?? null } : { lastSeen: null, running: false, version: null },
  });
}

const enqueueSchema = z
  .object({
    jobIds: z.array(z.string().max(100)).max(100).optional(),
    foundIds: z.array(z.string().max(100)).max(100).optional(),
    urls: z.array(z.string().url()).max(100).optional(),
    by: z.enum(["you", "agent"]).optional(),
  })
  .refine((b) => (b.jobIds?.length ?? 0) + (b.foundIds?.length ?? 0) + (b.urls?.length ?? 0) > 0, "Give jobIds, foundIds or urls");

// POST /api/apply/auto { jobIds?, foundIds?, urls?, by? }: queue applications. The browser helper picks them up
// within half a minute (Chrome must be open with the extension loaded).
export async function POST(request: Request) {
  const parsed = enqueueSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  const result = await enqueueApplications(parsed.data);
  const seen = helperLastSeen();
  return NextResponse.json({
    ...result,
    helperRunning: Boolean(seen && Date.now() - seen.at < 90_000),
    note:
      seen && Date.now() - seen.at < 90_000
        ? "The browser helper will start within half a minute."
        : "The browser helper hasn't checked in. Open Chrome with the Job Finder Helper extension loaded; it starts the queue by itself.",
  });
}
