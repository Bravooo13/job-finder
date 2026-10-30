import { NextResponse } from "next/server";
import { claimNext, getAutoSettings } from "@/lib/apply/auto";
import { getAiStatus } from "@/lib/ai/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/apply/auto/next { version? }: for the browser helper. Claims the next queued application
// (marks it running) and returns it with the settings to fill it by, or { task: null }.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { version?: string };
  const task = await claimNext(typeof body.version === "string" ? body.version.slice(0, 20) : undefined);
  const settings = await getAutoSettings();
  if (!task) return NextResponse.json({ task: null, settings });
  const ai = await getAiStatus();
  return NextResponse.json({ task, settings, ai: { ready: ai.ready } });
}
