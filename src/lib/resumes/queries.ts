import "server-only";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  companies,
  jobs,
  resumeEntries,
  resumeSkillGroups,
  resumes,
} from "@/lib/db/schema";

export async function listResumes() {
  return db
    .select({
      id: resumes.id,
      title: resumes.title,
      isMaster: resumes.isMaster,
      headline: resumes.headline,
      targetJobId: resumes.targetJobId,
      targetJobTitle: jobs.title,
      targetCompany: companies.name,
      updatedAt: resumes.updatedAt,
      entryCount: sql<number>`(select count(*) from ${resumeEntries} where ${resumeEntries.resumeId} = ${resumes.id})`,
      skillCount: sql<number>`(select count(*) from ${resumeSkillGroups} where ${resumeSkillGroups.resumeId} = ${resumes.id})`,
    })
    .from(resumes)
    .leftJoin(jobs, eq(resumes.targetJobId, jobs.id))
    .leftJoin(companies, eq(jobs.companyId, companies.id))
    .orderBy(desc(resumes.isMaster), desc(resumes.updatedAt));
}

export type ResumeListItem = Awaited<ReturnType<typeof listResumes>>[number];

export async function getResume(id: string) {
  const resume = await db.query.resumes.findFirst({
    where: eq(resumes.id, id),
    with: {
      entries: { orderBy: [asc(resumeEntries.sortOrder), asc(resumeEntries.createdAt)] },
      skillGroups: {
        orderBy: [asc(resumeSkillGroups.sortOrder), asc(resumeSkillGroups.createdAt)],
      },
    },
  });
  if (!resume) return null;
  let targetJob: { id: string; title: string; company: string } | null = null;
  if (resume.targetJobId) {
    const row = await db
      .select({ id: jobs.id, title: jobs.title, company: companies.name })
      .from(jobs)
      .innerJoin(companies, eq(jobs.companyId, companies.id))
      .where(eq(jobs.id, resume.targetJobId))
      .limit(1);
    targetJob = row[0] ?? null;
  }
  return { ...resume, targetJob };
}

export type ResumeWithSections = NonNullable<Awaited<ReturnType<typeof getResume>>>;

export async function listJobOptions() {
  return db
    .select({ id: jobs.id, title: jobs.title, company: companies.name })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .orderBy(desc(jobs.createdAt));
}
