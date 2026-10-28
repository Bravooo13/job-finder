import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, jobNotes, jobs, resumes } from "@/lib/db/schema";

export async function listJobs() {
  return db
    .select({
      id: jobs.id,
      title: jobs.title,
      company: companies.name,
      companyId: jobs.companyId,
      location: jobs.location,
      workplace: jobs.workplace,
      jobType: jobs.jobType,
      status: jobs.status,
      source: jobs.source,
      url: jobs.url,
      salary: jobs.salary,
      matchScore: jobs.matchScore,
      dateApplied: jobs.dateApplied,
      dueDate: jobs.dueDate,
      createdAt: jobs.createdAt,
      updatedAt: jobs.updatedAt,
    })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .orderBy(desc(jobs.createdAt));
}

export type JobListItem = Awaited<ReturnType<typeof listJobs>>[number];

export async function getJob(id: string) {
  const row = await db.query.jobs.findFirst({
    where: eq(jobs.id, id),
    with: {
      company: true,
      resume: { columns: { id: true, title: true } },
      notes: { orderBy: [desc(jobNotes.createdAt)] },
    },
  });
  return row ?? null;
}

export type JobWithDetails = NonNullable<Awaited<ReturnType<typeof getJob>>>;

export async function listCompanyNames(): Promise<string[]> {
  const rows = await db
    .select({ name: companies.name })
    .from(companies)
    .orderBy(asc(companies.name));
  return rows.map((r) => r.name);
}

export async function listResumeOptions() {
  return db
    .select({ id: resumes.id, title: resumes.title, isMaster: resumes.isMaster })
    .from(resumes)
    .orderBy(desc(resumes.isMaster), asc(resumes.title));
}

export async function findJobByUrl(url: string) {
  const row = await db
    .select({ id: jobs.id, title: jobs.title })
    .from(jobs)
    .where(eq(jobs.url, url))
    .limit(1);
  return row[0] ?? null;
}
