import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, isNotNull, isNull, like, or } from "drizzle-orm";
import { cleanJobUrl } from "@/lib/boards/adapters";
import { db } from "@/lib/db";
import { applyAnswers, companies, coverLetters, discoveredJobs, jobs, resumes } from "@/lib/db/schema";
import { compileLatex } from "@/lib/latex/tectonic";
import { updateJobStatus } from "@/lib/jobs/actions";
import { saveFoundJob } from "@/lib/search/actions";

/** "…/jobs/123/apply", "…/uuid/application" and the posting itself are the same job. */
export function postingKey(url: string): string {
  try {
    const u = new URL(cleanJobUrl(url));
    let path = u.pathname.replace(/\/+$/, "");
    path = path.replace(/\/(apply|application|applyManually|autofillWithResume|useMyLastApplication)(\/.*)?$/i, "");
    // Greenhouse embeds use ?token=… or ?gh_jid=… for the job id.
    const id = u.searchParams.get("gh_jid") ?? u.searchParams.get("token") ?? u.searchParams.get("jobId") ?? "";
    return `${u.hostname.replace(/^www\./, "")}${path}${id ? `#${id}` : ""}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export interface JobMatch {
  jobId: string | null;
  foundId: string | null;
  title: string;
  company: string;
  resumeId: string | null;
  description: string | null;
}

/** Finds the tracked job (or found job) an application page belongs to. */
export async function findJobForUrl(url: string): Promise<JobMatch | null> {
  const key = postingKey(url);
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  const pattern = `%${host}%`;
  const tracked = await db
    .select({ id: jobs.id, url: jobs.url, applyUrl: jobs.applyUrl, title: jobs.title, company: companies.name, resumeId: jobs.resumeId, description: jobs.description })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(or(and(isNotNull(jobs.url), like(jobs.url, pattern)), like(jobs.applyUrl, pattern)));
  const t = tracked.find((j) => (j.url && postingKey(j.url) === key) || (j.applyUrl && postingKey(j.applyUrl) === key));
  if (t) return { jobId: t.id, foundId: null, title: t.title, company: t.company, resumeId: t.resumeId, description: t.description };

  const found = await db
    .select({ id: discoveredJobs.id, url: discoveredJobs.url, applyUrl: discoveredJobs.applyUrl, title: discoveredJobs.title, company: discoveredJobs.company, jobId: discoveredJobs.jobId, description: discoveredJobs.description })
    .from(discoveredJobs)
    .where(or(like(discoveredJobs.url, pattern), like(discoveredJobs.applyUrl, pattern)));
  const f = found.find((j) => postingKey(j.url) === key || (j.applyUrl && postingKey(j.applyUrl) === key));
  if (f) return { jobId: f.jobId, foundId: f.id, title: f.title, company: f.company, resumeId: null, description: f.description };
  return null;
}

export async function latestCoverLetter(jobId: string | null): Promise<string | null> {
  if (!jobId) return null;
  const row = await db
    .select({ content: coverLetters.content })
    .from(coverLetters)
    .where(eq(coverLetters.jobId, jobId))
    .orderBy(desc(coverLetters.updatedAt))
    .limit(1);
  return row[0]?.content?.trim() || null;
}

export async function savedAnswers(jobId: string | null) {
  if (!jobId) return [];
  return db.select({ question: applyAnswers.question, answer: applyAnswers.answer }).from(applyAnswers).where(eq(applyAnswers.jobId, jobId));
}

export async function rememberAnswer(jobId: string | null, question: string, answer: string, source: "ai" | "you" | "profile") {
  if (!jobId || !answer.trim()) return;
  await db.insert(applyAnswers).values({ jobId, question: question.slice(0, 1000), answer: answer.slice(0, 8000), source });
}

// ------------------------------------------------------------------ resume PDF

const pdfCache = new Map<string, Buffer>();

/** The resume to send for a job: the one tailored for it, else your master resume. */
export async function resumeForJob(jobId: string | null): Promise<{ id: string; title: string; fullName: string | null; latex: string | null } | null> {
  if (jobId) {
    const job = await db.select({ resumeId: jobs.resumeId }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
    const tailoredId = job[0]?.resumeId;
    const tailored = tailoredId
      ? await db.select({ id: resumes.id, title: resumes.title, fullName: resumes.fullName, latex: resumes.latex }).from(resumes).where(eq(resumes.id, tailoredId)).limit(1)
      : [];
    if (tailored[0]?.latex?.trim()) return tailored[0];
    const forJob = await db
      .select({ id: resumes.id, title: resumes.title, fullName: resumes.fullName, latex: resumes.latex })
      .from(resumes)
      .where(and(eq(resumes.targetJobId, jobId), isNotNull(resumes.latex)))
      .orderBy(desc(resumes.updatedAt))
      .limit(1);
    if (forJob[0]?.latex?.trim()) return forJob[0];
  }
  const master = await db
    .select({ id: resumes.id, title: resumes.title, fullName: resumes.fullName, latex: resumes.latex })
    .from(resumes)
    .orderBy(desc(resumes.isMaster), desc(resumes.updatedAt));
  return master.find((r) => r.latex?.trim()) ?? master[0] ?? null;
}

export async function resumePdf(resumeId: string): Promise<{ pdf: Buffer; fileName: string } | { error: string }> {
  const row = await db.select({ latex: resumes.latex, fullName: resumes.fullName, title: resumes.title }).from(resumes).where(eq(resumes.id, resumeId)).limit(1);
  const r = row[0];
  if (!r) return { error: "Resume not found" };
  if (!r.latex?.trim()) return { error: "This resume has no LaTeX version yet. Open it in Job Finder and use the LaTeX & PDF tab." };
  const hash = createHash("sha256").update(r.latex).digest("hex");
  const fileName = `${(r.fullName || r.title).replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "Resume"}_Resume.pdf`;
  const cached = pdfCache.get(hash);
  if (cached) return { pdf: cached, fileName };
  const result = await compileLatex(r.latex);
  if (!result.ok) return { error: `The resume didn't compile: ${result.error}` };
  pdfCache.set(hash, result.pdf);
  if (pdfCache.size > 20) pdfCache.delete(pdfCache.keys().next().value!);
  return { pdf: result.pdf, fileName };
}

// --------------------------------------------------------------- mark applied

/** Marks the job for this application page as applied (saving a found job to My jobs first). */
export async function markAppliedByUrl(url: string): Promise<{ jobId: string } | { error: string }> {
  const match = await findJobForUrl(url);
  if (!match) return { error: "This page isn't one of your saved or found jobs yet. Save it first." };
  let jobId = match.jobId;
  if (!jobId && match.foundId) {
    const saved = await saveFoundJob(match.foundId);
    if (!saved.ok) return { error: saved.error };
    jobId = saved.data.jobId;
  }
  if (!jobId) return { error: "Couldn't find the job" };
  const r = await updateJobStatus(jobId, "applied");
  if (!r.ok) return { error: r.error };
  // Remember the application page for next time.
  await db.update(jobs).set({ applyUrl: url }).where(and(eq(jobs.id, jobId), isNull(jobs.applyUrl)));
  return { jobId };
}

