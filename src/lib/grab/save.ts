import "server-only";
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { z } from "zod";
import { cleanJobUrl } from "@/lib/boards/adapters";
import { learnBoards } from "@/lib/boards/learn";
import { CLASS_VERSION, classifyJob } from "@/lib/classify";
import { db } from "@/lib/db";
import { discoveredJobs, grabRuns, jobs, resumeSkillGroups, resumes, searches, type MatchReasons } from "@/lib/db/schema";
import { normalizeJobType, normalizeWorkplace, workplaceFromText } from "@/lib/import/normalize";
import { parseLocation } from "@/lib/geo";
import { createMatcher, type Level, type Matcher, type MatchResult } from "@/lib/search/match";
import { searchKeywords } from "@/lib/search/runner";
import { parsePostedDate } from "./dates";

export const GRAB_SOURCES = ["linkedin", "handshake", "indeed", "web"] as const;

export const grabJobSchema = z.object({
  url: z.string().trim().url().max(2000),
  title: z.string().trim().min(1).max(300),
  company: z.string().trim().max(200).default(""),
  location: z.string().trim().max(400).optional(),
  description: z.string().max(80_000).optional(),
  postedAt: z.union([z.string().max(100), z.number()]).optional(),
  salary: z.string().trim().max(200).optional(),
  jobType: z.string().trim().max(100).optional(),
  workplace: z.string().trim().max(100).optional(),
  /** The site's own industry name, e.g. LinkedIn's "Industries" or Handshake's employer industry. */
  industry: z.string().trim().max(200).optional(),
  /** Anything the site says about work authorization or sponsorship. */
  workAuth: z.string().trim().max(500).optional(),
  /** The company's own application page, if the site links to it. */
  applyUrl: z.string().trim().max(2000).optional(),
  deadline: z.string().trim().max(100).optional(),
});

export const grabSchema = z.object({
  source: z.enum(GRAB_SOURCES).default("web"),
  pageUrl: z.string().max(2000).optional(),
  by: z.enum(["extension", "agent", "you"]).default("extension"),
  /** Also save every job to My jobs. */
  save: z.boolean().default(false),
  jobs: z.array(grabJobSchema).min(1).max(200),
});

export type GrabJob = z.infer<typeof grabJobSchema>;
export type GrabInput = z.infer<typeof grabSchema>;

export interface GrabResultItem {
  url: string;
  id: string;
  status: "new" | "updated" | "duplicate";
  score: number;
  jobId: string | null;
}

/** Scores grabbed jobs against every saved search; jobs that fit none still get a skills-only score. */
async function buildScorer(): Promise<(p: { title: string; location?: string; description?: string }) => MatchResult> {
  const all = await db.select().from(searches);
  const matchers: Matcher[] = [];
  const keywordSet = new Map<string, string>();
  for (const s of all) {
    const keywords = await searchKeywords(s);
    for (const k of keywords) keywordSet.set(k.toLowerCase(), k);
    matchers.push(
      createMatcher({
        titles: s.titles,
        keywords,
        excludeWords: s.excludeWords,
        locations: [], // you chose to look at this job; don't drop it for its location
        includeRemote: true,
        levels: s.levels as Level[],
      }),
    );
  }
  if (!keywordSet.size) {
    const master = await db.select({ id: resumes.id }).from(resumes).where(eq(resumes.isMaster, true)).limit(1);
    if (master[0]) {
      const groups = await db.select({ skills: resumeSkillGroups.skills }).from(resumeSkillGroups).where(eq(resumeSkillGroups.resumeId, master[0].id));
      for (const g of groups) for (const k of g.skills) keywordSet.set(k.toLowerCase(), k);
    }
  }
  const fallback = createMatcher({
    titles: [],
    keywords: [...keywordSet.values()],
    excludeWords: [],
    locations: [],
    includeRemote: true,
    levels: ["any"],
  });
  return (p) => {
    let best: MatchResult | null = null;
    for (const m of matchers) {
      const r = m.score(p);
      if (r && (!best || r.score > best.score)) best = r;
    }
    return best ?? fallback.score(p) ?? { score: 0, reasons: { keywords: [] }, flags: [], location: parseLocation(p.location ?? ""), place: undefined };
  };
}

export async function saveGrabbed(input: GrabInput) {
  const score = await buildScorer();
  const items = input.jobs.map((j) => ({ ...j, url: cleanJobUrl(j.url), applyUrl: j.applyUrl ? cleanJobUrl(j.applyUrl) : undefined }));
  const urls = items.map((j) => j.url);
  const applyUrls = items.map((j) => j.applyUrl).filter((u): u is string => Boolean(u));
  const lookups = [...urls, ...applyUrls];

  const [existing, tracked] = await Promise.all([
    db.select({ id: discoveredJobs.id, url: discoveredJobs.url, description: discoveredJobs.description, jobId: discoveredJobs.jobId }).from(discoveredJobs).where(inArray(discoveredJobs.url, lookups)),
    db
      .select({ id: jobs.id, url: jobs.url, applyUrl: jobs.applyUrl })
      .from(jobs)
      .where(or(and(isNotNull(jobs.url), inArray(jobs.url, lookups)), inArray(jobs.applyUrl, lookups))),
  ]);
  const byUrl = new Map(existing.map((e) => [e.url, e]));
  const trackedByUrl = new Map<string, string>();
  for (const t of tracked) {
    if (t.url) trackedByUrl.set(t.url, t.id);
    if (t.applyUrl) trackedByUrl.set(t.applyUrl, t.id);
  }

  const now = new Date();
  const results: GrabResultItem[] = [];
  let added = 0;
  let updated = 0;
  for (const raw of items) {
    // Keep the work-authorization line with the description so it survives reclassifying.
    const j =
      raw.workAuth && !(raw.description ?? "").toLowerCase().includes(raw.workAuth.toLowerCase())
        ? { ...raw, description: `Work authorization: ${raw.workAuth}\n\n${raw.description ?? ""}`.trim() }
        : raw;
    const result = score({ title: j.title, location: j.location, description: j.description });
    const place = result.place ?? result.location.places[0];
    const remote = result.location.remote || /\bremote\b/i.test(j.workplace ?? "");
    const c = classifyJob({
      title: j.title,
      company: j.company,
      description: j.description,
      location: j.location,
      place: place?.label,
      remote,
      sourceIndustry: j.industry,
      visaHint: j.workAuth,
    });
    const posted = parsePostedDate(j.postedAt ?? null);
    const reasons: MatchReasons = result.reasons;
    const values = {
      title: j.title,
      company: j.company || "Unknown company",
      location: j.location ?? null,
      workplace: normalizeWorkplace(j.workplace) ?? workplaceFromText(`${j.workplace ?? ""} ${j.location ?? ""}`) ?? (remote ? "remote" : null),
      jobType: normalizeJobType(j.jobType) ?? (c.level === "internship" ? "internship" : null),
      salary: j.salary || null,
      postedAt: posted,
      score: result.score,
      reasons,
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
      sourceIndustry: j.industry ?? null,
      applyUrl: j.applyUrl ?? null,
      grabbed: true,
      lastSeenAt: now,
    };

    const same = byUrl.get(j.url);
    const viaApply = j.applyUrl ? byUrl.get(j.applyUrl) : undefined;
    if (same) {
      // Keep the longer description; job cards sometimes come without one.
      const description = (j.description?.length ?? 0) >= (same.description?.length ?? 0) ? j.description ?? null : same.description;
      await db.update(discoveredJobs).set({ ...values, description }).where(eq(discoveredJobs.id, same.id));
      updated++;
      results.push({ url: j.url, id: same.id, status: "updated", score: result.score, jobId: same.jobId });
      continue;
    }
    if (viaApply) {
      // We already found this job on the company's own board; just add what the job site knows.
      await db
        .update(discoveredJobs)
        .set({ sourceIndustry: values.sourceIndustry, lastSeenAt: now, ...(c.visa !== "unknown" ? { visa: c.visa, visaNote: c.visaNote } : {}) })
        .where(eq(discoveredJobs.id, viaApply.id));
      results.push({ url: j.url, id: viaApply.id, status: "duplicate", score: result.score, jobId: viaApply.jobId });
      continue;
    }
    const jobId = trackedByUrl.get(j.url) ?? (j.applyUrl ? trackedByUrl.get(j.applyUrl) : undefined) ?? null;
    const host = safeHost(j.url);
    const [row] = await db
      .insert(discoveredJobs)
      .values({
        ...values,
        description: j.description ?? null,
        url: j.url,
        provider: input.source,
        boardToken: host,
        searchId: null,
        status: jobId ? "saved" : "new",
        jobId,
      })
      .onConflictDoNothing()
      .returning({ id: discoveredJobs.id });
    if (row) {
      added++;
      byUrl.set(j.url, { id: row.id, url: j.url, description: j.description ?? null, jobId });
      results.push({ url: j.url, id: row.id, status: "new", score: result.score, jobId });
    }
  }

  const boardsLearned = await learnBoards(
    items.map((j) => ({ url: j.applyUrl, company: j.company })),
    input.source,
  ).catch(() => 0);

  if (input.save) {
    const { saveFoundJob } = await import("@/lib/search/actions");
    for (const r of results) {
      if (!r.jobId) {
        const saved = await saveFoundJob(r.id);
        if (saved.ok) r.jobId = saved.data.jobId;
      }
    }
  }

  await db.insert(grabRuns).values({
    source: input.source,
    pageUrl: input.pageUrl ?? null,
    by: input.by,
    received: items.length,
    added,
    updated,
    boardsLearned,
  });

  return { received: items.length, added, updated, duplicates: results.filter((r) => r.status === "duplicate").length, boardsLearned, results };
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "web";
  }
}
