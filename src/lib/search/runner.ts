import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { ADAPTERS, SIMPLIFY_LISTS, cleanJobUrl } from "@/lib/boards/adapters";
import { directoryBoards } from "@/lib/boards/directory";
import { mapLimit } from "@/lib/boards/http";
import { learnBoards } from "@/lib/boards/learn";
import { CLASS_VERSION, classifyJob } from "@/lib/classify";
import { boardKey, PROVIDER_LABELS, type BoardRef, type Posting, type Provider } from "@/lib/boards/types";
import { db } from "@/lib/db";
import {
  companyBoards,
  discoveredJobs,
  jobs,
  resumeSkillGroups,
  searchRuns,
  searches,
  type Search,
} from "@/lib/db/schema";
import { createMatcher, searchQueries, type Level, type MatchResult } from "./match";

const BOARD_CONCURRENCY = 8;
const DETAIL_CONCURRENCY = 4;
const MAX_DETAILS_PER_BOARD = 40;
// The Simplify lists hold thousands of jobs from many companies in one "board".
const MAX_DETAILS: Partial<Record<Provider, number>> = { simplify: 250 };

// Running searches, so a run can be stopped and two runs of one search can't overlap.
const globalForRuns = globalThis as unknown as {
  jobFinderRuns?: Map<string, AbortController>;
  jobFinderStartedAt?: number;
};
const active = (globalForRuns.jobFinderRuns ??= new Map());
// When this app session started; runs older than this were cut off by a restart.
const sessionStartedAt = (globalForRuns.jobFinderStartedAt ??= Date.now());

export function isSearchRunning(searchId: string): boolean {
  return active.has(searchId);
}

export function stopSearch(searchId: string): boolean {
  const controller = active.get(searchId);
  controller?.abort();
  return Boolean(controller);
}

export async function boardsForSearch(search: Pick<Search, "sources" | "companyScope">): Promise<BoardRef[]> {
  const sources = new Set(search.sources);
  const mine = (await db.select().from(companyBoards)).map<BoardRef>((b) => ({
    provider: b.provider as Provider,
    token: b.token,
    name: b.name,
    host: b.host ?? undefined,
    site: b.site || undefined,
  }));
  const lists: BoardRef[] = SIMPLIFY_LISTS.map((l) => ({ provider: "simplify", token: l.token, name: l.name }));
  const all = search.companyScope === "mine" ? mine : [...lists, ...mine, ...directoryBoards()];
  const seen = new Set<string>();
  return all.filter((b) => {
    const key = boardKey(b);
    if (!sources.has(b.provider) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function searchKeywords(search: Search): Promise<string[]> {
  const words = [...search.keywords];
  if (search.resumeId) {
    const groups = await db
      .select({ skills: resumeSkillGroups.skills })
      .from(resumeSkillGroups)
      .where(eq(resumeSkillGroups.resumeId, search.resumeId));
    for (const g of groups) words.push(...g.skills);
  }
  return Array.from(new Map(words.map((w) => [w.trim().toLowerCase(), w.trim()])).values()).filter(Boolean);
}

interface Found {
  posting: Posting;
  result: MatchResult;
}

/** Starts a run in the background and returns its id. */
export async function startSearchRun(searchId: string, trigger: "manual" | "schedule" = "manual"): Promise<string> {
  if (active.has(searchId)) throw new Error("This search is already running.");
  const search = await db.query.searches.findFirst({ where: eq(searches.id, searchId) });
  if (!search) throw new Error("Search not found.");

  const controller = new AbortController();
  active.set(searchId, controller);
  let run: { id: string };
  try {
    [run] = await db
      .insert(searchRuns)
      .values({ searchId, trigger, errors: [], status: "running" })
      .returning({ id: searchRuns.id });
  } catch (error) {
    active.delete(searchId);
    throw error;
  }

  void executeRun(search, run.id, controller.signal)
    .catch(async (error) => {
      console.error("Search run failed", error);
      await db
        .update(searchRuns)
        .set({ status: "failed", message: error instanceof Error ? error.message : String(error), finishedAt: new Date() })
        .where(eq(searchRuns.id, run.id));
    })
    .finally(() => active.delete(searchId));

  return run.id;
}

async function executeRun(search: Search, runId: string, signal: AbortSignal) {
  const boards = await boardsForSearch(search);
  const matcher = createMatcher({
    titles: search.titles,
    keywords: await searchKeywords(search),
    excludeWords: search.excludeWords,
    locations: search.locations,
    includeRemote: search.includeRemote,
    levels: search.levels as Level[],
  });
  const queries = searchQueries({ titles: search.titles, levels: search.levels as Level[] });

  const progress = { boardsDone: 0, postingsSeen: 0, matched: 0, newJobs: 0 };
  const errors: { board: string; error: string }[] = [];
  await db.update(searchRuns).set({ boardsTotal: boards.length }).where(eq(searchRuns.id, runId));

  let lastFlush = 0;
  async function flush(force = false) {
    if (!force && Date.now() - lastFlush < 1500) return;
    lastFlush = Date.now();
    await db
      .update(searchRuns)
      .set({ ...progress, status: "running", errors: errors.slice(0, 200) })
      .where(eq(searchRuns.id, runId));
  }

  await mapLimit(
    boards,
    BOARD_CONCURRENCY,
    async (board) => {
      const adapter = ADAPTERS[board.provider];
      try {
        const postings = await adapter.list(board, { signal, queries });
        progress.postingsSeen += postings.length;
        const candidates = postings.filter((p) => matcher.prefilter(p.title, p.location));

        if (board.provider === "simplify" && candidates.length) {
          // Remember the company boards behind relevant listings for later searches.
          await learnBoards(candidates.map((p) => ({ url: p.url, company: p.company })), "simplify").catch(() => 0);
        }
        const limit = MAX_DETAILS[board.provider] ?? MAX_DETAILS_PER_BOARD;
        const toDetail = adapter.detail ? candidates.slice(0, limit) : [];
        if (adapter.detail && toDetail.length) {
          await mapLimit(
            toDetail,
            DETAIL_CONCURRENCY,
            async (p) => {
              try {
                Object.assign(p, await adapter.detail!(board, p, signal));
              } catch {
                // Keep the posting with what the list gave us.
              }
            },
            signal,
          );
        }

        const found: Found[] = [];
        for (const p of adapter.detail ? toDetail : candidates) {
          const result = matcher.score(p);
          if (result && result.score >= search.minScore) found.push({ posting: p, result });
        }
        progress.matched += found.length;
        if (found.length) {
          const added = await saveFound(search.id, found);
          progress.newJobs += added; // add after the await so parallel boards don't overwrite each other
        }
      } catch (error) {
        if (!signal.aborted) {
          errors.push({
            board: `${board.name} (${PROVIDER_LABELS[board.provider]})`,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } finally {
        progress.boardsDone++;
        await flush();
      }
    },
    signal,
  );

  await flush(true);
  const stopped = signal.aborted;
  const finishedAt = new Date();
  await db
    .update(searchRuns)
    .set({
      status: stopped ? "stopped" : "done",
      finishedAt,
      message: stopped
        ? "Stopped before finishing."
        : `Checked ${progress.boardsDone} company boards and ${progress.postingsSeen.toLocaleString()} postings.`,
    })
    .where(eq(searchRuns.id, runId));
  await db.update(searches).set({ lastRunAt: finishedAt }).where(eq(searches.id, search.id));
}

/** Inserts new finds and refreshes ones seen before. Returns how many were new. */
async function saveFound(searchId: string, found: Found[]): Promise<number> {
  for (const f of found) f.posting.url = cleanJobUrl(f.posting.url);
  const urls = found.map((f) => f.posting.url);
  const [existing, tracked] = await Promise.all([
    db
      .select({ id: discoveredJobs.id, url: discoveredJobs.url })
      .from(discoveredJobs)
      .where(inArray(discoveredJobs.url, urls)),
    db
      .select({ id: jobs.id, url: jobs.url })
      .from(jobs)
      .where(and(isNotNull(jobs.url), inArray(jobs.url, urls))),
  ]);
  const existingByUrl = new Map(existing.map((e) => [e.url, e.id]));
  const trackedByUrl = new Map(tracked.map((t) => [t.url!, t.id]));
  const now = new Date();
  let added = 0;

  for (const { posting: p, result } of found) {
    const place = result.place ?? result.location.places[0];
    const remote = result.location.remote;
    const c = classifyJob({
      title: p.title,
      company: p.company,
      description: p.description,
      location: p.location,
      place: place?.label,
      remote,
      sourceIndustry: p.sourceIndustry,
      visaHint: p.visaHint,
      category: p.category,
    });
    const values = {
      title: p.title,
      company: p.company,
      location: p.location ?? null,
      workplace: p.workplace ?? (result.location.remote && !place ? "remote" : null),
      jobType: p.jobType ?? (result.reasons.level === "Internship" ? "internship" : null),
      salary: p.salary ?? null,
      description: p.description ?? null,
      postedAt: p.postedAt && !Number.isNaN(Date.parse(p.postedAt)) ? new Date(p.postedAt) : null,
      score: result.score,
      reasons: result.reasons,
      flags: result.flags,
      lat: place?.lat ?? null,
      lng: place?.lng ?? null,
      place: place?.label ?? null,
      remote,
      industry: c.industry,
      roleType: c.roleType,
      visa: c.visa,
      visaNote: c.visaNote,
      level: c.level,
      state: c.state,
      companyKey: c.companyKey,
      classVersion: CLASS_VERSION,
      sourceIndustry: p.sourceIndustry ?? null,
      applyUrl: p.applyUrl ?? null,
      lastSeenAt: now,
    };
    const existingId = existingByUrl.get(p.url);
    if (existingId) {
      await db.update(discoveredJobs).set(values).where(eq(discoveredJobs.id, existingId));
    } else {
      const jobId = trackedByUrl.get(p.url);
      await db
        .insert(discoveredJobs)
        .values({
          ...values,
          searchId,
          url: p.url,
          provider: p.provider,
          boardToken: p.boardToken,
          status: jobId ? "saved" : "new",
          jobId: jobId ?? null,
        })
        .onConflictDoNothing();
      if (!jobId) added++;
    }
  }
  return added;
}

/** Marks runs left "running" by a previous app session as stopped. */
export async function cleanUpStaleRuns() {
  const progress = () =>
    db
      .select({
        id: searchRuns.id,
        searchId: searchRuns.searchId,
        startedAt: searchRuns.startedAt,
        boardsDone: searchRuns.boardsDone,
        postingsSeen: searchRuns.postingsSeen,
      })
      .from(searchRuns)
      .where(eq(searchRuns.status, "running"));
  // Only runs from before this app session; current ones are still going.
  const candidates = (await progress()).filter((r) => !active.has(r.searchId) && r.startedAt.getTime() < sessionStartedAt);
  if (!candidates.length) return;
  // A run that is still making progress is alive (it may belong to another
  // module instance after a hot reload), so give it a moment to show that.
  await new Promise((resolve) => setTimeout(resolve, 20_000));
  const now = new Map((await progress()).map((r) => [r.id, r]));
  for (const r of candidates) {
    const later = now.get(r.id);
    if (!later || active.has(r.searchId)) continue;
    if (later.boardsDone !== r.boardsDone || later.postingsSeen !== r.postingsSeen) continue;
    await db
      .update(searchRuns)
      .set({ status: "stopped", message: "The app was closed while this search was running.", finishedAt: new Date() })
      .where(and(eq(searchRuns.id, r.id), eq(searchRuns.status, "running")));
  }
}
