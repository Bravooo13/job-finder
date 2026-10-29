import { NextResponse } from "next/server";
import { z } from "zod";
import { getLinkedInRun, startLinkedInRun, waitForRun } from "@/lib/grab/linkedin-runs";
import { LINKEDIN_LIMITS } from "@/lib/grab/linkedin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z
  .object({
    searchUrl: z.string().url().max(4000).optional(),
    keywords: z.string().trim().max(200).optional(),
    location: z.string().trim().max(200).optional(),
    postedDays: z.number().positive().max(60).optional(),
    remote: z.boolean().optional(),
    ids: z.array(z.string().regex(/^\d{6,}$/)).max(LINKEDIN_LIMITS.jobs).optional(),
    pages: z.number().int().min(1).max(LINKEDIN_LIMITS.pages).optional(),
    maxJobs: z.number().int().min(1).max(LINKEDIN_LIMITS.jobs).optional(),
    save: z.boolean().optional(),
    by: z.enum(["agent", "extension", "you"]).optional(),
    /** Seconds to wait for the result before answering (default 0: answer at once). */
    wait: z.number().min(0).max(240).optional(),
  })
  .refine((b) => b.searchUrl || b.keywords || b.location || b.ids?.length, "Send a searchUrl, keywords or job ids.");

// POST /api/grab/linkedin: read a LinkedIn job search (the address-bar link, or
// keywords + location) or a list of job ids, and add the jobs to Found jobs.
// Runs in the background; GET /api/grab/linkedin?id=<run id> for progress.
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  const { wait, ...options } = parsed.data;
  try {
    const run = startLinkedInRun(options);
    if (wait) await waitForRun(run, wait * 1000);
    return NextResponse.json(run, { status: run.state === "running" ? 202 : 200 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 409 });
  }
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  const run = id ? getLinkedInRun(id) : undefined;
  if (!run) return NextResponse.json({ error: "No such run" }, { status: 404 });
  return NextResponse.json(run);
}
