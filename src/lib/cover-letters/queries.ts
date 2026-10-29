import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, coverLetters, jobs, resumes } from "@/lib/db/schema";

export async function listCoverLetters(jobId?: string) {
  return db
    .select({
      id: coverLetters.id,
      title: coverLetters.title,
      company: coverLetters.company,
      role: coverLetters.role,
      jobId: coverLetters.jobId,
      jobTitle: jobs.title,
      jobCompany: companies.name,
      resumeTitle: resumes.title,
      content: coverLetters.content,
      createdAt: coverLetters.createdAt,
      updatedAt: coverLetters.updatedAt,
    })
    .from(coverLetters)
    .leftJoin(jobs, eq(coverLetters.jobId, jobs.id))
    .leftJoin(companies, eq(jobs.companyId, companies.id))
    .leftJoin(resumes, eq(coverLetters.resumeId, resumes.id))
    .where(jobId ? eq(coverLetters.jobId, jobId) : undefined)
    .orderBy(desc(coverLetters.updatedAt));
}

export type CoverLetterListItem = Awaited<ReturnType<typeof listCoverLetters>>[number];

export async function getCoverLetter(id: string) {
  const letter = await db.query.coverLetters.findFirst({ where: eq(coverLetters.id, id) });
  if (!letter) return null;
  const [job, resume] = await Promise.all([
    letter.jobId
      ? db
          .select({ id: jobs.id, title: jobs.title, company: companies.name, description: jobs.description, url: jobs.url })
          .from(jobs)
          .innerJoin(companies, eq(jobs.companyId, companies.id))
          .where(eq(jobs.id, letter.jobId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : null,
    letter.resumeId
      ? db
          .select({ id: resumes.id, title: resumes.title, fullName: resumes.fullName, email: resumes.email, phone: resumes.phone, location: resumes.location })
          .from(resumes)
          .where(eq(resumes.id, letter.resumeId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : null,
  ]);
  return { ...letter, job, resume };
}

export type CoverLetterWithLinks = NonNullable<Awaited<ReturnType<typeof getCoverLetter>>>;

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
