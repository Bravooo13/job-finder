// Reading LinkedIn's public (guest) job pages: pure functions, no network or
// database, so they can be tested on saved pages.
import { decodeEntities, htmlToText } from "@/lib/import/html";

const BASE = "https://www.linkedin.com";

// ------------------------------------------------------------- HTML bits

const strip = (s: string) => decodeEntities(s.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** Inner HTML of the first element whose class list has `cls` (nested tags of the same name are matched). */
export function elementHtml(html: string, cls: string, from = 0): string | null {
  const re = new RegExp(`<([a-z0-9]+)\\b[^>]*\\bclass="[^"]*(?<![\\w-])${cls.replace(/[-]/g, "\\-")}(?![\\w-])[^"]*"[^>]*>`, "i");
  const m = re.exec(html.slice(from));
  if (!m) return null;
  const tag = m[1].toLowerCase();
  const start = from + m.index + m[0].length;
  const tags = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  tags.lastIndex = start;
  let depth = 1;
  for (let t = tags.exec(html); t; t = tags.exec(html)) {
    if (t[0].endsWith("/>")) continue;
    depth += t[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, t.index);
  }
  return html.slice(start);
}

const text = (html: string, cls: string) => {
  const inner = elementHtml(html, cls);
  return inner ? strip(inner) : "";
};

export interface LinkedInCard {
  id: string;
  title: string;
  company: string;
  location: string;
  postedAt?: string;
  salary?: string;
}

/** Job cards from a guest search page. */
export function parseSearchCards(html: string): LinkedInCard[] {
  const out: LinkedInCard[] = [];
  for (const chunk of html.split(/<li\b/i).slice(1)) {
    const id = /jobPosting:(\d{6,})/.exec(chunk)?.[1] ?? /\/jobs\/view\/[^"?]*?-?(\d{6,})(?:[/?"])/.exec(chunk)?.[1];
    if (!id) continue;
    const title = text(chunk, "base-search-card__title");
    if (!title) continue;
    out.push({
      id,
      title,
      company: text(chunk, "base-search-card__subtitle"),
      location: text(chunk, "job-search-card__location"),
      postedAt: /<time[^>]*datetime="([^"]+)"/i.exec(chunk)?.[1],
      salary: text(chunk, "job-search-card__salary-info") || undefined,
    });
  }
  return out;
}

export interface LinkedInDetail {
  title: string;
  company: string;
  location: string;
  postedAt: string;
  description: string;
  salary?: string;
  jobType?: string;
  industry?: string;
  seniority?: string;
  applyUrl?: string;
}

/** A guest job page (`/jobs-guest/jobs/api/jobPosting/{id}`). */
export function parseJobPage(html: string): LinkedInDetail {
  const criteria: Record<string, string> = {};
  let from = 0;
  for (;;) {
    const i = html.indexOf("description__job-criteria-item", from);
    if (i < 0) break;
    const item = elementHtml(html, "description__job-criteria-item", Math.max(0, html.lastIndexOf("<", i)));
    from = i + 30;
    if (!item) continue;
    const head = strip(elementHtml(item, "description__job-criteria-subheader") ?? "").toLowerCase();
    const value = strip(elementHtml(item, "description__job-criteria-text") ?? "");
    if (head) criteria[head] = value;
  }
  let applyUrl: string | undefined;
  const offsite = /<a\b[^>]*data-tracking-control-name="[^"]*apply-link-offsite[^"]*"[^>]*href="([^"]+)"/i.exec(html)?.[1]
    ?? /<a\b[^>]*href="([^"]+)"[^>]*data-tracking-control-name="[^"]*apply-link-offsite[^"]*"/i.exec(html)?.[1];
  const coded = /<code[^>]*id="applyUrl"[^>]*>\s*<!--\s*"?([^"<]+?)"?\s*-->/i.exec(html)?.[1];
  for (const raw of [offsite, coded]) {
    if (!raw) continue;
    try {
      const u = new URL(decodeEntities(raw), BASE);
      const target = u.searchParams.get("url") ?? (u.hostname.endsWith("linkedin.com") ? null : u.toString());
      if (target) {
        applyUrl = target;
        break;
      }
    } catch {
      // not a URL
    }
  }
  const markup = elementHtml(html, "show-more-less-html__markup") ?? elementHtml(html, "description__text") ?? "";
  return {
    title: text(html, "top-card-layout__title") || text(html, "topcard__title"),
    company: text(html, "topcard__org-name-link") || text(html, "topcard__flavor"),
    location: text(html, "topcard__flavor--bullet"),
    postedAt: text(html, "posted-time-ago__text"),
    description: htmlToText(markup),
    salary: text(html, "compensation__salary") || undefined,
    jobType: criteria["employment type"],
    industry: criteria["industries"],
    seniority: criteria["seniority level"],
    applyUrl,
  };
}

// ------------------------------------------------------------ searching

/** LinkedIn search parameters worth keeping from a search page URL. */
export function searchParamsFromUrl(url: string): URLSearchParams | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)linkedin\.com$/.test(u.hostname)) return null;
  const out = new URLSearchParams();
  for (const [k, v] of u.searchParams) {
    if (["keywords", "location", "geoId", "distance", "sortBy"].includes(k) || /^f_[A-Z0-9_]+$/i.test(k)) out.set(k, v);
  }
  return out.get("keywords") || out.get("geoId") || out.get("location") ? out : null;
}

export function buildSearchParams(q: { keywords?: string; location?: string; postedDays?: number; remote?: boolean }): URLSearchParams {
  const p = new URLSearchParams();
  if (q.keywords) p.set("keywords", q.keywords);
  p.set("location", q.location || "United States");
  if (q.postedDays) p.set("f_TPR", `r${Math.round(q.postedDays * 86400)}`);
  if (q.remote) p.set("f_WT", "2");
  return p;
}

