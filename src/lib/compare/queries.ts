import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { classifyJob, stateOf } from "@/lib/classify";
import { h1bFor } from "@/lib/classify/store";
import { companyKey } from "@/lib/classify/company";
import { db } from "@/lib/db";
import { companies, discoveredJobs, jobs } from "@/lib/db/schema";
import { getFoundMany } from "@/lib/found/queries";
import { requiredYears, titleLevel } from "@/lib/search/match";

export interface CompareItem {
  kind: "found" | "job";
  id: string;
  title: string;
  company: string;
  /** Where to read more inside Job Finder (My jobs) or the posting (found jobs). */
  href: string;
  external: boolean;
  applyUrl: string | null;
  location: string | null;
  state: string | null;
  workplace: string | null;
  jobType: string | null;
  level: string;
  industry: string | null;
  roleType: string | null;
  visa: string | null;
  visaNote: string | null;
  h1bApprovals: number | null;
  h1bYear: number | null;
  salary: string | null;
  postedAt: Date | null;
  deadline: Date | null;
  score: number | null;
  keywords: string[];
  years: number | null;
  status: string;
  source: string;
  savedJobId: string | null;
}

export const MAX_COMPARE = 6;

/** Reads ids from ?found=a,b&found=c&jobs=d (both forms work). */
export function idsFromParam(v: string | string[] | undefined): string[] {
  const list = (Array.isArray(v) ? v : v ? [v] : []).flatMap((s) => s.split(",")).map((s) => s.trim());
  return Array.from(new Set(list.filter((s) => /^[\w-]{1,64}$/.test(s))));
}

export async function compareItems(foundIds: string[], jobIds: string[]): Promise<CompareItem[]> {
  const found = await getFoundMany(foundIds.slice(0, MAX_COMPARE));
  const byFound = new Map(found.map((r) => [r.found.id, r]));
  const out: CompareItem[] = [];
  for (const id of foundIds) {
    const r = byFound.get(id);
    if (!r) continue;
    const f = r.found;
    out.push({
      kind: "found",
      id: f.id,
      title: f.title,
      company: f.company,
      href: f.url,
      external: true,
      applyUrl: f.applyUrl ?? f.url,
      location: f.location,
      state: f.state,
      workplace: f.workplace,
      jobType: f.jobType,
      level: f.level ?? titleLevel(f.title),
      industry: f.industry,
      roleType: f.roleType,
      visa: f.visa,
      visaNote: f.visaNote,
      h1bApprovals: r.h1bApprovals,
      h1bYear: r.h1bYear,
      salary: f.salary,
      postedAt: f.postedAt,
      deadline: null,
      score: f.score,
      keywords: f.reasons.keywords,
      years: f.reasons.experienceYears ?? null,
      status: f.jobId ? "saved" : f.status,
      source: f.provider,
      savedJobId: f.jobId,
    });
  }

  const room = MAX_COMPARE - out.length;
  const ids = jobIds.slice(0, Math.max(0, room));
  if (ids.length) {
    const rows = await db
      .select({ job: jobs, company: companies.name })
      .from(jobs)
      .innerJoin(companies, eq(jobs.companyId, companies.id))
      .where(inArray(jobs.id, ids));
    const h1b = await h1bFor(rows.map((r) => r.company));
    const byId = new Map(rows.map((r) => [r.job.id, r]));
    for (const id of ids) {
      const r = byId.get(id);
      if (!r) continue;
      const j = r.job;
      const c = j.visa ? null : classifyJob({ title: j.title, company: r.company, description: j.description, location: j.location, place: j.place });
      const h = h1b.get(companyKey(r.company));
      out.push({
        kind: "job",
        id: j.id,
        title: j.title,
        company: r.company,
        href: `/jobs/${j.id}`,
        external: false,
        applyUrl: j.applyUrl ?? j.url,
        location: j.location,
        state: stateOf(j.place, j.location, j.remote),
        workplace: j.workplace,
        jobType: j.jobType,
        level: titleLevel(j.title),
        industry: j.industry ?? c?.industry ?? null,
        roleType: j.roleType ?? c?.roleType ?? null,
        visa: j.visa ?? c?.visa ?? null,
        visaNote: j.visaNote ?? c?.visaNote ?? null,
        h1bApprovals: h?.approvals ?? null,
        h1bYear: h?.fiscalYear ?? null,
        salary: j.salary,
        postedAt: j.postedAt,
        deadline: j.dueDate,
        score: j.matchScore,
        keywords: [],
        years: requiredYears(j.description ?? undefined) ?? null,
        status: j.status,
        source: j.source ?? "you",
        savedJobId: j.id,
      });
    }
  }
  return out;
}

/** Jobs to pick from when nothing is chosen yet. */
export async function comparePicker() {
  const [mine, top] = await Promise.all([
    db
      .select({ id: jobs.id, title: jobs.title, company: companies.name, status: jobs.status, score: jobs.matchScore })
      .from(jobs)
      .innerJoin(companies, eq(jobs.companyId, companies.id))
      .where(inArray(jobs.status, ["new", "draft", "applied", "interview"]))
      .orderBy(desc(jobs.updatedAt))
      .limit(40),
    db
      .select({ id: discoveredJobs.id, title: discoveredJobs.title, company: discoveredJobs.company, score: discoveredJobs.score, visa: discoveredJobs.visa })
      .from(discoveredJobs)
      .where(and(eq(discoveredJobs.status, "new")))
      .orderBy(desc(discoveredJobs.score), desc(discoveredJobs.postedAt))
      .limit(40),
  ]);
  return { mine, top };
}
