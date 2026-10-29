import { NextResponse } from "next/server";
import { findJobForUrl, resumeForJob, resumePdf } from "@/lib/apply/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET /api/apply/resume?url=… | ?jobId=… | ?resumeId=…: the resume PDF to upload for a job
// (the version tailored for it, else your master resume).
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  let resumeId = p.get("resumeId");
  if (!resumeId) {
    const jobId = p.get("jobId") ?? (p.get("url") ? (await findJobForUrl(p.get("url")!))?.jobId ?? null : null);
    resumeId = (await resumeForJob(jobId))?.id ?? null;
  }
  if (!resumeId) return NextResponse.json({ error: "No resume yet" }, { status: 404 });
  const result = await resumePdf(resumeId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });
  return new Response(new Uint8Array(result.pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${result.fileName}"`,
      "x-file-name": result.fileName,
      "cache-control": "no-store",
    },
  });
}
