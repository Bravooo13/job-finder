import { NextResponse } from "next/server";
import { markAppliedByUrl } from "@/lib/apply/jobs";
import { updateJobStatus } from "@/lib/jobs/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/apply/applied { url } or { jobId }: marks the job as applied (today).
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { url?: string; jobId?: string };
  if (body.jobId) {
    const r = await updateJobStatus(body.jobId, "applied");
    return r.ok ? NextResponse.json({ jobId: body.jobId }) : NextResponse.json({ error: r.error }, { status: 404 });
  }
  if (!body.url) return NextResponse.json({ error: "Send url or jobId" }, { status: 400 });
  const r = await markAppliedByUrl(body.url);
  return "error" in r ? NextResponse.json(r, { status: 404 }) : NextResponse.json(r);
}
