import { NextResponse } from "next/server";
import { z } from "zod";
import { answerFields } from "@/lib/apply/answers";
import { getAutoSettings } from "@/lib/apply/auto";
import { findJobById, findJobForUrl, latestCoverLetter, savedAnswers } from "@/lib/apply/jobs";
import { resumeChoice } from "@/lib/apply/resume-choice";
import { getApplyProfile, resumeFacts } from "@/lib/apply/profile";

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
  hint: z.string().max(200).optional(),
  multiple: z.boolean().optional(),
});

const bodySchema = z.object({
  url: z.string().url(),
  pageTitle: z.string().max(500).optional(),
  fields: z.array(fieldSchema).max(300),
  /** The job, when the caller knows it (Auto apply tasks). */
  jobId: z.string().max(100).nullish(),
  foundId: z.string().max(100).nullish(),
  /** Filling for Auto apply: follows its settings (for example, ticking consent boxes when you allowed it). */
  auto: z.boolean().optional(),
});

// POST /api/apply/fill: answers for the fields of an application form.
// Body: { url, pageTitle?, fields: [{ key, label, type, options?, required?, maxLength?, hint?, multiple? }], jobId?, foundId?, auto? }
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  const { url, fields } = parsed.data;
  const job = (await findJobById(parsed.data)) ?? (await findJobForUrl(url));
  const [profile, coverLetter, saved, resume, facts, auto] = await Promise.all([
    getApplyProfile(),
    latestCoverLetter(job?.jobId ?? null),
    savedAnswers(job?.jobId ?? null),
    resumeChoice({ jobId: job?.jobId, foundId: job?.foundId }),
    resumeFacts(),
    getAutoSettings(),
  ]);
  const answers = answerFields(fields, profile, {
    company: job?.company,
    jobTitle: job?.title,
    jobLocation: job?.location ?? undefined,
    coverLetter: coverLetter ?? undefined,
    saved,
    consent: Boolean(parsed.data.auto && auto.consent),
    skills: facts.skills,
    employers: facts.employers,
  });
  return NextResponse.json({
    job: job ? { jobId: job.jobId, foundId: job.foundId, title: job.title, company: job.company } : null,
    // Which resume gets attached and why ("your Data engineering version", "the PDF you uploaded").
    resume: resume ? { kind: resume.kind, title: resume.kind === "file" ? resume.name : resume.title, why: resume.why } : null,
    hasCoverLetter: Boolean(coverLetter),
    coverLetters: auto.coverLetters,
    answers,
  });
}
