import "server-only";
import { z } from "zod";
import { answerFields } from "./answers";
import { getAutoSettings } from "./auto";
import { findJobById, findJobForUrl, latestCoverLetter, savedAnswers } from "./jobs";
import { getApplyProfile, resumeFacts } from "./profile";
import { resumeChoice } from "./resume-choice";

export const FIELD_TYPES = ["text", "email", "tel", "url", "number", "date", "month", "textarea", "select", "radio", "checkbox", "combobox", "file"] as const;

export const fillFieldSchema = z.object({
  key: z.string().max(200).describe("Your own id for the field."),
  label: z.string().max(2000).describe("The question text exactly as shown."),
  type: z.enum(FIELD_TYPES),
  options: z.array(z.string().max(500)).max(400).optional().describe("Choices, for select/radio/checkbox/combobox."),
  required: z.boolean().optional(),
  placeholder: z.string().max(500).optional(),
  maxLength: z.number().int().positive().optional(),
  hint: z.string().max(200).optional().describe("The element id, e.g. Greenhouse's school--0."),
  multiple: z.boolean().optional(),
});

export const fillSchema = z.object({
  url: z.string().url().describe("The application page URL."),
  pageTitle: z.string().max(500).optional(),
  fields: z.array(fillFieldSchema).max(300),
  /** The job, when the caller knows it (Auto apply tasks). */
  jobId: z.string().max(100).nullish(),
  foundId: z.string().max(100).nullish(),
  /** Filling for Auto apply: follows its settings (for example, ticking consent boxes when you allowed it). */
  auto: z.boolean().optional(),
});
export type FillInput = z.infer<typeof fillSchema>;

/** Answers for the fields of an application form, from My answers, the resume and saved answers. */
export async function fillAnswers(input: FillInput) {
  const { url, fields } = input;
  const job = (await findJobById(input)) ?? (await findJobForUrl(url));
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
    consent: Boolean(input.auto && auto.consent),
    skills: facts.skills,
    employers: facts.employers,
  });
  return {
    job: job ? { jobId: job.jobId, foundId: job.foundId, title: job.title, company: job.company } : null,
    // Which resume gets attached and why ("your Data engineering version", "the PDF you uploaded").
    resume: resume ? { kind: resume.kind, title: resume.kind === "file" ? resume.name : resume.title, why: resume.why } : null,
    hasCoverLetter: Boolean(coverLetter),
    coverLetters: auto.coverLetters,
    answers,
  };
}
