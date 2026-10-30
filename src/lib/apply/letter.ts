import "server-only";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { splitLetter } from "@/lib/ai/agents";
import { buildSystemPrompt } from "@/lib/ai/context";
import { forApplying } from "@/lib/ai/models";
import { runChat, stripThinking } from "@/lib/ai/providers";
import { getAiSettings } from "@/lib/ai/settings";
import { db } from "@/lib/db";
import { companies, coverLetters, jobs } from "@/lib/db/schema";
import { saveFoundJob } from "@/lib/search/actions";
import { resumeChoice } from "./resume-choice";

// A cover letter for an application: the one you have for the job, else a new
// one from the Cover letter writer agent (your voice rules, your resume version
// for the job's field and the job description), saved on the Cover letters page.

export interface LetterResult {
  id: string;
  jobId: string;
  content: string;
  /** True when it was just written (so it should be read before sending). */
  written: boolean;
}

export async function letterForApplication(ids: { jobId?: string | null; foundId?: string | null }, opts: { write: boolean }): Promise<LetterResult | { error: string }> {
  // The letter belongs to a job in My jobs; save a found job first.
  let jobId = ids.jobId ?? null;
  if (!jobId && ids.foundId) {
    const saved = await saveFoundJob(ids.foundId);
    if (!saved.ok) return { error: saved.error };
    jobId = saved.data.jobId;
  }
  if (!jobId) return { error: "This application isn't linked to a job in Job Finder, so there's no job description to write from." };

  const [existing] = await db
    .select({ id: coverLetters.id, content: coverLetters.content })
    .from(coverLetters)
    .where(eq(coverLetters.jobId, jobId))
    .orderBy(desc(coverLetters.updatedAt))
    .limit(1);
  if (existing?.content.trim()) return { id: existing.id, jobId, content: existing.content, written: false };
  if (!opts.write) return { error: "No cover letter for this job yet" };

  const [job] = await db
    .select({ title: jobs.title, company: companies.name, description: jobs.description })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!job) return { error: "That job is gone" };
  if (!job.description?.trim()) return { error: "This job has no description saved, so the letter would be generic. Add the description to the job, then try again." };

  const choice = await resumeChoice({ jobId });
  const resumeId = choice && choice.kind !== "file" ? choice.resumeId : undefined;
  const system = await buildSystemPrompt("cover-letter", { jobId, resumeId });
  let text = "";
  await runChat(
    { system, messages: [{ role: "user", content: `Write the cover letter for the ${job.title} role at ${job.company}.` }], maxTokens: 4000, onText: (t) => (text += t) },
    forApplying(await getAiSettings()),
  );
  const { letter, notes } = splitLetter(stripThinking(text));
  if (letter.length < 200) return { error: "The cover letter writer didn't return a letter. Try again, or write it on the Cover letters page." };

  const [row] = await db
    .insert(coverLetters)
    .values({
      title: `${job.company} – ${job.title}`.slice(0, 200),
      company: job.company,
      role: job.title,
      jobId,
      resumeId: resumeId ?? null,
      jobDescription: job.description,
      instructions: "Written by Auto apply because the application asked for a cover letter.",
      content: letter,
      notes: notes || null,
    })
    .returning({ id: coverLetters.id });
  revalidatePath("/cover-letters");
  revalidatePath(`/jobs/${jobId}`);
  return { id: row.id, jobId, content: letter, written: true };
}
