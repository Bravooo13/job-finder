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

export const ADAPTERS: Record<Provider, BoardAdapter> = { greenhouse, lever, ashby, workday };
