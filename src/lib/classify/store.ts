import "server-only";
import { eq, inArray, lt, or, sql, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { discoveredJobs, h1bEmployers } from "@/lib/db/schema";
import { CLASS_VERSION, classifyJob, companyKey, companyKeyVariants } from "./index";
import { industryFromNaics } from "./industry";

const SIMPLIFY_HINT = /^(offers sponsorship|does not offer sponsorship|u\.?s\.? citizenship is required)/i;

/** Classifies found jobs saved before the current rules (runs in batches). */
export async function backfillClassification(limit = 2000): Promise<number> {
  const rows = await db
    .select({
      id: discoveredJobs.id,
      title: discoveredJobs.title,
      company: discoveredJobs.company,
      description: discoveredJobs.description,
      location: discoveredJobs.location,
      place: discoveredJobs.place,
      remote: discoveredJobs.remote,
      sourceIndustry: discoveredJobs.sourceIndustry,
      visaNote: discoveredJobs.visaNote,
      provider: discoveredJobs.provider,
    })
    .from(discoveredJobs)
    .where(lt(discoveredJobs.classVersion, CLASS_VERSION))
    .limit(limit);
  if (!rows.length) return 0;
  const naics = await naicsFor(rows.map((r) => r.company));
  for (const r of rows) {
    // Simplify's sponsorship field isn't in the description; the old note kept it.
    const simplifyHint = r.provider === "simplify" && SIMPLIFY_HINT.test(r.visaNote ?? "") ? r.visaNote : null;
    const c = classifyJob({ ...r, visaHint: simplifyHint, naics: naics.get(companyKey(r.company)) ?? null });
    await db
      .update(discoveredJobs)
      .set({ ...c, classVersion: CLASS_VERSION })
      .where(eq(discoveredJobs.id, r.id));
  }
  return rows.length;
}

const globalForClassify = globalThis as unknown as { jobFinderBackfill?: Promise<unknown> };

/** Starts a backfill if one isn't running; safe to call on every page load. */
export function ensureClassified() {
  globalForClassify.jobFinderBackfill ??= backfillClassification()
    .catch((e) => console.error("Classifying jobs failed", e))
    .finally(() => {
      globalForClassify.jobFinderBackfill = undefined;
    });
  return globalForClassify.jobFinderBackfill;
}

async function naicsFor(companies: string[]): Promise<Map<string, string>> {
  const keys = Array.from(new Set(companies.map(companyKey).filter(Boolean)));
  const out = new Map<string, string>();
  for (let i = 0; i < keys.length; i += 500) {
    const rows = await db
      .select({ key: h1bEmployers.nameKey, naics: h1bEmployers.naics })
      .from(h1bEmployers)
      .where(inArray(h1bEmployers.nameKey, keys.slice(i, i + 500)));
    for (const r of rows) if (r.naics) out.set(r.key, r.naics);
  }
  return out;
}

// --------------------------------------------------------------- H-1B data

export interface H1bInfo {
  approvals: number;
  initialApprovals: number;
  fiscalYear: number;
}

/** H-1B history for a set of companies, keyed by companyKey(). */
export async function h1bFor(companies: string[]): Promise<Map<string, H1bInfo>> {
  const keys = Array.from(new Set(companies.map(companyKey).filter(Boolean)));
  const out = new Map<string, H1bInfo>();
  for (let i = 0; i < keys.length; i += 500) {
    const rows = await db.select().from(h1bEmployers).where(inArray(h1bEmployers.nameKey, keys.slice(i, i + 500)));
    for (const r of rows) {
      out.set(r.nameKey, { approvals: r.totalApprovals, initialApprovals: r.initialApprovals, fiscalYear: r.fiscalYear });
    }
  }
  return out;
}

export async function h1bStats() {
  const row = await db
    .select({ n: sql<number>`count(*)`, year: sql<number | null>`max(${h1bEmployers.fiscalYear})` })
    .from(h1bEmployers);
  return { employers: row[0]?.n ?? 0, fiscalYear: row[0]?.year ?? null };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === "," || ch === "\t") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const num = (s: string | undefined) => Number((s ?? "").replace(/[^\d.-]/g, "")) || 0;

/**
 * Imports a USCIS H-1B Employer Data Hub export (any year's CSV). Both the
 * older layout (Employer, Initial Approval, Continuing Approval, …) and the
 * newer one (Employer (Petitioner) Name, New Employment Approval, …) work.
 */
export async function importH1bCsv(csv: string): Promise<{ rows: number; employers: number; fiscalYear: number | null }> {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("That file is empty.");
  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, " ").trim());
  const col = (re: RegExp) => header.findIndex((h) => re.test(h));
  const iName = col(/employer|petitioner name/);
  const iYear = col(/fiscal year/);
  const iNaics = col(/naics/);
  const iState = col(/^state$|petitioner state/);
  const iCity = col(/^city$|petitioner city/);
  const approvalCols = header.map((h, i) => (/approval/.test(h) ? i : -1)).filter((i) => i >= 0);
  const initialCols = header.map((h, i) => (/(initial|new employment) approval/.test(h) ? i : -1)).filter((i) => i >= 0);
  const denialCols = header.map((h, i) => (/denial/.test(h) ? i : -1)).filter((i) => i >= 0);
  if (iName < 0 || !approvalCols.length) {
    throw new Error("This doesn't look like a USCIS H-1B Employer Data Hub file (no Employer or Approval columns).");
  }

  type Agg = { name: string; year: number; initial: number; total: number; denials: number; naics: string; state: string; city: string };
  const agg = new Map<string, Agg>();
  let rows = 0;
  let maxYear: number | null = null;
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const name = cells[iName];
    if (!name) continue;
    rows++;
    const year = iYear >= 0 ? num(cells[iYear]) : 0;
    if (year && (!maxYear || year > maxYear)) maxYear = year;
    const total = approvalCols.reduce((s, i) => s + num(cells[i]), 0);
    const initial = initialCols.reduce((s, i) => s + num(cells[i]), 0);
    const denials = denialCols.reduce((s, i) => s + num(cells[i]), 0);
    for (const key of companyKeyVariants(name)) {
      const a = agg.get(key);
      if (a) {
        a.total += total;
        a.initial += initial;
        a.denials += denials;
        a.year = Math.max(a.year, year);
      } else {
        agg.set(key, {
          name,
          year,
          initial,
          total,
          denials,
          naics: iNaics >= 0 ? cells[iNaics] : "",
          state: iState >= 0 ? cells[iState] : "",
          city: iCity >= 0 ? cells[iCity] : "",
        });
      }
    }
  }

  const entries = [...agg.entries()].filter(([, a]) => a.total > 0);
  // Replace older data for the same employers; keep the rest.
  for (let i = 0; i < entries.length; i += 400) {
    const chunk = entries.slice(i, i + 400).map(([key, a]) => ({
      nameKey: key,
      name: a.name,
      fiscalYear: a.year || maxYear || 0,
      initialApprovals: a.initial,
      totalApprovals: a.total,
      denials: a.denials,
      naics: a.naics || null,
      state: a.state || null,
      city: a.city || null,
    }));
    await db
      .insert(h1bEmployers)
      .values(chunk)
      .onConflictDoUpdate({
        target: h1bEmployers.nameKey,
        // Keep the newest year's numbers when files for several years are imported.
        setWhere: sql`excluded.fiscal_year >= ${h1bEmployers.fiscalYear}`,
        set: {
          name: sql`excluded.name`,
          fiscalYear: sql`excluded.fiscal_year`,
          initialApprovals: sql`excluded.initial_approvals`,
          totalApprovals: sql`excluded.total_approvals`,
          denials: sql`excluded.denials`,
          naics: sql`excluded.naics`,
          state: sql`excluded.state`,
          city: sql`excluded.city`,
        },
      });
  }
  // Industry may now be known from NAICS codes; reclassify "other" jobs.
  await db
    .update(discoveredJobs)
    .set({ classVersion: 0 })
    .where(or(eq(discoveredJobs.industry, "other"), isNull(discoveredJobs.industry)));
  void ensureClassified();
  return { rows, employers: entries.length, fiscalYear: maxYear };
}

export const USCIS_DATA_HUB = "https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub";

/** Tries to download recent Data Hub files straight from USCIS. */
export async function downloadH1b(): Promise<{ year: number; employers: number }[]> {
  const results: { year: number; employers: number }[] = [];
  const thisYear = new Date().getFullYear();
  for (let year = thisYear; year >= thisYear - 4 && results.length < 2; year--) {
    const url = `https://www.uscis.gov/sites/default/files/document/data/h1b_datahubexport-${year}.csv`;
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36", accept: "text/csv,*/*" },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (!/employer/i.test(text.slice(0, 500))) continue;
      const r = await importH1bCsv(text);
      results.push({ year, employers: r.employers });
    } catch {
      // try the next year
    }
  }
  return results;
}

export { industryFromNaics };
