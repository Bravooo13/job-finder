import { prettifySlug } from "@/lib/utils";
import { fetchJson } from "./fetch";
import { decodeEntities, htmlToText } from "./html";
import {
  formatSalary,
  normalizeJobType,
  normalizeWorkplace,
  workplaceFromText,
} from "./normalize";
import { ImportError, type ImportedJob } from "./types";

// Each provider recognizes its own URLs and reads the job straight from that
// board's public JSON feed, which is cleaner than scraping the page.

export interface Provider {
  name: string;
  match(url: URL): boolean;
  load(url: URL): Promise<ImportedJob>;
}

// ------------------------------------------------------------- Greenhouse

interface GreenhouseJob {
  title?: string;
  company_name?: string;
  location?: { name?: string } | null;
  content?: string;
  absolute_url?: string;
  first_published?: string;
  updated_at?: string;
  pay_input_ranges?: {
    min_cents?: number;
    max_cents?: number;
    currency_type?: string;
  }[];
}

function greenhouseParts(url: URL): { token: string; id: string; eu: boolean } | null {
  const eu = url.hostname.includes(".eu.");
  if (url.pathname.startsWith("/embed/job_app")) {
    const token = url.searchParams.get("for");
    const id = url.searchParams.get("token");
    return token && id ? { token, id, eu } : null;
  }
  const m = url.pathname.match(/^\/([^/]+)\/jobs\/(\d+)/);
  return m ? { token: m[1], id: m[2], eu } : null;
}

export const greenhouse: Provider = {
  name: "Greenhouse",
  match: (url) =>
    /(^|\.)greenhouse\.io$/.test(url.hostname) && greenhouseParts(url) !== null,
  async load(url) {
    const parts = greenhouseParts(url);
    if (!parts) throw new ImportError("Unrecognized Greenhouse link.");
    const api = parts.eu
      ? "https://boards-api.eu.greenhouse.io/v1/boards"
      : "https://boards-api.greenhouse.io/v1/boards";
    const job = await fetchJson<GreenhouseJob>(
      `${api}/${encodeURIComponent(parts.token)}/jobs/${parts.id}?pay_transparency=true`,
    );
    let company = job.company_name;
    if (!company) {
      const board = await fetchJson<{ name?: string }>(
        `${api}/${encodeURIComponent(parts.token)}`,
      ).catch(() => ({ name: undefined }));
      company = board.name;
    }
    const pay = job.pay_input_ranges?.[0];
    const location = job.location?.name ?? undefined;
    return {
      title: job.title?.trim() ?? "",
      company: company ?? prettifySlug(parts.token),
      location,
      description: htmlToText(decodeEntities(job.content ?? "")),
      url: job.absolute_url ?? url.toString(),
      source: "Greenhouse",
      workplace: workplaceFromText(location),
      salary: pay
        ? formatSalary(
            pay.min_cents != null ? pay.min_cents / 100 : null,
            pay.max_cents != null ? pay.max_cents / 100 : null,
            pay.currency_type,
          )
        : undefined,
      postedAt: job.first_published ?? job.updated_at,
    };
  },
};

// ------------------------------------------------------------------ Lever

interface LeverPosting {
  text?: string;
  hostedUrl?: string;
  createdAt?: number;
  workplaceType?: string;
  categories?: {
    commitment?: string;
    location?: string;
    allLocations?: string[];
  };
  descriptionPlain?: string;
  openingPlain?: string;
  additionalPlain?: string;
  lists?: { text?: string; content?: string }[];
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
}

export const lever: Provider = {
  name: "Lever",
  match: (url) =>
    /^jobs\.(eu\.)?lever\.co$/.test(url.hostname) &&
    /^\/[^/]+\/[0-9a-f-]{36}/i.test(url.pathname),
  async load(url) {
    const [, company, id] = url.pathname.split("/");
    const api = url.hostname.startsWith("jobs.eu.")
      ? "https://api.eu.lever.co/v0/postings"
      : "https://api.lever.co/v0/postings";
    const p = await fetchJson<LeverPosting>(
      `${api}/${encodeURIComponent(company)}/${id}?mode=json`,
    );
    // descriptionPlain already includes the opening; the `lists` sections
    // (responsibilities, requirements) only exist as HTML. Same approach as
    // JobSync's Lever mapper.
    const sections = (p.lists ?? []).map((s) =>
      [s.text?.trim(), htmlToText(s.content ?? "")].filter(Boolean).join("\n"),
    );
    const description = [
      p.descriptionPlain?.trim() || p.openingPlain?.trim(),
      ...sections,
      p.additionalPlain?.trim(),
    ]
      .filter(Boolean)
      .join("\n\n");
    const locations = p.categories?.allLocations?.length
      ? p.categories.allLocations
      : p.categories?.location
        ? [p.categories.location]
        : [];
    return {
      title: p.text?.trim() ?? "",
      company: prettifySlug(company),
      location: locations.join(" · ") || undefined,
      description,
      url: p.hostedUrl ?? url.toString(),
      source: "Lever",
      jobType: normalizeJobType(p.categories?.commitment),
      workplace:
        normalizeWorkplace(p.workplaceType) ?? workplaceFromText(locations.join(" ")),
      salary: p.salaryRange
        ? formatSalary(
            p.salaryRange.min,
            p.salaryRange.max,
            p.salaryRange.currency,
            p.salaryRange.interval,
          )
        : undefined,
      postedAt: p.createdAt ? new Date(p.createdAt).toISOString() : undefined,
    };
  },
};

// ------------------------------------------------------------------ Ashby

interface AshbyJob {
  id: string;
  title?: string;
  location?: string;
  secondaryLocations?: { location?: string }[];
  employmentType?: string;
  workplaceType?: string;
  jobUrl?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  publishedAt?: string;
  compensation?: { compensationTierSummary?: string };
}

export const ashby: Provider = {
  name: "Ashby",
  match: (url) =>
    url.hostname === "jobs.ashbyhq.com" &&
    /^\/[^/]+\/[0-9a-f-]{36}/i.test(url.pathname),
  async load(url) {
    const [, org, id] = url.pathname.split("/");
    const board = await fetchJson<{ jobs?: AshbyJob[] }>(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(org)}?includeCompensation=true`,
    );
    const job = board.jobs?.find((j) => j.id === id);
    if (!job) throw new ImportError("That job is no longer listed on the company's board.");
    const locations = [job.location, ...(job.secondaryLocations ?? []).map((l) => l.location)]
      .map((l) => l?.trim())
      .filter((l): l is string => Boolean(l));
    return {
      title: job.title?.trim() ?? "",
      company: prettifySlug(decodeURIComponent(org)),
      location: Array.from(new Set(locations)).join(" · ") || undefined,
      description: job.descriptionHtml
        ? htmlToText(job.descriptionHtml)
        : (job.descriptionPlain ?? ""),
      url: job.jobUrl ?? url.toString(),
      source: "Ashby",
      jobType: normalizeJobType(job.employmentType),
      workplace: normalizeWorkplace(job.workplaceType),
      salary: job.compensation?.compensationTierSummary,
      postedAt: job.publishedAt,
    };
  },
};

// ---------------------------------------------------------------- Workday

interface WorkdayJob {
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
  hiringOrganization?: { name?: string };
}

function workdayApiUrl(url: URL): string | null {
  const segments = url.pathname.split("/").filter(Boolean);
  // Drop a leading locale such as "en-US".
  if (segments[0] && /^[a-z]{2}(-[A-Z]{2})?$/.test(segments[0])) segments.shift();

  let tenant: string;
  let rest: string[];
  if (url.hostname.endsWith(".myworkdaysite.com")) {
    // wd5.myworkdaysite.com/recruiting/{tenant}/{site}/job/...
    if (segments[0] !== "recruiting") return null;
    tenant = segments[1];
    rest = segments.slice(2);
  } else {
    // {tenant}.wd5.myworkdayjobs.com/{site}/job/...
    tenant = url.hostname.split(".")[0];
    rest = segments;
  }
  const [site, kind, ...jobPath] = rest;
  if (!tenant || !site || !["job", "details"].includes(kind) || jobPath.length === 0) {
    return null;
  }
  return `https://${url.hostname}/wday/cxs/${tenant}/${site}/${kind}/${jobPath.join("/")}`;
}

export const workday: Provider = {
  name: "Workday",
  match: (url) =>
    /\.(myworkdayjobs|myworkdaysite)\.com$/.test(url.hostname) &&
    workdayApiUrl(url) !== null,
  async load(url) {
    const api = workdayApiUrl(url);
    if (!api) throw new ImportError("Unrecognized Workday link.");
    const data = await fetchJson<WorkdayJob>(api);
    const info = data.jobPostingInfo;
    if (!info?.title) throw new ImportError("Workday didn't return this job.");
    const locations = [info.location, ...(info.additionalLocations ?? [])].filter(
      (l): l is string => Boolean(l),
    );
    return {
      title: info.title.trim(),
      company:
        data.hiringOrganization?.name ?? prettifySlug(url.hostname.split(".")[0]),
      location: locations.join(" · ") || undefined,
      description: htmlToText(info.jobDescription),
      url: info.externalUrl ?? url.toString(),
      source: "Workday",
      jobType: normalizeJobType(info.timeType),
      workplace: normalizeWorkplace(info.remoteType) ?? workplaceFromText(locations.join(" ")),
      postedAt: info.startDate,
    };
  },
};

export const PROVIDERS: Provider[] = [greenhouse, lever, ashby, workday];
