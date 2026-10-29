import "server-only";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { discoveredJobs } from "@/lib/db/schema";
import {
  buildSearchParams,
  parseJobPage,
  parseSearchCards,
  searchParamsFromUrl,
  type LinkedInCard,
  type LinkedInDetail,
} from "./linkedin-html";
import { saveGrabbed, type GrabJob } from "./save";

export { parseJobPage, parseSearchCards, searchParamsFromUrl };

// LinkedIn jobs without scrolling: Job Finder reads the same public job pages
// anyone can open without signing in (the "guest" search and job pages), one
// request at a time with a pause, and stops when LinkedIn asks it to slow down.
// No LinkedIn account is used.

const BASE = "https://www.linkedin.com";
const HEADERS = {
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
  "accept-language": "en-US,en;q=0.9",
  accept: "text/html,application/xhtml+xml",
};
const PAUSE_MS = [1300, 2300] as const;
export const LINKEDIN_LIMITS = { pages: 10, jobs: 120 } as const;

export class LinkedInSlowDown extends Error {}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });
const pause = (signal?: AbortSignal) => sleep(PAUSE_MS[0] + Math.random() * (PAUSE_MS[1] - PAUSE_MS[0]), signal);

async function get(url: string, signal?: AbortSignal): Promise<string | null> {
  const res = await fetch(url, { headers: HEADERS, redirect: "follow", signal: signal ?? AbortSignal.timeout(20_000) });
  if (res.status === 429 || res.status === 999) throw new LinkedInSlowDown("LinkedIn asked Job Finder to slow down.");
  if (!res.ok) return null;
  return res.text();
}

const jobUrl = (id: string) => `${BASE}/jobs/view/${id}/`;
const workplaceOf = (s: string) => /\b(remote|hybrid|on-?site)\b/i.exec(s)?.[1];

export interface LinkedInGrabOptions {
  /** A LinkedIn job search URL (what you see in the address bar). */
  searchUrl?: string;
  keywords?: string;
  location?: string;
  postedDays?: number;
  remote?: boolean;
  /** Job ids you already have, e.g. read from the page you're on. */
  ids?: string[];
  /** Results pages of 25 to read (1 to 10). */
  pages?: number;
  maxJobs?: number;
  /** Also save the jobs to My jobs. */
  save?: boolean;
  by?: "agent" | "extension" | "you";
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}

export interface LinkedInGrabResult {
  search: string | null;
  found: number;
  known: number;
  read: number;
  slowedDown: boolean;
  received: number;
  added: number;
  updated: number;
  duplicates: number;
  boardsLearned: number;
}

// One LinkedIn reader at a time across the app (searches, agents, the extension).
const lock = globalThis as unknown as { jobFinderLinkedInQueue?: Promise<unknown> };

/** Reads a LinkedIn search (or a list of job ids) and adds the jobs to Found jobs. */
export async function grabLinkedIn(o: LinkedInGrabOptions): Promise<LinkedInGrabResult> {
  const before = lock.jobFinderLinkedInQueue ?? Promise.resolve();
  const mine = before.catch(() => {}).then(() => grabLinkedInNow(o));
  lock.jobFinderLinkedInQueue = mine.catch(() => {});
  return mine;
}

/** What a saved search asks LinkedIn: its first titles in its first places, posted in the last week. */
export async function linkedInForSearch(
  search: { locations: string[]; includeRemote: boolean },
  queries: string[],
  signal?: AbortSignal,
): Promise<LinkedInGrabResult> {
  const places = search.locations.map((l) => l.trim()).filter((l) => l && !/^remote$/i.test(l)).slice(0, 2);
  const combos: { keywords: string; location?: string; remote?: boolean }[] = [];
  for (const q of queries.slice(0, 4)) {
    for (const p of places.length ? places : ["United States"]) combos.push({ keywords: q, location: p });
    if (search.includeRemote) combos.push({ keywords: q, remote: true });
  }
  const total: LinkedInGrabResult = { search: null, found: 0, known: 0, read: 0, slowedDown: false, received: 0, added: 0, updated: 0, duplicates: 0, boardsLearned: 0 };
  let budget = 60; // job pages read per run
  for (const c of combos.slice(0, 6)) {
    if (signal?.aborted || total.slowedDown || budget <= 0) break;
    const r = await grabLinkedIn({ ...c, postedDays: 7, pages: 1, maxJobs: Math.min(25, budget), by: "you", signal });
    budget -= r.read;
    for (const k of ["found", "known", "read", "received", "added", "updated", "duplicates", "boardsLearned"] as const) total[k] += r[k];
    total.slowedDown ||= r.slowedDown;
  }
  return total;
}

async function grabLinkedInNow(o: LinkedInGrabOptions): Promise<LinkedInGrabResult> {
  const params = o.searchUrl ? searchParamsFromUrl(o.searchUrl) : o.keywords || o.location ? buildSearchParams(o) : null;
  if (o.searchUrl && !params) throw new Error("That isn't a LinkedIn job search link.");
  const pages = Math.max(1, Math.min(LINKEDIN_LIMITS.pages, Math.round(o.pages ?? 1)));
  const maxJobs = Math.max(1, Math.min(LINKEDIN_LIMITS.jobs, o.maxJobs ?? pages * 25));
  const cards = new Map<string, LinkedInCard | { id: string }>();
  for (const id of o.ids ?? []) if (/^\d{6,}$/.test(id)) cards.set(id, { id });

  let slowedDown = false;
  if (params) {
    // The guest search returns about 10 jobs per request; LinkedIn's own pages show 25.
    for (let start = 0; start < pages * 25 && cards.size < maxJobs && !o.signal?.aborted; ) {
      let html: string | null = null;
      try {
        html = await get(`${BASE}/jobs-guest/jobs/api/seeMoreJobPostings/search?${params}&start=${start}`, o.signal);
      } catch (e) {
        if (e instanceof LinkedInSlowDown) slowedDown = true;
        else throw e;
      }
      const found = html ? parseSearchCards(html) : [];
      if (!found.length) break;
      for (const c of found) if (!cards.has(c.id) || !("title" in cards.get(c.id)!)) cards.set(c.id, c);
      o.onProgress?.(`Found ${cards.size} jobs so far…`);
      start += found.length;
      if (slowedDown) break;
      await pause(o.signal);
    }
  }

  const list = [...cards.values()].slice(0, maxJobs);
  // Skip jobs already in Job Finder: no need to read them again.
  const urls = list.map((c) => jobUrl(c.id));
  const known = new Set<string>();
  for (let i = 0; i < urls.length; i += 400) {
    const rows = await db.select({ url: discoveredJobs.url }).from(discoveredJobs).where(inArray(discoveredJobs.url, urls.slice(i, i + 400)));
    for (const r of rows) known.add(r.url);
  }

  const jobs: GrabJob[] = [];
  let read = 0;
  for (const c of list) {
    if (o.signal?.aborted) break;
    if (known.has(jobUrl(c.id))) continue;
    let d: LinkedInDetail | null = null;
    if (!slowedDown) {
      try {
        const html = await get(`${BASE}/jobs-guest/jobs/api/jobPosting/${c.id}`, o.signal);
        if (html) {
          d = parseJobPage(html);
          read++;
        }
      } catch (e) {
        if (e instanceof LinkedInSlowDown) slowedDown = true;
      }
      o.onProgress?.(`Read ${read} of ${list.length - known.size} new jobs…`);
      await pause(o.signal);
    }
    const card = "title" in c ? c : null;
    const title = d?.title || card?.title;
    if (!title) continue;
    const location = d?.location || card?.location || undefined;
    jobs.push({
      url: jobUrl(c.id),
      title,
      company: d?.company || card?.company || "",
      location,
      description: d?.description || undefined,
      postedAt: d?.postedAt || card?.postedAt || undefined,
      salary: d?.salary || card?.salary || undefined,
      jobType: d?.jobType || undefined,
      industry: d?.industry || undefined,
      workplace: workplaceOf(`${location ?? ""} ${d?.title ?? ""}`),
      applyUrl: d?.applyUrl,
    } as GrabJob);
  }

  const totals = { received: 0, added: 0, updated: 0, duplicates: known.size, boardsLearned: 0 };
  for (let i = 0; i < jobs.length; i += 200) {
    const r = await saveGrabbed({
      source: "linkedin",
      pageUrl: o.searchUrl ?? (params ? `${BASE}/jobs/search/?${params}` : undefined),
      by: o.by ?? "agent",
      save: Boolean(o.save),
      jobs: jobs.slice(i, i + 200),
    });
    totals.received += r.received;
    totals.added += r.added;
    totals.updated += r.updated;
    totals.duplicates += r.duplicates;
    totals.boardsLearned += r.boardsLearned;
  }
  return { search: params ? params.toString() : null, found: cards.size, known: known.size, read, slowedDown, ...totals };
}
