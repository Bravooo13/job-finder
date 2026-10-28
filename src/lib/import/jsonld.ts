import { decodeEntities, htmlToText, metaContent, pageTitle } from "./html";
import { formatSalary, normalizeJobType, normalizeWorkplace } from "./normalize";
import type { ImportedJob } from "./types";

// Most company career pages embed a schema.org "JobPosting" block for Google
// for Jobs. Reading it gives clean title/company/location/description without
// knowing anything about the site's layout.

type Json = Record<string, unknown>;

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function str(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number") return String(value);
  return undefined;
}

function* walk(node: unknown): Generator<Json> {
  for (const item of asArray(node)) {
    if (item && typeof item === "object") {
      const obj = item as Json;
      yield obj;
      if (obj["@graph"]) yield* walk(obj["@graph"]);
    }
  }
}

function isJobPosting(obj: Json): boolean {
  return asArray(obj["@type"] as string | string[]).some(
    (t) => typeof t === "string" && t.toLowerCase() === "jobposting",
  );
}

export function findJobPosting(html: string): Json | undefined {
  const scripts = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const [, body] of scripts) {
    try {
      const parsed = JSON.parse(body.trim());
      for (const obj of walk(parsed)) {
        if (isJobPosting(obj)) return obj;
      }
    } catch {
      // Some sites ship invalid JSON-LD; skip it.
    }
  }
  return undefined;
}

function postingLocation(posting: Json): string | undefined {
  const places = asArray(posting.jobLocation as Json | Json[]).map((place) => {
    const address = (place?.address ?? place) as Json | string | undefined;
    if (typeof address === "string") return address;
    if (!address) return undefined;
    const country = address.addressCountry;
    const parts = [
      str(address.addressLocality),
      str(address.addressRegion),
      typeof country === "object" && country ? str((country as Json).name) : str(country),
    ].filter(Boolean);
    return parts.join(", ") || undefined;
  });
  const unique = Array.from(new Set(places.filter(Boolean)));
  return unique.join(" · ") || undefined;
}

function postingSalary(posting: Json): string | undefined {
  const base = posting.baseSalary as Json | undefined;
  if (!base) return undefined;
  const value = base.value as Json | number | undefined;
  const currency = str(base.currency);
  if (typeof value === "number") return formatSalary(value, null, currency);
  if (!value) return undefined;
  const min = Number(value.minValue ?? value.value);
  const max = Number(value.maxValue ?? value.value);
  return formatSalary(
    Number.isFinite(min) ? min : null,
    Number.isFinite(max) ? max : null,
    currency,
    str(value.unitText),
  );
}

export function jobFromJsonLd(posting: Json, pageUrl: string): ImportedJob {
  const org = posting.hiringOrganization as Json | string | undefined;
  const company = typeof org === "string" ? org : str(org?.name);
  const description = str(posting.description);
  const remote =
    str(posting.jobLocationType)?.toUpperCase() === "TELECOMMUTE" ? "remote" : undefined;
  return {
    title: decodeEntities(str(posting.title) ?? ""),
    company: company ? decodeEntities(company) : "",
    location: postingLocation(posting) ?? (remote ? "Remote" : undefined),
    description: description ? htmlToText(decodeEntities(description)) : undefined,
    url: str(posting.url) ?? pageUrl,
    source: "Company website",
    jobType: normalizeJobType(posting.employmentType as string | string[]),
    workplace: remote ?? normalizeWorkplace(str(posting.workplaceType)),
    salary: postingSalary(posting),
    postedAt: str(posting.datePosted),
  };
}

/** Last resort: page title and description meta tags. */
export function jobFromMeta(html: string, pageUrl: string): ImportedJob {
  const title = metaContent(html, "og:title") ?? pageTitle(html) ?? "";
  return {
    title,
    company: metaContent(html, "og:site_name") ?? "",
    description: metaContent(html, "og:description") ?? metaContent(html, "description"),
    url: pageUrl,
    source: "Company website",
  };
}
