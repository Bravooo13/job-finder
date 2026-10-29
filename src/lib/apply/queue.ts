import "server-only";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { applyAnswers, companies, coverLetters, jobs, resumes } from "@/lib/db/schema";

/** Saved jobs you haven't applied to yet, with what's ready for each application. */
export async function applyQueue(statuses: string[] = ["new", "draft"]) {
  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      company: companies.name,
      status: jobs.status,
      url: jobs.url,
      applyUrl: jobs.applyUrl,
      location: jobs.location,
      matchScore: jobs.matchScore,
      visa: jobs.visa,
      visaNote: jobs.visaNote,
      dueDate: jobs.dueDate,
      postedAt: jobs.postedAt,
      createdAt: jobs.createdAt,
      resumeId: jobs.resumeId,
      resumeTitle: resumes.title,
      resumeHasLatex: sql<number>`case when ${resumes.latex} is not null and length(${resumes.latex}) > 0 then 1 else 0 end`,
      letters: sql<number>`(select count(*) from ${coverLetters} where ${coverLetters.jobId} = ${jobs.id} and length(${coverLetters.content}) > 0)`,
      answers: sql<number>`(select count(*) from ${applyAnswers} where ${applyAnswers.jobId} = ${jobs.id})`,
    })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .leftJoin(resumes, eq(jobs.resumeId, resumes.id))
    .where(inArray(jobs.status, statuses))
    .orderBy(sql`${jobs.dueDate} is null`, jobs.dueDate, desc(jobs.matchScore), desc(jobs.createdAt));
  return rows.map((r) => ({ ...r, resumeHasLatex: Boolean(r.resumeHasLatex), letters: Number(r.letters), answers: Number(r.answers) }));
}

export type QueueItem = Awaited<ReturnType<typeof applyQueue>>[number];
