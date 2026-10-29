// Pure helpers for reading careers pages (no database), shared by the page
// grabber and the tests.
import { decodeEntities } from "@/lib/import/html";
import { jobFromJsonLd } from "@/lib/import/jsonld";
import type { GrabJob } from "./save";

type Json = Record<string, unknown>;

function* walk(node: unknown): Generator<Json> {
  const items = Array.isArray(node) ? node : [node];
  for (const item of items) {
    if (item && typeof item === "object") {
      const obj = item as Json;
      yield obj;
      if (obj["@graph"]) yield* walk(obj["@graph"]);
      if (obj.itemListElement) yield* walk(obj.itemListElement);
      if (obj.item) yield* walk(obj.item);
    }
  }
}

/** Every JobPosting in the page's JSON-LD blocks. */
export function jobPostingsFromHtml(html: string, pageUrl: string): GrabJob[] {
  const out: GrabJob[] = [];
  for (const [, body] of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.trim());
    } catch {
      continue;
    }
    for (const obj of walk(parsed)) {
      const types = ([] as unknown[]).concat(obj["@type"] ?? []);
      if (!types.some((t) => typeof t === "string" && t.toLowerCase() === "jobposting")) continue;
      const job = jobFromJsonLd(obj, pageUrl);
      if (!job.title) continue;
      out.push({
        url: job.url,
        title: job.title,
        company: job.company,
        location: job.location,
        description: job.description,
        postedAt: job.postedAt,
        salary: job.salary,
        jobType: job.jobType,
        workplace: job.workplace,
      });
    }
  }
  const seen = new Set<string>();
  return out.filter((j) => (seen.has(j.url) ? false : (seen.add(j.url), true)));
}

/** Text and links of a page's HTML, roughly (good enough for the AI fallback). */
export function pageTextAndLinks(html: string, base: string) {
  html = html.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ");
  const links: { text: string; href: string }[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const href = new URL(decodeEntities(m[1]), base).toString();
      if (!/^https?:/.test(href)) continue;
      const text = decodeEntities(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
      links.push({ text: text.slice(0, 300), href: href.slice(0, 2000) });
    } catch {}
    if (links.length >= 800) break;
  }
  const text = decodeEntities(
    html
      .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return { text: text.slice(0, 200_000), links };
}

