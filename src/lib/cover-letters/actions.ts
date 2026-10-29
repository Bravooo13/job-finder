"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { db } from "@/lib/db";
import { companies, coverLetters, discoveredJobs, jobs, resumes } from "@/lib/db/schema";
import { newCoverLetterSchema, type NewCoverLetterValues } from "./schema";

function revalidateLetters(id?: string, jobId?: string | null) {
  revalidatePath("/cover-letters");
  if (id) revalidatePath(`/cover-letters/${id}`);
  if (jobId) revalidatePath(`/jobs/${jobId}`);
}

export async function createCoverLetter(input: NewCoverLetterValues): Promise<ActionResult<{ id: string }>> {
  const parsed = newCoverLetterSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid letter" };
  const v = parsed.data;

  let company = v.company;
  let role = v.role;
  let jobDescription = v.jobDescription;
  let jobId: string | null = null;
  if (v.jobId) {
    const job = await db
      .select({ id: jobs.id, title: jobs.title, company: companies.name, description: jobs.description })
      .from(jobs)
      .innerJoin(companies, eq(jobs.companyId, companies.id))
      .where(eq(jobs.id, v.jobId))
      .limit(1);
    if (!job[0]) return { ok: false, error: "That job is gone" };
    jobId = job[0].id;
    company ||= job[0].company;
    role ||= job[0].title;
    jobDescription ||= job[0].description ?? "";
  } else if (v.foundId) {
    const found = await db.query.discoveredJobs.findFirst({ where: eq(discoveredJobs.id, v.foundId) });
    if (!found) return { ok: false, error: "That job is gone" };
    jobId = found.jobId;
    company ||= found.company;
    role ||= found.title;
    jobDescription ||= found.description ?? "";
  }

  let resumeId = v.resumeId || null;
  if (!resumeId) {
    const master = await db.select({ id: resumes.id }).from(resumes).where(eq(resumes.isMaster, true)).limit(1);
    resumeId = master[0]?.id ?? null;
  }

  const title = [company, role].filter(Boolean).join(" – ") || "Cover letter";
  const [row] = await db
    .insert(coverLetters)
    .values({
      title: title.slice(0, 200),
      company: company || null,
      role: role || null,
      jobId,
      resumeId,
      jobDescription: jobDescription || null,
      instructions: v.instructions || null,
    })
    .returning({ id: coverLetters.id });
  revalidateLetters(row.id, jobId);
  return { ok: true, data: { id: row.id } };
}

export async function updateCoverLetter(
  id: string,
  patch: { title?: string; content?: string; notes?: string; instructions?: string; jobDescription?: string },
): Promise<ActionResult> {
  const set: Partial<typeof coverLetters.$inferInsert> = {};
  if (patch.title !== undefined) set.title = patch.title.trim().slice(0, 200) || "Cover letter";
  if (patch.content !== undefined) set.content = patch.content.slice(0, 50_000);
  if (patch.notes !== undefined) set.notes = patch.notes.slice(0, 5000) || null;
  if (patch.instructions !== undefined) set.instructions = patch.instructions.slice(0, 3000) || null;
  if (patch.jobDescription !== undefined) set.jobDescription = patch.jobDescription.slice(0, 40000) || null;
  if (!Object.keys(set).length) return { ok: true, data: null };
  await db.update(coverLetters).set(set).where(eq(coverLetters.id, id));
  if (patch.title !== undefined) revalidateLetters(id);
  return { ok: true, data: null };
}

export async function deleteCoverLetter(id: string): Promise<ActionResult> {
  const row = await db.query.coverLetters.findFirst({ where: eq(coverLetters.id, id), columns: { jobId: true } });
  await db.delete(coverLetters).where(eq(coverLetters.id, id));
  revalidateLetters(undefined, row?.jobId);
  return { ok: true, data: null };
}

export async function duplicateCoverLetter(id: string): Promise<ActionResult<{ id: string }>> {
  const row = await db.query.coverLetters.findFirst({ where: eq(coverLetters.id, id) });
  if (!row) return { ok: false, error: "That letter is gone" };
  const { id: _old, createdAt: _c, updatedAt: _u, ...rest } = row;
  void _old;
  void _c;
  void _u;
  const [copy] = await db
    .insert(coverLetters)
    .values({ ...rest, title: `${row.title} (copy)`.slice(0, 200) })
    .returning({ id: coverLetters.id });
  revalidateLetters(copy.id, row.jobId);
  return { ok: true, data: { id: copy.id } };
}
