// Filters for found jobs, shared by the Found jobs page, the JSON API and the
// agent tools. They round-trip through URL search params.

export const VISA_FILTERS = [
  { id: "friendly", label: "Friendly to F-1 students", hint: "Sponsors, open to OPT/CPT, or a known H-1B sponsor that doesn't rule it out" },
  { id: "nored", label: "Hide red flags", hint: "Hides “no sponsorship” and “US citizens only”" },
  { id: "sponsors", label: "Says it sponsors visas", hint: "The posting offers sponsorship" },
  { id: "h1b", label: "Known H-1B sponsors", hint: "The company sponsored H-1B visas recently (USCIS data)" },
  { id: "red", label: "Only red flags", hint: "No sponsorship or US citizens only" },
] as const;

export type VisaFilter = (typeof VISA_FILTERS)[number]["id"];

export const POSTED_FILTERS = [
  { id: "1", label: "Past 24 hours" },
  { id: "3", label: "Past 3 days" },
  { id: "7", label: "Past week" },
  { id: "14", label: "Past 2 weeks" },
  { id: "30", label: "Past month" },
] as const;

export const LEVEL_FILTERS = [
  { id: "internship", label: "Internship" },
  { id: "entry", label: "Entry level / new grad" },
  { id: "other", label: "Not stated" },
] as const;

export const JOB_TYPE_FILTERS = [
  { id: "internship", label: "Internship" },
  { id: "full_time", label: "Full-time" },
  { id: "part_time", label: "Part-time" },
  { id: "contract", label: "Contract" },
] as const;

export const WORKPLACE_FILTERS = [
  { id: "remote", label: "Remote" },
  { id: "hybrid", label: "Hybrid" },
  { id: "onsite", label: "Onsite" },
] as const;

export interface FoundFilters {
  status?: string; // new | saved | dismissed | all
  searchId?: string;
  minScore?: number;
  q?: string;
  sort?: "score" | "newest" | "posted" | "deadline";
  industries?: string[];
  roles?: string[];
  visa?: VisaFilter;
  levels?: string[];
  jobTypes?: string[];
  workplaces?: string[];
  states?: string[];
  postedDays?: number;
  sources?: string[];
  maxYears?: number;
  hasPay?: boolean;
  ids?: string[];
  limit?: number;
  offset?: number;
}

const list = (v: string | null) =>
  v
    ? v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

/** Reads filters from URL search params (the Found jobs page and /api/found use the same names). */
export function filtersFromParams(p: URLSearchParams): FoundFilters {
  const num = (k: string) => {
    const v = p.get(k);
    return v !== null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : undefined;
  };
  const visa = p.get("visa");
  // Old links used ?sponsor=1 to hide "no sponsorship".
  const legacyVisa = p.get("sponsor") === "1" ? "nored" : undefined;
  return {
    status: p.get("status") ?? "new",
    searchId: p.get("search") ?? undefined,
    minScore: num("min"),
    q: p.get("q") ?? undefined,
    sort: (p.get("sort") as FoundFilters["sort"]) ?? "score",
    industries: list(p.get("industry")),
    roles: list(p.get("role")),
    visa: (VISA_FILTERS.some((v) => v.id === visa) ? visa : legacyVisa) as VisaFilter | undefined,
    levels: list(p.get("level")),
    jobTypes: list(p.get("type")),
    workplaces: list(p.get("work")),
    states: list(p.get("state")),
    postedDays: num("posted"),
    sources: list(p.get("source")),
    maxYears: num("years"),
    hasPay: p.get("pay") === "1",
    ids: list(p.get("ids")),
    limit: num("limit"),
    offset: num("offset"),
  };
}

/** The param names that count as filters (for "Clear filters"). */
export const FILTER_PARAMS = ["industry", "role", "visa", "level", "type", "work", "state", "posted", "source", "years", "pay", "min", "search", "q", "sponsor"];

export function paramsFromRecord(record: Record<string, string | string[] | undefined>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(record)) {
    if (Array.isArray(v)) {
      if (v[0] !== undefined) p.set(k, v[0]);
    } else if (v !== undefined) p.set(k, v);
  }
  return p;
}
