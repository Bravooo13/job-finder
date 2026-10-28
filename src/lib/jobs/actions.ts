"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { APPLIED_STATUSES, JOB_STATUS_VALUES, type JobStatus } from "@/lib/constants";
import { db } from "@/lib/db";
import { companies, jobNotes, jobs } from "@/lib/db/schema";
import { importJobFromUrl, type ImportResult } from "@/lib/import";
import { fromDateInput, normalizeUrl } from "@/lib/utils";
import { findJobByUrl } from "./queries";
import { jobFormSchema, parseSkills, type JobFormValues } from "./schema";


function revalidateJobs(id?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/jobs");
  if (id) revalidatePath(`/jobs/${id}`);
}

async function findOrCreateCompany(name: string): Promise<string> {
  const existing = await db
    .select({ id: companies.id })
    .from(companies)
    .where(sql`lower(${companies.name}) = ${name.toLowerCase()}`)
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [created] = await db
    .insert(companies)
    .values({ name })
    .returning({ id: companies.id });
  return created.id;
}

function toRow(values: JobFormValues) {
  const appliedStatus = APPLIED_STATUSES.includes(values.status);
  let dateApplied = fromDateInput(values.dateApplied);
  // Marking a job Applied without a date means "today".
  if (!dateApplied && values.status === "applied") dateApplied = new Date();
  // Picking a date on a job that hasn't moved past New/Draft means it was sent.
  const status: JobStatus =
    dateApplied && !appliedStatus && ["new", "draft"].includes(values.status)
      ? "applied"
      : values.status;
  const postedAt = values.postedAt ? new Date(values.postedAt) : null;
  return {
    title: values.title,
    location: values.location || null,
    workplace: values.workplace || null,
    jobType: values.jobType || null,
    status,
    source: values.source || null,
    url: normalizeUrl(values.url),
    salary: values.salary || null,
    description: values.description.trim() || null,
    skills: parseSkills(values.skills),
    dateApplied,
    dueDate: fromDateInput(values.dueDate),
    resumeId: values.resumeId || null,
    postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null,
  };
}

export async function createJob(
  input: JobFormValues,
): Promise<ActionResult<{ id: string }>> {
  const parsed = jobFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid job" };
  }
  const companyId = await findOrCreateCompany(parsed.data.company);
  const [row] = await db
    .insert(jobs)
    .values({ ...toRow(parsed.data), companyId })
    .returning({ id: jobs.id });
  revalidateJobs();
  return { ok: true, data: { id: row.id } };
}

export async function updateJob(
  id: string,
  input: JobFormValues,
): Promise<ActionResult> {
  const parsed = jobFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid job" };
  }
  const companyId = await findOrCreateCompany(parsed.data.company);
  await db
    .update(jobs)
    .set({ ...toRow(parsed.data), companyId })
    .where(eq(jobs.id, id));
  revalidateJobs(id);
  return { ok: true, data: null };
}

export async function updateJobStatus(
  id: string,
  status: string,
): Promise<ActionResult> {
  const parsed = z.enum(JOB_STATUS_VALUES).safeParse(status);
  if (!parsed.success) return { ok: false, error: "Unknown status" };
  const current = await db
    .select({ dateApplied: jobs.dateApplied })
    .from(jobs)
    .where(eq(jobs.id, id))
    .limit(1);
  if (!current[0]) return { ok: false, error: "Job not found" };
  await db
    .update(jobs)
    .set({
      status: parsed.data,
      ...(parsed.data === "applied" && !current[0].dateApplied
        ? { dateApplied: new Date() }
        : {}),
    })
    .where(eq(jobs.id, id));
  revalidateJobs(id);
  return { ok: true, data: null };
}

export async function deleteJob(id: string): Promise<ActionResult> {
  await db.transaction(async (tx) => {
    await tx.delete(jobNotes).where(eq(jobNotes.jobId, id));
    await tx.delete(jobs).where(eq(jobs.id, id));
  });
  revalidateJobs();
  return { ok: true, data: null };
}

export async function importJob(
  url: string,
): Promise<ImportResult & { duplicate?: { id: string; title: string } }> {
  const result = await importJobFromUrl(url);
  const duplicate =
    (await findJobByUrl(normalizeUrl(url) ?? url)) ??
    (result.ok ? await findJobByUrl(result.job.url) : null);
  return duplicate ? { ...result, duplicate } : result;
}

// ------------------------------------------------------------------- notes

const noteSchema = z.string().trim().min(1, "Note is empty").max(20_000);

export async function addNote(jobId: string, content: string): Promise<ActionResult> {
  const parsed = noteSchema.safeParse(content);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  await db.insert(jobNotes).values({ jobId, content: parsed.data });
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true, data: null };
}

export async function updateNote(
  id: string,
  jobId: string,
  content: string,
): Promise<ActionResult> {
  const parsed = noteSchema.safeParse(content);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  await db
    .update(jobNotes)
    .set({ content: parsed.data })
    .where(and(eq(jobNotes.id, id), eq(jobNotes.jobId, jobId)));
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true, data: null };
}

export async function deleteNote(id: string, jobId: string): Promise<ActionResult> {
  await db.delete(jobNotes).where(and(eq(jobNotes.id, id), eq(jobNotes.jobId, jobId)));
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true, data: null };
}
