import { NextResponse } from "next/server";
import { readResumeFile } from "@/lib/apply/auto";
import { findJobById, findJobForUrl, resumePdf } from "@/lib/apply/jobs";
import { resumeChoice } from "@/lib/apply/resume-choice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const pdfResponse = (pdf: Buffer, fileName: string, why: string) =>
  new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${fileName.replace(/"/g, "")}"`,
      "x-file-name": fileName,
      "x-resume-choice": encodeURIComponent(why),
      "cache-control": "no-store",
    },
  });

// GET /api/apply/resume?url=… | ?jobId=… | ?foundId=… | ?resumeId=…: the resume PDF to upload for a job.
// Order: tailored for the job → your version for the job's field → the PDF you uploaded → your master resume
// (the Auto apply "Resume to attach" setting decides which of these are used). The x-resume-choice header says which.
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  let resumeId = p.get("resumeId");
  let why = "the resume you asked for";
  if (!resumeId) {
    const match = (await findJobById({ jobId: p.get("jobId"), foundId: p.get("foundId") })) ?? (p.get("url") ? await findJobForUrl(p.get("url")!) : null);
    const choice = await resumeChoice({ jobId: match?.jobId ?? p.get("jobId"), foundId: match?.foundId ?? p.get("foundId") });
    if (!choice) return NextResponse.json({ error: "No resume yet. Upload a PDF on Apply → Auto apply or import one in Profile & resumes." }, { status: 404 });
    why = choice.why;
    if (choice.kind === "file") {
      const file = await readResumeFile();
      if (file) return pdfResponse(file.pdf, file.fileName, why);
      return NextResponse.json({ error: "The uploaded resume PDF is missing. Upload it again on Apply → Auto apply." }, { status: 404 });
    }
    resumeId = choice.resumeId;
  }
  const result = await resumePdf(resumeId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });
  return pdfResponse(result.pdf, result.fileName, why);
}
