import "server-only";
import { noteActivity } from "@/lib/control/log";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { resumeEntries, resumeSkillGroups, resumes, settings } from "@/lib/db/schema";
import { applyProfileSchema, onlyProvided, type ApplyProfile } from "./profile-schema";

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
    schoolStart: current?.startDate ?? "",
    graduation: current?.endDate ?? "",
    previousSchool: previous?.organization ?? "",
    previousDegree: previous?.title ?? "",
    previousMajor: majorOf(previous?.title),
    previousStart: previous?.startDate ?? "",
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

/** Facts from your master resume the answer engine uses: your skills and the places you've worked. */
export async function resumeFacts(): Promise<{ skills: string[]; employers: string[] }> {
  const master =
    (await db.query.resumes.findFirst({ where: eq(resumes.isMaster, true) })) ??
    (await db.query.resumes.findFirst());
  if (!master) return { skills: [], employers: [] };
  const [groups, entries] = await Promise.all([
    db.select({ skills: resumeSkillGroups.skills }).from(resumeSkillGroups).where(eq(resumeSkillGroups.resumeId, master.id)),
    db.select({ section: resumeEntries.section, organization: resumeEntries.organization }).from(resumeEntries).where(eq(resumeEntries.resumeId, master.id)),
  ]);
  const skills = [...new Set(groups.flatMap((g) => g.skills ?? []).map((s) => s.trim()).filter(Boolean))];
  const employers = [
    ...new Set(entries.filter((e) => e.section === "experience" || e.section === "volunteer").map((e) => (e.organization ?? "").trim()).filter(Boolean)),
  ];
  return { skills, employers };
}

/** What you saved yourself (without the resume defaults). */
export async function getSavedApplyProfile(): Promise<Partial<ApplyProfile>> {
  const row = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, KEY)).limit(1);
  const saved = applyProfileSchema.partial().safeParse(row[0]?.value ?? {});
  return saved.success ? saved.data : {};
}

/** Saves the answers you send and keeps the rest (agents can send a few fields). */
export async function saveApplyProfile(input: unknown): Promise<ApplyProfile> {
  const parsed = onlyProvided(applyProfileSchema.partial().parse(input), input);
  const current = await getSavedApplyProfile();
  const value = { ...current, ...parsed };
  await db
    .insert(settings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
  const changed = Object.keys(parsed).filter((k) => JSON.stringify((current as Record<string, unknown>)[k]) !== JSON.stringify((parsed as Record<string, unknown>)[k]));
  if (changed.length)
    await noteActivity({ action: "update_apply_profile", title: `Changed My answers: ${changed.slice(0, 6).join(", ")}${changed.length > 6 ? ` and ${changed.length - 6} more` : ""}`, detail: { fields: changed } });
  return getApplyProfile();
}
