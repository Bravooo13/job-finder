import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAutoSettings, readResumeFile } from "@/lib/apply/auto";
import { findJobById, findJobForUrl, resumeForJob, resumePdf } from "@/lib/apply/jobs";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const pdfResponse = (pdf: Buffer, fileName: string) =>
  new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${fileName.replace(/"/g, "")}"`,
      "x-file-name": fileName,
      "cache-control": "no-store",
    },
  });

// GET /api/apply/resume?url=… | ?jobId=… | ?foundId=… | ?resumeId=…: the resume PDF to upload for a job.
// A resume you tailored for the job wins; then the PDF you uploaded for Auto apply (if that's your choice); then your master resume.
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  let resumeId = p.get("resumeId");
  if (!resumeId) {
    const match = (await findJobById({ jobId: p.get("jobId"), foundId: p.get("foundId") })) ?? (p.get("url") ? await findJobForUrl(p.get("url")!) : null);
    const jobId = match?.jobId ?? null;
    const tailored = jobId ? (await db.select({ resumeId: jobs.resumeId }).from(jobs).where(eq(jobs.id, jobId)).limit(1))[0]?.resumeId : null;
    if (!tailored && (await getAutoSettings()).resume === "file") {
      const file = await readResumeFile();
      if (file) return pdfResponse(file.pdf, file.fileName);
    }
    resumeId = (await resumeForJob(jobId))?.id ?? null;
  }
  if (!resumeId) return NextResponse.json({ error: "No resume yet" }, { status: 404 });
  const result = await resumePdf(resumeId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });
  return pdfResponse(result.pdf, result.fileName);
}
