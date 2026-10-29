import { NextResponse } from "next/server";
import { z } from "zod";
import { answerFields } from "@/lib/apply/answers";
import { findJobForUrl, latestCoverLetter, resumeForJob, savedAnswers } from "@/lib/apply/jobs";
import { getApplyProfile } from "@/lib/apply/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fieldSchema = z.object({
  key: z.string().max(200),
  label: z.string().max(2000),
  type: z.enum(["text", "email", "tel", "url", "number", "date", "month", "textarea", "select", "radio", "checkbox", "combobox", "file"]),
  options: z.array(z.string().max(500)).max(400).optional(),
  required: z.boolean().optional(),
  placeholder: z.string().max(500).optional(),
  maxLength: z.number().int().positive().optional(),
});

const bodySchema = z.object({
  url: z.string().url(),
  pageTitle: z.string().max(500).optional(),
  fields: z.array(fieldSchema).max(300),
});

// POST /api/apply/fill: answers for the fields of an application form.
// Body: { url, pageTitle?, fields: [{ key, label, type, options?, required?, maxLength? }] }
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  const { url, fields } = parsed.data;
  const job = await findJobForUrl(url);
  const [profile, coverLetter, saved, resume] = await Promise.all([
    getApplyProfile(),
    latestCoverLetter(job?.jobId ?? null),
    savedAnswers(job?.jobId ?? null),
    resumeForJob(job?.jobId ?? null),
  ]);
  const answers = answerFields(fields, profile, { company: job?.company, jobTitle: job?.title, coverLetter: coverLetter ?? undefined, saved });
  return NextResponse.json({
    job: job ? { jobId: job.jobId, foundId: job.foundId, title: job.title, company: job.company } : null,
    resume: resume ? { id: resume.id, title: resume.title, hasPdf: Boolean(resume.latex?.trim()) } : null,
    hasCoverLetter: Boolean(coverLetter),
    answers,
  });
}
