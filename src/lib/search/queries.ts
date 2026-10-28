import "server-only";
import { and, asc, desc, eq, gte, inArray, sql, type SQL } from "drizzle-orm";
import { directoryCounts } from "@/lib/boards/directory";
import { db } from "@/lib/db";
import {
  companyBoards,
  discoveredJobs,
  resumeEntries,
  resumeSkillGroups,
  resumes,
  searchRuns,
  searches,
} from "@/lib/db/schema";
import { hasTerm } from "./match";
import { boardsForSearch, isSearchRunning } from "./runner";
import { startScheduler } from "./scheduler";
import { KEYWORD_VOCABULARY } from "./schema";

// The server may have started before this code existed; make sure schedules run.
startScheduler();

export async function listSearches() {
  const rows = await db.select().from(searches).orderBy(desc(searches.createdAt));
  const ids = rows.map((r) => r.id);
  const [runs, counts] = await Promise.all([
    ids.length
      ? db.select().from(searchRuns).where(inArray(searchRuns.searchId, ids)).orderBy(desc(searchRuns.startedAt))
      : Promise.resolve([]),
    ids.length
      ? db
          .select({ searchId: discoveredJobs.searchId, status: discoveredJobs.status, n: sql<number>`count(*)` })
          .from(discoveredJobs)
          .where(inArray(discoveredJobs.searchId, ids))
          .groupBy(discoveredJobs.searchId, discoveredJobs.status)
      : Promise.resolve([]),
  ]);
  return rows.map((s) => ({
    ...s,
    running: isSearchRunning(s.id),
    lastRun: runs.find((r) => r.searchId === s.id) ?? null,
    found: {
      new: counts.find((c) => c.searchId === s.id && c.status === "new")?.n ?? 0,
      saved: counts.find((c) => c.searchId === s.id && c.status === "saved")?.n ?? 0,
    },
  }));
}

export type SearchListItem = Awaited<ReturnType<typeof listSearches>>[number];

export async function getSearch(id: string) {
  const search = await db.query.searches.findFirst({ where: eq(searches.id, id) });
  if (!search) return null;
  const [runs, boards] = await Promise.all([
    db.select().from(searchRuns).where(eq(searchRuns.searchId, id)).orderBy(desc(searchRuns.startedAt)).limit(20),
    boardsForSearch(search),
  ]);
  return { ...search, runs, running: isSearchRunning(id), boardCount: boards.length };
}

export type SearchWithRuns = NonNullable<Awaited<ReturnType<typeof getSearch>>>;

export interface FoundFilters {
  status?: string; // new | saved | dismissed | all
  searchId?: string;
  minScore?: number;
  hideNoSponsorship?: boolean;
  q?: string;
  sort?: "score" | "newest" | "posted";
  limit?: number;
}

export async function listFound(filters: FoundFilters) {
  const where: SQL[] = [];
  const status = filters.status ?? "new";
  if (status !== "all") where.push(eq(discoveredJobs.status, status));
  if (filters.searchId) where.push(eq(discoveredJobs.searchId, filters.searchId));
  if (filters.minScore) where.push(gte(discoveredJobs.score, filters.minScore));
  if (filters.hideNoSponsorship) where.push(sql`${discoveredJobs.flags} not like '%no_sponsorship%'`);
  if (filters.q?.trim()) {
    const like = `%${filters.q.trim().toLowerCase()}%`;
    where.push(
      sql`(lower(${discoveredJobs.title}) like ${like} or lower(${discoveredJobs.company}) like ${like} or lower(coalesce(${discoveredJobs.location}, '')) like ${like})`,
    );
  }
  const order =
    filters.sort === "newest"
      ? [desc(discoveredJobs.firstSeenAt), desc(discoveredJobs.score)]
      : filters.sort === "posted"
        ? [sql`${discoveredJobs.postedAt} desc nulls last`, desc(discoveredJobs.score)]
        : [desc(discoveredJobs.score), desc(discoveredJobs.firstSeenAt)];
  const limit = filters.limit ?? 300;
  const [rows, total] = await Promise.all([
    db
      .select({
        id: discoveredJobs.id,
        title: discoveredJobs.title,
        company: discoveredJobs.company,
        location: discoveredJobs.location,
        place: discoveredJobs.place,
        remote: discoveredJobs.remote,
        workplace: discoveredJobs.workplace,
        jobType: discoveredJobs.jobType,
        salary: discoveredJobs.salary,
        url: discoveredJobs.url,
        provider: discoveredJobs.provider,
        score: discoveredJobs.score,
        reasons: discoveredJobs.reasons,
        flags: discoveredJobs.flags,
        status: discoveredJobs.status,
        jobId: discoveredJobs.jobId,
        postedAt: discoveredJobs.postedAt,
        firstSeenAt: discoveredJobs.firstSeenAt,
        searchId: discoveredJobs.searchId,
      })
      .from(discoveredJobs)
      .where(where.length ? and(...where) : undefined)
      .orderBy(...order)
      .limit(limit),
    db
      .select({ n: sql<number>`count(*)` })
      .from(discoveredJobs)
      .where(where.length ? and(...where) : undefined),
  ]);
  return { rows, total: total[0]?.n ?? 0 };
}

export type FoundRow = Awaited<ReturnType<typeof listFound>>["rows"][number];

export async function getFound(id: string) {
  const row = await db.query.discoveredJobs.findFirst({ where: eq(discoveredJobs.id, id) });
  return row ?? null;
}

export async function foundCounts() {
  const rows = await db
    .select({ status: discoveredJobs.status, n: sql<number>`count(*)` })
    .from(discoveredJobs)
    .groupBy(discoveredJobs.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
}

export async function listSearchOptions() {
  return db.select({ id: searches.id, name: searches.name }).from(searches).orderBy(asc(searches.name));
}

export async function listCompanyBoards() {
  return db.select().from(companyBoards).orderBy(asc(companyBoards.name));
}

export function getDirectoryCounts() {
  return directoryCounts();
}

/** Suggests keywords for a search from a resume's skills and text. */
export async function suggestKeywords(resumeId: string): Promise<string[]> {
  const resume = await db.query.resumes.findFirst({ where: eq(resumes.id, resumeId) });
  if (!resume) return [];
  const [groups, entries] = await Promise.all([
    db.select({ skills: resumeSkillGroups.skills, name: resumeSkillGroups.name }).from(resumeSkillGroups).where(eq(resumeSkillGroups.resumeId, resumeId)),
    db.select({ title: resumeEntries.title, description: resumeEntries.description }).from(resumeEntries).where(eq(resumeEntries.resumeId, resumeId)),
  ]);
  const text = [
    resume.summary,
    resume.headline,
    resume.sourceText,
    ...entries.map((e) => `${e.title}\n${e.description ?? ""}`),
  ]
    .filter(Boolean)
    .join("\n");
  const fromSkills = groups
    .filter((g) => !/language|spoken/i.test(g.name))
    .flatMap((g) => g.skills)
    .filter((s) => s.length <= 40);
  const fromText = KEYWORD_VOCABULARY.filter((k) => hasTerm(text, k));
  return Array.from(new Map([...fromSkills, ...fromText].map((k) => [k.toLowerCase(), k])).values());
}
