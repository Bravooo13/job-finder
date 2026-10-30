"use server";

import { and, asc, desc, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { noteActivity } from "@/lib/control/log";
import { db } from "@/lib/db";
import { jobs, resumeEntries, resumeSkillGroups, resumes } from "@/lib/db/schema";
import { parseSkills } from "@/lib/jobs/schema";
import { blankLatex, resumeToLatex } from "@/lib/latex/template";
import {
  newResumeSchema,
  resumeBasicsSchema,
  resumeEntrySchema,
  skillGroupSchema,
  type NewResumeValues,
  type ResumeBasicsValues,
  type ResumeEntryValues,
  type SkillGroupValues,
} from "./schema";

function revalidateResume(id?: string) {
  revalidatePath("/profile");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/profile/resumes/${id}`);
}

const emptyToNull = (v: string) => (v.trim() ? v.trim() : null);

async function touch(resumeId: string) {
  await db.update(resumes).set({ updatedAt: new Date() }).where(eq(resumes.id, resumeId));
}

// ---------------------------------------------------------------- resumes

export async function createResume(
  input: NewResumeValues,
): Promise<ActionResult<{ id: string }>> {
  const parsed = newResumeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { title, copyFromId, targetJobId } = parsed.data;

  const id = await db.transaction(async (tx) => {
    const anyResume = await tx.select({ id: resumes.id }).from(resumes).limit(1);
    const isFirst = anyResume.length === 0;

    const source = copyFromId
      ? await tx.query.resumes.findFirst({
          where: eq(resumes.id, copyFromId),
          with: { entries: true, skillGroups: true },
        })
      : undefined;

    const [created] = await tx
      .insert(resumes)
      .values({
        title,
        isMaster: isFirst,
        basedOnId: source?.id ?? null,
        targetJobId: targetJobId || null,
        fullName: source?.fullName ?? null,
        headline: source?.headline ?? null,
        email: source?.email ?? null,
        phone: source?.phone ?? null,
        location: source?.location ?? null,
        website: source?.website ?? null,
        linkedin: source?.linkedin ?? null,
        github: source?.github ?? null,
        summary: source?.summary ?? null,
        industry: source?.industry ?? null,
        latex: source?.latex ?? null,
      })
      .returning({ id: resumes.id });

    if (source?.entries.length) {
      await tx.insert(resumeEntries).values(
        source.entries.map((entry) => ({
          section: entry.section,
          title: entry.title,
          organization: entry.organization,
          location: entry.location,
          startDate: entry.startDate,
          endDate: entry.endDate,
          current: entry.current,
          url: entry.url,
          description: entry.description,
          sortOrder: entry.sortOrder,
          resumeId: created.id,
        })),
      );
    }
    if (source?.skillGroups.length) {
      await tx.insert(resumeSkillGroups).values(
        source.skillGroups.map((group) => ({
          name: group.name,
          skills: group.skills,
          sortOrder: group.sortOrder,
          resumeId: created.id,
        })),
      );
    }
    if (targetJobId) {
      // Link the job to the resume tailored for it.
      await tx.update(jobs).set({ resumeId: created.id }).where(eq(jobs.id, targetJobId));
    }
    return created.id;
  });

  revalidateResume();
  if (targetJobId) revalidatePath(`/jobs/${targetJobId}`);
  return { ok: true, data: { id } };
}

export async function updateResumeBasics(
  id: string,
  input: ResumeBasicsValues,
): Promise<ActionResult> {
  const parsed = resumeBasicsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;
  await db
    .update(resumes)
    .set({
      title: v.title,
      fullName: emptyToNull(v.fullName),
      headline: emptyToNull(v.headline),
      email: emptyToNull(v.email),
      phone: emptyToNull(v.phone),
      location: emptyToNull(v.location),
      website: emptyToNull(v.website),
      linkedin: emptyToNull(v.linkedin),
      github: emptyToNull(v.github),
      summary: emptyToNull(v.summary),
    })
    .where(eq(resumes.id, id));
  revalidateResume(id);
  return { ok: true, data: null };
}

export async function setMasterResume(id: string): Promise<ActionResult> {
  await db.transaction(async (tx) => {
    await tx.update(resumes).set({ isMaster: false }).where(ne(resumes.id, id));
    await tx.update(resumes).set({ isMaster: true }).where(eq(resumes.id, id));
  });
  revalidateResume(id);
  return { ok: true, data: null };
}

export async function deleteResume(id: string): Promise<ActionResult> {
  await db.transaction(async (tx) => {
    const target = await tx.query.resumes.findFirst({ where: eq(resumes.id, id) });
    if (!target) return;
    await tx.update(jobs).set({ resumeId: null }).where(eq(jobs.resumeId, id));
    await tx.delete(resumeEntries).where(eq(resumeEntries.resumeId, id));
    await tx.delete(resumeSkillGroups).where(eq(resumeSkillGroups.resumeId, id));
    await tx.delete(resumes).where(eq(resumes.id, id));
    if (target.isMaster) {
      const next = await tx
        .select({ id: resumes.id })
        .from(resumes)
        .orderBy(desc(resumes.updatedAt))
        .limit(1);
      if (next[0]) {
        await tx.update(resumes).set({ isMaster: true }).where(eq(resumes.id, next[0].id));
      }
    }
  });
  revalidateResume();
  revalidatePath("/jobs");
  return { ok: true, data: null };
}

// ---------------------------------------------------------------- entries

function entryRow(v: ResumeEntryValues) {
  return {
    section: v.section,
    title: v.title,
    organization: emptyToNull(v.organization),
    location: emptyToNull(v.location),
    startDate: emptyToNull(v.startDate),
    endDate: v.current ? null : emptyToNull(v.endDate),
    current: v.current,
    url: emptyToNull(v.url),
    description: emptyToNull(v.description),
  };
}

export async function saveResumeEntry(
  resumeId: string,
  entryId: string | null,
  input: ResumeEntryValues,
): Promise<ActionResult> {
  const parsed = resumeEntrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (entryId) {
    await db
      .update(resumeEntries)
      .set(entryRow(parsed.data))
      .where(and(eq(resumeEntries.id, entryId), eq(resumeEntries.resumeId, resumeId)));
  } else {
    const last = await db
      .select({ sortOrder: resumeEntries.sortOrder })
      .from(resumeEntries)
      .where(
        and(eq(resumeEntries.resumeId, resumeId), eq(resumeEntries.section, parsed.data.section)),
      )
      .orderBy(desc(resumeEntries.sortOrder))
      .limit(1);
    await db.insert(resumeEntries).values({
      ...entryRow(parsed.data),
      resumeId,
      sortOrder: (last[0]?.sortOrder ?? -1) + 1,
    });
  }
  await touch(resumeId);
  revalidateResume(resumeId);
  return { ok: true, data: null };
}

export async function deleteResumeEntry(resumeId: string, entryId: string): Promise<ActionResult> {
  await db
    .delete(resumeEntries)
    .where(and(eq(resumeEntries.id, entryId), eq(resumeEntries.resumeId, resumeId)));
  await touch(resumeId);
  revalidateResume(resumeId);
  return { ok: true, data: null };
}

export async function moveResumeEntry(
  resumeId: string,
  entryId: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  const entry = await db.query.resumeEntries.findFirst({
    where: and(eq(resumeEntries.id, entryId), eq(resumeEntries.resumeId, resumeId)),
  });
  if (!entry) return { ok: false, error: "Entry not found" };
  const siblings = await db
    .select({ id: resumeEntries.id })
    .from(resumeEntries)
    .where(and(eq(resumeEntries.resumeId, resumeId), eq(resumeEntries.section, entry.section)))
    .orderBy(asc(resumeEntries.sortOrder), asc(resumeEntries.createdAt));
  const ids = siblings.map((s) => s.id);
  const from = ids.indexOf(entryId);
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= ids.length) return { ok: true, data: null };
  [ids[from], ids[to]] = [ids[to], ids[from]];
  await db.transaction(async (tx) => {
    for (const [index, rowId] of ids.entries()) {
      await tx.update(resumeEntries).set({ sortOrder: index }).where(eq(resumeEntries.id, rowId));
    }
  });
  revalidateResume(resumeId);
  return { ok: true, data: null };
}

// ----------------------------------------------------------------- skills

export async function saveSkillGroup(
  resumeId: string,
  groupId: string | null,
  input: SkillGroupValues,
): Promise<ActionResult> {
  const parsed = skillGroupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const skills = parseSkills(parsed.data.skills);
  if (groupId) {
    await db
      .update(resumeSkillGroups)
      .set({ name: parsed.data.name, skills })
      .where(and(eq(resumeSkillGroups.id, groupId), eq(resumeSkillGroups.resumeId, resumeId)));
  } else {
    const last = await db
      .select({ sortOrder: resumeSkillGroups.sortOrder })
      .from(resumeSkillGroups)
      .where(eq(resumeSkillGroups.resumeId, resumeId))
      .orderBy(desc(resumeSkillGroups.sortOrder))
      .limit(1);
    await db.insert(resumeSkillGroups).values({
      resumeId,
      name: parsed.data.name,
      skills,
      sortOrder: (last[0]?.sortOrder ?? -1) + 1,
    });
  }
  await touch(resumeId);
  revalidateResume(resumeId);
  return { ok: true, data: null };
}

export async function deleteSkillGroup(resumeId: string, groupId: string): Promise<ActionResult> {
  await db
    .delete(resumeSkillGroups)
    .where(and(eq(resumeSkillGroups.id, groupId), eq(resumeSkillGroups.resumeId, resumeId)));
  await touch(resumeId);
  revalidateResume(resumeId);
  return { ok: true, data: null };
}

// ------------------------------------------------------------------ LaTeX

/** Saves the LaTeX source while you type (no page refresh). */
export async function saveResumeLatex(id: string, latex: string): Promise<ActionResult> {
  if (latex.length > 500_000) return { ok: false, error: "That document is too large" };
  await db.update(resumes).set({ latex }).where(eq(resumes.id, id));
  return { ok: true, data: null };
}

/** LaTeX built from the resume's Content tab (not saved until you keep it). */
export async function latexFromContent(id: string): Promise<ActionResult<string>> {
  const resume = await db.query.resumes.findFirst({
    where: eq(resumes.id, id),
    with: {
      entries: { orderBy: [asc(resumeEntries.sortOrder), asc(resumeEntries.createdAt)] },
      skillGroups: { orderBy: [asc(resumeSkillGroups.sortOrder), asc(resumeSkillGroups.createdAt)] },
    },
  });
  if (!resume) return { ok: false, error: "Resume not found" };
  const hasContent = resume.entries.length || resume.skillGroups.length || resume.summary;
  return { ok: true, data: hasContent ? resumeToLatex(resume) : blankLatex(resume.fullName ?? undefined) };
}

export async function setResumeIndustry(id: string, industry: string): Promise<ActionResult> {
  await db.update(resumes).set({ industry: industry.trim().slice(0, 120) || null }).where(eq(resumes.id, id));
  revalidateResume(id);
  return { ok: true, data: null };
}

/** Copies a resume as a new version aimed at an industry, with LaTeX ready to tailor. */
export async function createIndustryVersion(input: {
  fromId: string;
  industry: string;
  title: string;
  targetJobId: string;
}): Promise<ActionResult<{ id: string }>> {
  const industry = input.industry.trim().slice(0, 120);
  if (!industry) return { ok: false, error: "Pick or type an industry" };
  const created = await createResume({
    title: input.title.trim() || `Resume – ${industry}`,
    copyFromId: input.fromId,
    targetJobId: input.targetJobId,
  });
  if (!created.ok) return created;
  const id = created.data.id;
  const copy = await db.query.resumes.findFirst({ where: eq(resumes.id, id), columns: { latex: true } });
  let latex = copy?.latex ?? null;
  if (!latex?.trim()) {
    const generated = await latexFromContent(id);
    latex = generated.ok ? generated.data : null;
  }
  await db.update(resumes).set({ industry, latex }).where(eq(resumes.id, id));
  await noteActivity({ action: "make_resume_version", title: `Made the resume version “${input.title.trim() || `Resume – ${industry}`}” for ${industry}`, detail: { resumeId: id, industry } });
  revalidateResume(id);
  return { ok: true, data: { id } };
}
