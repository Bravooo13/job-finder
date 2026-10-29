import "server-only";
import { and, desc, eq, gte, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { ensureClassified } from "@/lib/classify/store";
import { db } from "@/lib/db";
import { discoveredJobs, h1bEmployers } from "@/lib/db/schema";
import type { FoundFilters } from "./filters";

const d = discoveredJobs;

function conditions(f: FoundFilters, skip?: keyof FoundFilters): SQL[] {
  const where: SQL[] = [];
  const status = f.status ?? "new";
  if (status !== "all") where.push(eq(d.status, status));
  if (f.ids?.length) where.push(inArray(d.id, f.ids));
  if (f.searchId) where.push(eq(d.searchId, f.searchId));
  if (f.minScore) where.push(gte(d.score, f.minScore));
  if (f.q?.trim()) {
    const like = `%${f.q.trim().toLowerCase()}%`;
    where.push(
      sql`(lower(${d.title}) like ${like} or lower(${d.company}) like ${like} or lower(coalesce(${d.location}, '')) like ${like})`,
    );
  }
  if (skip !== "industries" && f.industries?.length) where.push(inArray(d.industry, f.industries));
  if (skip !== "roles" && f.roles?.length) where.push(inArray(d.roleType, f.roles));
  if (skip !== "states" && f.states?.length) where.push(inArray(d.state, f.states));
  if (skip !== "sources" && f.sources?.length) where.push(inArray(d.provider, f.sources));
  if (f.levels?.length) {
    const wantsOther = f.levels.includes("other");
    const named = f.levels.filter((l) => l !== "other");
    const parts: SQL[] = [];
    if (named.length) parts.push(inArray(d.level, named));
    if (wantsOther) parts.push(sql`(${d.level} is null or ${d.level} not in ('internship', 'entry'))`);
    where.push(or(...parts)!);
  }
  if (f.jobTypes?.length) where.push(inArray(d.jobType, f.jobTypes));
  if (f.workplaces?.length) {
    const parts: SQL[] = [inArray(d.workplace, f.workplaces)];
    if (f.workplaces.includes("remote")) parts.push(eq(d.remote, true));
    where.push(or(...parts)!);
  }
  if (f.postedDays) {
    const since = Date.now() - f.postedDays * 86_400_000;
    where.push(sql`coalesce(${d.postedAt}, ${d.firstSeenAt}) >= ${since}`);
  }
  if (f.maxYears !== undefined) {
    where.push(
      sql`(json_extract(${d.reasons}, '$.experienceYears') is null or json_extract(${d.reasons}, '$.experienceYears') <= ${f.maxYears})`,
    );
  }
  if (f.hasPay) where.push(sql`coalesce(${d.salary}, '') <> ''`);
  if (skip !== "visa" && f.visa) {
    const h1b = sql`exists (select 1 from ${h1bEmployers} h where h.name_key = ${d.companyKey} and h.total_approvals > 0)`;
    if (f.visa === "sponsors") where.push(eq(d.visa, "sponsors"));
    else if (f.visa === "red") where.push(inArray(d.visa, ["no_sponsorship", "citizens_only"]));
    else if (f.visa === "nored") where.push(or(isNull(d.visa), sql`${d.visa} not in ('no_sponsorship', 'citizens_only')`)!);
    else if (f.visa === "h1b") where.push(h1b);
    else if (f.visa === "friendly") {
      where.push(or(inArray(d.visa, ["sponsors", "opt_cpt"]), and(or(isNull(d.visa), eq(d.visa, "unknown")), h1b))!);
    }
  }
  return where;
}

export async function listFound(f: FoundFilters) {
  await ensureClassified();
  const where = conditions(f);
  const order =
    f.sort === "newest"
      ? [desc(d.firstSeenAt), desc(d.score)]
      : f.sort === "posted"
        ? [sql`coalesce(${d.postedAt}, ${d.firstSeenAt}) desc`, desc(d.score)]
        : [desc(d.score), desc(d.firstSeenAt)];
  const limit = Math.min(f.limit ?? 300, 1000);
  const [rows, total] = await Promise.all([
    db
      .select({
        id: d.id,
        title: d.title,
        company: d.company,
        location: d.location,
        place: d.place,
        remote: d.remote,
        workplace: d.workplace,
        jobType: d.jobType,
        salary: d.salary,
        url: d.url,
        applyUrl: d.applyUrl,
        provider: d.provider,
        score: d.score,
        reasons: d.reasons,
        flags: d.flags,
        status: d.status,
        jobId: d.jobId,
        postedAt: d.postedAt,
        firstSeenAt: d.firstSeenAt,
        searchId: d.searchId,
        industry: d.industry,
        roleType: d.roleType,
        visa: d.visa,
        visaNote: d.visaNote,
        level: d.level,
        state: d.state,
        sourceIndustry: d.sourceIndustry,
        h1bApprovals: h1bEmployers.totalApprovals,
        h1bYear: h1bEmployers.fiscalYear,
      })
      .from(d)
      .leftJoin(h1bEmployers, eq(h1bEmployers.nameKey, d.companyKey))
      .where(where.length ? and(...where) : undefined)
      .orderBy(...order)
      .limit(limit)
      .offset(f.offset ?? 0),
    db
      .select({ n: sql<number>`count(*)` })
      .from(d)
      .where(where.length ? and(...where) : undefined),
  ]);
  return { rows, total: total[0]?.n ?? 0 };
}

export type FoundRow = Awaited<ReturnType<typeof listFound>>["rows"][number];

export interface Facets {
  industries: Record<string, number>;
  roles: Record<string, number>;
  states: Record<string, number>;
  sources: Record<string, number>;
  visa: Record<string, number>;
}

/** Counts per option, with every other filter applied (so the numbers match what you'd see). */
export async function foundFacets(f: FoundFilters): Promise<Facets> {
  async function count(col: typeof d.industry | typeof d.roleType | typeof d.state | typeof d.provider | typeof d.visa, skip: keyof FoundFilters) {
    const where = conditions(f, skip);
    const rows = await db
      .select({ key: col, n: sql<number>`count(*)` })
      .from(d)
      .where(where.length ? and(...where) : undefined)
      .groupBy(col);
    return Object.fromEntries(rows.map((r) => [r.key ?? "", r.n])) as Record<string, number>;
  }
  const [industries, roles, states, sources, visa] = await Promise.all([
    count(d.industry, "industries"),
    count(d.roleType, "roles"),
    count(d.state, "states"),
    count(d.provider, "sources"),
    count(d.visa, "visa"),
  ]);
  return { industries, roles, states, sources, visa };
}

export async function getFoundMany(ids: string[]) {
  if (!ids.length) return [];
  return db
    .select({
      found: d,
      h1bApprovals: h1bEmployers.totalApprovals,
      h1bYear: h1bEmployers.fiscalYear,
    })
    .from(d)
    .leftJoin(h1bEmployers, eq(h1bEmployers.nameKey, d.companyKey))
    .where(inArray(d.id, ids));
}

