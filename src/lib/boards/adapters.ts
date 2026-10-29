import { decodeEntities, htmlToText } from "@/lib/import/html";
import {
  formatSalary,
  normalizeJobType,
  normalizeWorkplace,
  workplaceFromText,
} from "@/lib/import/normalize";
import { getJson, mapLimit } from "./http";
import type { BoardAdapter, BoardRef, Posting, Provider } from "./types";

// ------------------------------------------------------------- Greenhouse
// The list endpoint has titles and locations; the description is fetched per
// job only for jobs whose title already matched.

interface GreenhouseListJob {
  id: number;
  title?: string;
  location?: { name?: string } | null;
  absolute_url?: string;
  updated_at?: string;
  first_published?: string;
}
interface GreenhouseDetail extends GreenhouseListJob {
  content?: string;
  pay_input_ranges?: { min_cents?: number; max_cents?: number; currency_type?: string }[];
}

const GH_API = "https://boards-api.greenhouse.io/v1/boards";

const greenhouse: BoardAdapter = {
  async list(board, { signal }) {
    const data = await getJson<{ jobs?: GreenhouseListJob[] }>(
      `${GH_API}/${encodeURIComponent(board.token)}/jobs`,
      { signal },
    );
    return (data.jobs ?? []).map((j) => ({
      provider: "greenhouse",
      boardToken: board.token,
      company: board.name,
      externalId: String(j.id),
      title: (j.title ?? "").trim(),
      location: j.location?.name ?? undefined,
      url: j.absolute_url ?? `https://boards.greenhouse.io/${board.token}/jobs/${j.id}`,
      postedAt: j.first_published ?? j.updated_at,
      workplace: workplaceFromText(j.location?.name),
    }));
  },
  async detail(board, posting, signal) {
    const j = await getJson<GreenhouseDetail>(
      `${GH_API}/${encodeURIComponent(board.token)}/jobs/${posting.externalId}?pay_transparency=true`,
      { signal },
    );
    const pay = j.pay_input_ranges?.[0];
    return {
      description: htmlToText(decodeEntities(j.content ?? "")),
      salary: pay
        ? formatSalary(
            pay.min_cents != null ? pay.min_cents / 100 : null,
            pay.max_cents != null ? pay.max_cents / 100 : null,
            pay.currency_type,
          )
        : undefined,
    };
  },
};

// ------------------------------------------------------------------ Lever
// Returns full postings, paged 100 at a time.

interface LeverPosting {
  id: string;
  text?: string;
  hostedUrl?: string;
  createdAt?: number;
  workplaceType?: string;
  categories?: { commitment?: string; location?: string; allLocations?: string[] };
  descriptionPlain?: string;
  openingPlain?: string;
  additionalPlain?: string;
  lists?: { text?: string; content?: string }[];
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
}

const lever: BoardAdapter = {
  async list(board, { signal }) {
    const api = board.host === "eu" ? "https://api.eu.lever.co/v0/postings" : "https://api.lever.co/v0/postings";
    const all: Posting[] = [];
    let previousFirst: string | undefined;
    for (let page = 0; page < 10; page++) {
      const batch = await getJson<LeverPosting[]>(
        `${api}/${encodeURIComponent(board.token)}?mode=json&skip=${page * 100}&limit=100`,
        { signal },
      );
      if (!Array.isArray(batch) || batch.length === 0) break;
      if (batch[0]?.id === previousFirst) break; // board ignores paging
      previousFirst = batch[0]?.id;
      for (const p of batch) {
        const sections = (p.lists ?? []).map((s) =>
          [s.text?.trim(), htmlToText(s.content ?? "")].filter(Boolean).join("\n"),
        );
        const locations = p.categories?.allLocations?.length
          ? p.categories.allLocations
          : p.categories?.location
            ? [p.categories.location]
            : [];
        all.push({
          provider: "lever",
          boardToken: board.token,
          company: board.name,
          externalId: p.id,
          title: (p.text ?? "").trim(),
          location: locations.join(" · ") || undefined,
          url: p.hostedUrl ?? `https://jobs.lever.co/${board.token}/${p.id}`,
          postedAt: p.createdAt ? new Date(p.createdAt).toISOString() : undefined,
          description: [p.descriptionPlain?.trim() || p.openingPlain?.trim(), ...sections, p.additionalPlain?.trim()]
            .filter(Boolean)
            .join("\n\n"),
          jobType: normalizeJobType(p.categories?.commitment),
          workplace: normalizeWorkplace(p.workplaceType) ?? workplaceFromText(locations.join(" ")),
          salary: p.salaryRange
            ? formatSalary(p.salaryRange.min, p.salaryRange.max, p.salaryRange.currency, p.salaryRange.interval)
            : undefined,
        });
      }
      if (batch.length < 100) break;
    }
    return all;
  },
};

// ------------------------------------------------------------------ Ashby
// Returns the whole board with descriptions in one response.

interface AshbyJob {
  id: string;
  title?: string;
  location?: string;
  secondaryLocations?: { location?: string }[];
  employmentType?: string;
  workplaceType?: string;
  isListed?: boolean;
  jobUrl?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
  publishedAt?: string;
  compensation?: { compensationTierSummary?: string };
}

const ashby: BoardAdapter = {
  async list(board, { signal }) {
    const data = await getJson<{ jobs?: AshbyJob[] }>(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board.token)}?includeCompensation=true`,
      { signal },
    );
    return (data.jobs ?? [])
      .filter((j) => j.isListed !== false)
      .map((j) => {
        const locations = [j.location, ...(j.secondaryLocations ?? []).map((l) => l.location)]
          .map((l) => l?.trim())
          .filter((l): l is string => Boolean(l));
        return {
          provider: "ashby" as Provider,
          boardToken: board.token,
          company: board.name,
          externalId: j.id,
          title: (j.title ?? "").trim(),
          location: Array.from(new Set(locations)).join(" · ") || undefined,
          url: j.jobUrl ?? `https://jobs.ashbyhq.com/${board.token}/${j.id}`,
          postedAt: j.publishedAt,
          description: j.descriptionPlain?.trim() || htmlToText(j.descriptionHtml),
          jobType: normalizeJobType(j.employmentType),
          workplace: normalizeWorkplace(j.workplaceType),
          salary: j.compensation?.compensationTierSummary,
        };
      });
  },
};

// ---------------------------------------------------------------- Workday
// Uses the career site's own search, so large employers stay manageable.

interface WorkdayListPosting {
  title?: string;
  externalPath?: string;
  locationsText?: string;
  postedOn?: string;
  bulletFields?: string[];
}
interface WorkdayDetail {
  jobPostingInfo?: {
    title?: string;
    jobDescription?: string;
    location?: string;
    additionalLocations?: string[];
    timeType?: string;
    remoteType?: string;
    startDate?: string;
    externalUrl?: string;
  };
}

function workdayBase(board: BoardRef): string {
  return `https://${board.host}/wday/cxs/${board.token}/${board.site}`;
}

const workday: BoardAdapter = {
  async list(board, { signal, queries }) {
    if (!board.host || !board.site) return [];
    const searchTexts = queries?.length ? queries : [""];
    const byPath = new Map<string, Posting>();
    await mapLimit(
      searchTexts,
      2,
      async (searchText) => {
        for (let offset = 0; offset < 100; offset += 20) {
          const data = await getJson<{ total?: number; jobPostings?: WorkdayListPosting[] }>(
            `${workdayBase(board)}/jobs`,
            {
              signal,
              init: {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText }),
              },
            },
          );
          const postings = data.jobPostings ?? [];
          for (const p of postings) {
            if (!p.externalPath || !p.title || byPath.has(p.externalPath)) continue;
            byPath.set(p.externalPath, {
              provider: "workday",
              boardToken: board.token,
              company: board.name,
              externalId: p.externalPath,
              title: p.title.trim(),
              location: p.locationsText,
              url: `https://${board.host}/${board.site}${p.externalPath}`,
            });
          }
          if (postings.length < 20 || offset + 20 >= (data.total ?? 0)) break;
        }
      },
      signal,
    );
    return Array.from(byPath.values());
  },
  async detail(board, posting, signal) {
    const data = await getJson<WorkdayDetail>(`${workdayBase(board)}${posting.externalId}`, { signal });
    const info = data.jobPostingInfo;
    if (!info) return {};
    const locations = [info.location, ...(info.additionalLocations ?? [])].filter(
      (l): l is string => Boolean(l),
    );
    return {
      description: htmlToText(info.jobDescription),
      location: locations.join(" · ") || posting.location,
      jobType: normalizeJobType(info.timeType),
      workplace: normalizeWorkplace(info.remoteType) ?? workplaceFromText(locations.join(" ")),
      postedAt: info.startDate,
      url: info.externalUrl ?? posting.url,
    };
  },
};

// --------------------------------------------------------- SmartRecruiters
// Public postings API (no key). The list has location, industry and type; the
// description comes from the posting itself.

interface SrPosting {
  id: string;
  name?: string;
  releasedDate?: string;
  company?: { identifier?: string; name?: string };
  location?: { city?: string; region?: string; country?: string; remote?: boolean; fullLocation?: string };
  industry?: { label?: string };
  function?: { label?: string };
  typeOfEmployment?: { label?: string };
  experienceLevel?: { label?: string };
}
interface SrDetail extends SrPosting {
  applyUrl?: string;
  postingUrl?: string;
  jobAd?: { sections?: Record<string, { title?: string; text?: string } | undefined> };
}

const SR_API = "https://api.smartrecruiters.com/v1/companies";

const smartrecruiters: BoardAdapter = {
  async list(board, { signal }) {
    const all: Posting[] = [];
    for (let offset = 0; offset < 2000; offset += 100) {
      const data = await getJson<{ content?: SrPosting[]; totalFound?: number }>(
        `${SR_API}/${encodeURIComponent(board.token)}/postings?limit=100&offset=${offset}`,
        { signal },
      );
      for (const p of data.content ?? []) {
        const loc = p.location;
        const location =
          loc?.fullLocation ??
          [loc?.city, loc?.region, loc?.country?.toUpperCase()].filter(Boolean).join(", ") + (loc?.remote ? " (Remote)" : "");
        all.push({
          provider: "smartrecruiters",
          boardToken: board.token,
          company: p.company?.name ?? board.name,
          externalId: p.id,
          title: (p.name ?? "").trim(),
          location: location || undefined,
          url: `https://jobs.smartrecruiters.com/${encodeURIComponent(board.token)}/${p.id}`,
          postedAt: p.releasedDate,
          jobType: normalizeJobType(p.typeOfEmployment?.label),
          workplace: loc?.remote ? "remote" : undefined,
          sourceIndustry: p.industry?.label,
        });
      }
      if (!data.content?.length || offset + 100 >= (data.totalFound ?? 0)) break;
    }
    return all;
  },
  async detail(board, posting, signal) {
    const d = await getJson<SrDetail>(`${SR_API}/${encodeURIComponent(board.token)}/postings/${posting.externalId}`, { signal });
    const sections = Object.values(d.jobAd?.sections ?? {})
      .map((sec) => [sec?.title, htmlToText(sec?.text ?? "")].filter(Boolean).join("\n"))
      .filter(Boolean);
    return {
      description: sections.join("\n\n"),
      url: d.postingUrl ?? posting.url,
      applyUrl: d.applyUrl,
    };
  },
};

// ------------------------------------------------- Simplify lists (GitHub)
// SimplifyJobs keeps big, community-checked lists of internships and new-grad
// jobs on GitHub, with a sponsorship field. Descriptions are read from the
// company's own board when it's one we know.

interface SimplifyListing {
  company_name?: string;
  title?: string;
  url?: string;
  locations?: string[];
  date_posted?: number;
  active?: boolean;
  is_visible?: boolean;
  sponsorship?: string | null;
  category?: string;
  terms?: string[];
  id?: string;
}

export const SIMPLIFY_LISTS = [
  { token: "Summer2027-Internships", name: "Simplify: internships", level: "internship" },
  { token: "New-Grad-Positions", name: "Simplify: new grad jobs", level: "entry" },
] as const;

const SIMPLIFY_MAX_AGE_DAYS = 150;

/** Drops tracking parameters (utm_*, ref=Simplify, …) so the same job isn't saved twice. */
export function cleanJobUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|ref$|refs?rc$|src$|source$|gh_src$|lever-source|trk$|trackingid$|refid$)/i.test(key)) u.searchParams.delete(key);
    }
    u.hash = "";
    return u.toString().replace(/\?$/, "");
  } catch {
    return url;
  }
}

/** Finds the company board behind a job link, so its description can be read. */
export function boardFromUrl(url: string): { board: BoardRef; externalId: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const parts = u.pathname.split("/").filter(Boolean);
  if (/(^|\.)greenhouse\.io$/.test(u.hostname)) {
    const i = parts.indexOf("jobs");
    const token = u.searchParams.get("for") ?? (i > 0 ? parts[i - 1] : parts[0]);
    const id = u.searchParams.get("token") ?? u.searchParams.get("gh_jid") ?? (i >= 0 ? parts[i + 1] : undefined);
    if (token && id && /^\d+$/.test(id)) return { board: { provider: "greenhouse", token, name: token }, externalId: id };
  }
  if (u.hostname === "jobs.lever.co" || u.hostname === "jobs.eu.lever.co") {
    if (parts[0] && parts[1]) {
      return {
        board: { provider: "lever", token: parts[0], name: parts[0], host: u.hostname.includes(".eu.") ? "eu" : undefined },
        externalId: parts[1],
      };
    }
  }
  if (/\.myworkdayjobs\.com$/.test(u.hostname)) {
    const tenant = u.hostname.split(".")[0];
    const rest = parts[0] && /^[a-z]{2}-[A-Z]{2}$/.test(parts[0]) ? parts.slice(1) : parts;
    const site = rest[0];
    const jobIdx = rest.indexOf("job");
    if (site && jobIdx > 0) {
      return {
        board: { provider: "workday", token: tenant, name: tenant, host: u.hostname, site },
        externalId: "/" + rest.slice(jobIdx).join("/"),
      };
    }
  }
  if (u.hostname === "jobs.ashbyhq.com" && parts[0]) {
    return { board: { provider: "ashby", token: parts[0], name: parts[0] }, externalId: parts[1] ?? "" };
  }
  if (u.hostname === "jobs.smartrecruiters.com" && parts[0] && parts[1]) {
    return { board: { provider: "smartrecruiters", token: parts[0], name: parts[0] }, externalId: parts[1].split("-")[0] };
  }
  return null;
}

const simplify: BoardAdapter = {
  async list(board, { signal }) {
    const data = await getJson<SimplifyListing[]>(
      `https://raw.githubusercontent.com/SimplifyJobs/${encodeURIComponent(board.token)}/dev/.github/scripts/listings.json`,
      { signal, timeoutMs: 60_000 },
    );
    const cutoff = Date.now() / 1000 - SIMPLIFY_MAX_AGE_DAYS * 86_400;
    const isInternships = /intern/i.test(board.token);
    return (Array.isArray(data) ? data : [])
      .filter((l) => l.active && l.is_visible !== false && l.url && l.title && (l.date_posted ?? 0) >= cutoff)
      .map((l) => ({
        provider: "simplify" as Provider,
        boardToken: board.token,
        company: (l.company_name ?? "").trim(),
        externalId: l.id ?? l.url!,
        title: l.title!.trim(),
        location: (l.locations ?? []).join(" · ") || undefined,
        url: cleanJobUrl(l.url!),
        postedAt: l.date_posted ? new Date(l.date_posted * 1000).toISOString() : undefined,
        jobType: isInternships ? "internship" : "full_time",
        workplace: workplaceFromText((l.locations ?? []).join(" ")),
        visaHint: l.sponsorship && l.sponsorship !== "Other" ? l.sponsorship : undefined,
        category: l.category,
      }));
  },
  async detail(_board, posting, signal) {
    const found = boardFromUrl(posting.url);
    if (!found) return {};
    if (found.board.provider === "lever") {
      const api = found.board.host === "eu" ? "https://api.eu.lever.co/v0/postings" : "https://api.lever.co/v0/postings";
      const p = await getJson<LeverPosting>(`${api}/${encodeURIComponent(found.board.token)}/${found.externalId}?mode=json`, { signal });
      const sections = (p.lists ?? []).map((sec) => [sec.text?.trim(), htmlToText(sec.content ?? "")].filter(Boolean).join("\n"));
      return {
        description: [p.descriptionPlain?.trim() || p.openingPlain?.trim(), ...sections, p.additionalPlain?.trim()]
          .filter(Boolean)
          .join("\n\n"),
      };
    }
    const adapter = ADAPTERS[found.board.provider];
    if (!adapter?.detail || found.board.provider === "simplify") return {};
    const detail = await adapter.detail(found.board, { ...posting, externalId: found.externalId }, signal);
    // Keep the Simplify link; it points at the same posting.
    return { description: detail.description, salary: detail.salary, jobType: detail.jobType ?? posting.jobType };
  },
};

export const ADAPTERS: Record<Provider, BoardAdapter> = { greenhouse, lever, ashby, workday, smartrecruiters, simplify };
