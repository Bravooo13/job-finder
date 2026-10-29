import "server-only";
import { getJson } from "./http";
import type { BoardRef } from "./types";

// Finds a company's job board from a careers link or just its name, and checks
// that the board really exists.

export interface FoundBoard extends BoardRef {
  jobCount: number;
  careersUrl: string;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

/** Recognizes board URLs (also inside a careers page's HTML). */
export function boardsInText(text: string): Omit<BoardRef, "name">[] {
  const found = new Map<string, Omit<BoardRef, "name">>();
  const add = (b: Omit<BoardRef, "name">) => {
    const token = b.token.toLowerCase();
    if (!token || ["embed", "v1", "api", "jobs", "boards"].includes(token)) return;
    const keepCase = b.provider === "workday" || b.provider === "smartrecruiters";
    found.set(`${b.provider}:${token}:${b.site ?? ""}`, { ...b, token: keepCase ? b.token : token });
  };
  for (const m of text.matchAll(/(?:job-boards|boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9_-]+)/gi)) {
    add({ provider: "greenhouse", token: m[1] });
  }
  for (const m of text.matchAll(/greenhouse\.io\/embed\/job_board(?:\/js)?\?for=([a-z0-9_-]+)/gi)) {
    add({ provider: "greenhouse", token: m[1] });
  }
  for (const m of text.matchAll(/boards-api\.greenhouse\.io\/v1\/boards\/([a-z0-9_-]+)/gi)) {
    add({ provider: "greenhouse", token: m[1] });
  }
  for (const m of text.matchAll(/jobs\.(eu\.)?lever\.co\/([a-z0-9_.-]+)/gi)) {
    add({ provider: "lever", token: m[2], host: m[1] ? "eu" : undefined });
  }
  for (const m of text.matchAll(/jobs\.ashbyhq\.com\/([a-z0-9_.%-]+)/gi)) {
    add({ provider: "ashby", token: decodeURIComponent(m[1]) });
  }
  for (const m of text.matchAll(
    /([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:(?:[a-z]{2}-[A-Z]{2})\/)?([A-Za-z0-9_-]+)/g,
  )) {
    if (["wday", "job", "details"].includes(m[3])) continue;
    add({ provider: "workday", token: m[1], host: `${m[1]}.${m[2]}.myworkdayjobs.com`, site: m[3] });
  }
  for (const m of text.matchAll(/(?:jobs|careers)\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/g)) {
    if (["oneclick-ui", "sr-jobs", "jobs"].includes(m[1].toLowerCase())) continue;
    add({ provider: "smartrecruiters", token: m[1] });
  }
  for (const m of text.matchAll(/api\.smartrecruiters\.com\/v1\/companies\/([A-Za-z0-9_-]+)/g)) {
    add({ provider: "smartrecruiters", token: m[1] });
  }
  for (const m of text.matchAll(/(wd\d+)\.myworkdaysite\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?recruiting\/([a-z0-9-]+)\/([A-Za-z0-9_-]+)/g)) {
    add({ provider: "workday", token: m[2], host: `${m[1]}.myworkdaysite.com`, site: m[3] });
  }
  return Array.from(found.values());
}

async function fetchPage(url: string): Promise<{ url: string; html: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return { url: res.url || url, html: (await res.text()).slice(0, 3_000_000) };
  } catch {
    return null;
  }
}

/** Links on a careers page that probably lead to the job search. */
function jobLinks(html: string, base: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    const [, href, label] = m;
    const text = `${href} ${label.replace(/<[^>]+>/g, " ")}`.toLowerCase();
    if (!/(job|career|opening|opportunit|position|search|apply|workday|students|university|early)/.test(text)) continue;
    try {
      const u = new URL(href, base);
      if (u.protocol.startsWith("http")) out.add(u.toString());
    } catch {
      // ignore bad links
    }
  }
  return Array.from(out);
}

/** Workday sites usually live at {company}.wd{N}.myworkdayjobs.com and redirect to their career site. */
async function guessWorkday(slugs: string[]): Promise<Omit<BoardRef, "name">[]> {
  const hosts = slugs.flatMap((slug) => [1, 5, 3, 12].map((n) => `${slug}.wd${n}.myworkdayjobs.com`));
  const pages = await Promise.all(hosts.map((h) => fetchPage(`https://${h}/`)));
  return pages.flatMap((p) => (p ? boardsInText(`${p.url}\n${p.html.slice(0, 200_000)}`) : []));
}

function prettify(token: string): string {
  return token.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Confirms a board exists and returns its name and current job count. */
export async function verifyBoard(b: Omit<BoardRef, "name"> & { name?: string }): Promise<FoundBoard | null> {
  try {
    if (b.provider === "greenhouse") {
      const [info, jobs] = await Promise.all([
        getJson<{ name?: string }>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(b.token)}`, { timeoutMs: 10_000 }),
        getJson<{ jobs?: unknown[] }>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(b.token)}/jobs`, { timeoutMs: 15_000 }),
      ]);
      return {
        ...b,
        // Prefer the board's own name, so a wrong guess is easy to spot.
        name: info.name || b.name || prettify(b.token),
        jobCount: jobs.jobs?.length ?? 0,
        careersUrl: `https://job-boards.greenhouse.io/${b.token}`,
      };
    }
    if (b.provider === "lever") {
      const api = b.host === "eu" ? "https://api.eu.lever.co/v0/postings" : "https://api.lever.co/v0/postings";
      const jobs = await getJson<unknown[]>(`${api}/${encodeURIComponent(b.token)}?mode=json`, { timeoutMs: 15_000 });
      if (!Array.isArray(jobs)) return null;
      return {
        ...b,
        name: b.name || prettify(b.token),
        jobCount: jobs.length,
        careersUrl: `https://jobs.${b.host === "eu" ? "eu." : ""}lever.co/${b.token}`,
      };
    }
    if (b.provider === "ashby") {
      const data = await getJson<{ jobs?: unknown[] }>(
        `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(b.token)}`,
        { timeoutMs: 15_000 },
      );
      if (!Array.isArray(data.jobs)) return null;
      return {
        ...b,
        name: b.name || prettify(b.token),
        jobCount: data.jobs.length,
        careersUrl: `https://jobs.ashbyhq.com/${b.token}`,
      };
    }
    if (b.provider === "smartrecruiters") {
      const data = await getJson<{ totalFound?: number; content?: { company?: { name?: string } }[] }>(
        `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(b.token)}/postings?limit=1`,
        { timeoutMs: 15_000 },
      );
      if (typeof data.totalFound !== "number" || data.totalFound === 0) return null;
      return {
        ...b,
        name: data.content?.[0]?.company?.name || b.name || prettify(b.token),
        jobCount: data.totalFound,
        careersUrl: `https://jobs.smartrecruiters.com/${b.token}`,
      };
    }
    if (b.provider === "workday" && b.host && b.site) {
      const data = await getJson<{ total?: number }>(
        `https://${b.host}/wday/cxs/${b.token}/${b.site}/jobs`,
        {
          timeoutMs: 15_000,
          init: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ appliedFacets: {}, limit: 1, offset: 0, searchText: "" }),
          },
        },
      );
      if (typeof data.total !== "number") return null;
      return {
        ...b,
        name: b.name || prettify(b.token),
        jobCount: data.total,
        careersUrl: `https://${b.host}/${b.site}`,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function slugGuesses(name: string): string[] {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and")
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company|group|holdings|technologies|technology)\b\.?/g, "")
    .trim();
  const words = base.split(/[^a-z0-9]+/).filter(Boolean);
  if (!words.length) return [];
  const joined = words.join("");
  return Array.from(new Set([joined, words.join("-"), words[0], `${joined}careers`, `${joined}inc`]));
}

/** Finds boards from a careers URL, a board URL, or a company name. */
export async function findBoards(input: string): Promise<FoundBoard[]> {
  const text = input.trim();
  if (!text) return [];

  let candidates = boardsInText(text);
  const looksLikeUrl = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/|$)/i.test(text);

  if (!candidates.length && looksLikeUrl) {
    // A company careers page: look inside it, and one click deeper, for a board.
    const url = /^https?:\/\//i.test(text) ? text : `https://${text}`;
    const page = await fetchPage(url);
    if (page) {
      candidates = boardsInText(`${page.url}\n${page.html}`);
      if (!candidates.length) {
        const links = jobLinks(page.html, page.url).slice(0, 6);
        const deeper = await Promise.all(links.map((l) => fetchPage(l)));
        for (const d of deeper) if (d) candidates.push(...boardsInText(`${d.url}\n${d.html}`));
      }
    }
  }

  if (!candidates.length && !looksLikeUrl) {
    // Just a name: try the usual board slugs on each provider.
    const slugs = slugGuesses(text);
    for (const slug of slugs) {
      candidates.push({ provider: "greenhouse", token: slug });
      candidates.push({ provider: "lever", token: slug });
      candidates.push({ provider: "ashby", token: slug });
    }
    const srToken = text.replace(/\b(inc|llc|ltd|corp|corporation|co|company)\b\.?/gi, "").replace(/[^A-Za-z0-9]/g, "");
    if (srToken) candidates.unshift({ provider: "smartrecruiters", token: srToken });
    candidates.push(...(await guessWorkday(slugs.slice(0, 2))));
  }

  const name = looksLikeUrl ? undefined : text;
  const verified = await Promise.all(candidates.slice(0, 20).map((c) => verifyBoard({ ...c, name })));
  const seen = new Set<string>();
  return verified.filter((b): b is FoundBoard => {
    if (!b) return false;
    const key = `${b.provider}:${b.token}:${b.site ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
