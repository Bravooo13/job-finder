"use server";

import { eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { findBoards, type FoundBoard } from "@/lib/boards/detect";
import { db } from "@/lib/db";
import { companies, companyBoards, discoveredJobs, jobs, searches } from "@/lib/db/schema";
import { parseLocation } from "@/lib/geo";
import { PROVIDER_LABELS, type Provider } from "@/lib/boards/types";
import { startSearchRun, stopSearch } from "./runner";
import { searchFormSchema, splitList, type SearchFormValues } from "./schema";
import { suggestKeywords } from "./queries";

function revalidateSearches(id?: string) {
  revalidatePath("/searches");
  revalidatePath("/found");
  revalidatePath("/dashboard");
  revalidatePath("/map");
  if (id) revalidatePath(`/searches/${id}`);
}

function toRow(v: SearchFormValues) {
  return {
    name: v.name,
    titles: splitList(v.titles),
    keywords: splitList(v.keywords),
    excludeWords: splitList(v.excludeWords),
    locations: splitList(v.locations),
    includeRemote: v.includeRemote,
    levels: v.levels,
    sources: v.sources,
    companyScope: v.companyScope,
    resumeId: v.resumeId || null,
    minScore: v.minScore,
    scheduleHour: v.scheduleHour >= 0 ? v.scheduleHour : null,
  };
}

export async function createSearch(input: SearchFormValues): Promise<ActionResult<{ id: string }>> {
  const parsed = searchFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid search" };
  if (!splitList(parsed.data.titles).length) return { ok: false, error: "Add at least one job title to look for" };
  const [row] = await db.insert(searches).values(toRow(parsed.data)).returning({ id: searches.id });
  revalidateSearches();
  return { ok: true, data: { id: row.id } };
}

export async function updateSearch(id: string, input: SearchFormValues): Promise<ActionResult> {
  const parsed = searchFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid search" };
  if (!splitList(parsed.data.titles).length) return { ok: false, error: "Add at least one job title to look for" };
  await db.update(searches).set(toRow(parsed.data)).where(eq(searches.id, id));
  revalidateSearches(id);
  return { ok: true, data: null };
}

export async function deleteSearch(id: string): Promise<ActionResult> {
  stopSearch(id);
  // Keep saved and dismissed finds; drop the unreviewed ones from this search.
  await db.delete(discoveredJobs).where(sql`${discoveredJobs.searchId} = ${id} and ${discoveredJobs.status} = 'new'`);
  await db.delete(searches).where(eq(searches.id, id));
  revalidateSearches();
  return { ok: true, data: null };
}

export async function runSearch(id: string): Promise<ActionResult<{ runId: string }>> {
  try {
    const runId = await startSearchRun(id, "manual");
    revalidateSearches(id);
    return { ok: true, data: { runId } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't start the search" };
  }
}

export async function stopRun(id: string): Promise<ActionResult> {
  stopSearch(id);
  revalidateSearches(id);
  return { ok: true, data: null };
}

export async function keywordsFromResume(resumeId: string): Promise<ActionResult<string[]>> {
  return { ok: true, data: await suggestKeywords(resumeId) };
}

// ------------------------------------------------------------ found jobs

async function findOrCreateCompany(name: string): Promise<string> {
  const existing = await db
    .select({ id: companies.id })
    .from(companies)
    .where(sql`lower(${companies.name}) = ${name.toLowerCase()}`)
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [created] = await db.insert(companies).values({ name }).returning({ id: companies.id });
  return created.id;
}

export async function saveFoundJob(id: string): Promise<ActionResult<{ jobId: string }>> {
  const found = await db.query.discoveredJobs.findFirst({ where: eq(discoveredJobs.id, id) });
  if (!found) return { ok: false, error: "That job is gone" };
  if (found.jobId) return { ok: true, data: { jobId: found.jobId } };
  const companyId = await findOrCreateCompany(found.company);
  const [job] = await db
    .insert(jobs)
    .values({
      title: found.title,
      companyId,
      location: found.location,
      workplace: found.workplace,
      jobType: found.jobType,
      status: "new",
      source: PROVIDER_LABELS[found.provider as Provider] ?? found.provider,
      url: found.url,
      description: found.description,
      salary: found.salary,
      skills: found.reasons.keywords,
      matchScore: found.score,
      postedAt: found.postedAt,
      lat: found.lat,
      lng: found.lng,
      place: found.place,
      remote: found.remote,
    })
    .returning({ id: jobs.id });
  await db.update(discoveredJobs).set({ status: "saved", jobId: job.id }).where(eq(discoveredJobs.id, id));
  revalidateSearches();
  revalidatePath("/jobs");
  return { ok: true, data: { jobId: job.id } };
}

export async function setFoundStatus(ids: string[], status: "new" | "dismissed"): Promise<ActionResult> {
  if (!ids.length) return { ok: true, data: null };
  await db.update(discoveredJobs).set({ status }).where(inArray(discoveredJobs.id, ids));
  revalidateSearches();
  return { ok: true, data: null };
}

// ------------------------------------------------------------- companies

export async function lookUpCompany(input: string): Promise<ActionResult<FoundBoard[]>> {
  if (!input.trim()) return { ok: false, error: "Type a company name or paste its careers link" };
  const found = await findBoards(input);
  if (!found.length) {
    return {
      ok: false,
      error:
        "Couldn't find a Greenhouse, Lever, Ashby or Workday board for that. Try pasting a link to one of the company's job postings.",
    };
  }
  return { ok: true, data: found };
}

export async function addCompanyBoard(board: FoundBoard): Promise<ActionResult> {
  await db
    .insert(companyBoards)
    .values({
      provider: board.provider,
      token: board.token,
      name: board.name,
      host: board.host ?? null,
      site: board.site ?? "",
      careersUrl: board.careersUrl,
      jobCount: board.jobCount,
    })
    .onConflictDoUpdate({
      target: [companyBoards.provider, companyBoards.token, companyBoards.site],
      set: { name: board.name, jobCount: board.jobCount, careersUrl: board.careersUrl },
    });
  revalidatePath("/companies");
  return { ok: true, data: null };
}

export async function removeCompanyBoard(id: string): Promise<ActionResult> {
  await db.delete(companyBoards).where(eq(companyBoards.id, id));
  revalidatePath("/companies");
  return { ok: true, data: null };
}

// ------------------------------------------------------------------- map

export async function lookUpCity(query: string) {
  const { searchCities } = await import("@/lib/geo");
  return searchCities(query, 6);
}

/** Fills in map coordinates for tracked jobs that don't have them yet. */
export async function geocodeTrackedJobs() {
  const rows = await db
    .select({ id: jobs.id, location: jobs.location })
    .from(jobs)
    .where(sql`${jobs.place} is null and ${jobs.location} is not null`);
  for (const r of rows) {
    const loc = parseLocation(r.location);
    const place = loc.places[0];
    await db
      .update(jobs)
      .set({ lat: place?.lat ?? null, lng: place?.lng ?? null, place: place?.label ?? "", remote: loc.remote })
      .where(eq(jobs.id, r.id));
  }
}

export async function getFoundDescription(id: string): Promise<string | null> {
  const row = await db
    .select({ description: discoveredJobs.description })
    .from(discoveredJobs)
    .where(eq(discoveredJobs.id, id))
    .limit(1);
  return row[0]?.description ?? null;
}
