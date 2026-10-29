import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { resumeEntries, resumes, settings } from "@/lib/db/schema";
import { applyProfileSchema, type ApplyProfile } from "./profile-schema";

const KEY = "apply.profile";

/** Starting values taken from your master resume, used for any answer you haven't set. */
async function defaultsFromResume(): Promise<Partial<ApplyProfile>> {
  const master =
    (await db.query.resumes.findFirst({ where: eq(resumes.isMaster, true) })) ??
    (await db.query.resumes.findFirst());
  if (!master) return {};
  const [first, ...rest] = (master.fullName ?? "").trim().split(/\s+/);
  const loc = (master.location ?? "").split(",").map((s) => s.trim());
  const education = await db
    .select()
    .from(resumeEntries)
    .where(eq(resumeEntries.resumeId, master.id))
    .orderBy(asc(resumeEntries.sortOrder));
  const schools = education
    .filter((e) => e.section === "education")
    .sort((a, b) => (b.endDate ?? b.startDate ?? "").localeCompare(a.endDate ?? a.startDate ?? ""));
  const [current, previous] = schools;
  const degreeOf = (title?: string | null) => (title ?? "").split(/,| in /i)[0]?.trim() ?? "";
  const majorOf = (title?: string | null) => /\bin\s+([^,(]+)/i.exec(title ?? "")?.[1]?.trim() ?? "";
  const gpa = /gpa[^0-9]{0,15}([0-4]\.\d{1,2})/i.exec(`${current?.description ?? ""} ${previous?.description ?? ""}`)?.[1] ?? "";
  return {
    firstName: first ?? "",
    lastName: rest.join(" "),
    email: master.email ?? "",
    phone: master.phone ?? "",
    city: loc[0] ?? "",
    state: loc[1] ?? "",
    country: "United States",
    linkedin: master.linkedin ?? "",
    github: master.github ?? "",
    website: master.website ?? "",
    school: current?.organization ?? "",
    degree: degreeOf(current?.title),
    major: majorOf(current?.title),
    gpa,
    graduation: current?.endDate ?? "",
    previousSchool: previous?.organization ?? "",
    previousDegree: previous?.title ?? "",
    previousGraduation: previous?.endDate ?? "",
    over18: "yes",
    hearAbout: "LinkedIn",
  };
}

/** Your saved answers, with gaps filled in from your master resume. */
export async function getApplyProfile(): Promise<ApplyProfile> {
  const row = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, KEY)).limit(1);
  const saved = applyProfileSchema.partial().safeParse(row[0]?.value ?? {});
  const defaults = await defaultsFromResume();
  const merged: Record<string, unknown> = { ...defaults };
  for (const [k, v] of Object.entries(saved.success ? saved.data : {})) {
    if (v !== "" && v !== undefined && !(Array.isArray(v) && v.length === 0 && k !== "custom")) merged[k] = v;
    if (k === "custom") merged[k] = v;
  }
  return applyProfileSchema.parse(merged);
}

/** What you saved yourself (without the resume defaults). */
export async function getSavedApplyProfile(): Promise<Partial<ApplyProfile>> {
  const row = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, KEY)).limit(1);
  const saved = applyProfileSchema.partial().safeParse(row[0]?.value ?? {});
  return saved.success ? saved.data : {};
}

export async function saveApplyProfile(input: unknown): Promise<ApplyProfile> {
  const parsed = applyProfileSchema.partial().parse(input);
  const current = await getSavedApplyProfile();
  const value = { ...current, ...parsed };
  await db
    .insert(settings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
  return getApplyProfile();
}
