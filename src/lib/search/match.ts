import { distanceMiles, parseLocation, US_STATES, type ParsedLocation, type Place } from "@/lib/geo";
import type { MatchReasons } from "@/lib/db/schema";

// Decides whether a job posting fits a search and scores it 0-100.

export type Level = "internship" | "entry" | "any";

export interface MatchConfig {
  titles: string[];
  keywords: string[];
  excludeWords: string[];
  locations: string[];
  includeRemote: boolean;
  levels: Level[];
}

export interface MatchResult {
  score: number;
  reasons: MatchReasons;
  flags: string[];
  location: ParsedLocation;
  /** The place that fit the search, when a posting lists several. */
  place?: Place;
}

// ----------------------------------------------------------------- tokens

const STOP = new Set(["a", "an", "and", "the", "of", "for", "to", "in", "at", "with", "or", "on", "&", "-"]);

// Map word forms onto one stem so "Data Science Intern" matches "data scientist".
const STEMS: [RegExp, string][] = [
  [/^(analyst|analysts|analytics|analytical|analysis|analytic|analyses)$/, "analy"],
  [/^(scientist|scientists|science|sciences|scientific)$/, "scien"],
  [/^(engineer|engineers|engineering)$/, "engin"],
  [/^(researcher|researchers|research)$/, "research"],
  [/^(quantitative|quant|quants)$/, "quant"],
  [/^(intern|interns|internship|internships|co-op|coop)$/, "intern"],
  [/^(developer|developers|development)$/, "develop"],
  [/^(statistics|statistical|statistician|stats|stat)$/, "stat"],
  [/^(economist|economists|economics|economic|econ)$/, "econ"],
  [/^(finance|financial)$/, "financ"],
  [/^(modeling|modelling|model|models|modeler)$/, "model"],
  [/^(trader|traders|trading)$/, "trad"],
  [/^(strategy|strategist|strategic)$/, "strateg"],
  [/^(consultant|consultants|consulting)$/, "consult"],
  [/^(operations|operational|ops)$/, "operat"],
  [/^(product|products)$/, "product"],
  [/^(business)$/, "business"],
  [/^(learning)$/, "learning"],
];

function stem(token: string): string {
  for (const [re, s] of STEMS) if (re.test(token)) return s;
  return token.length > 4 && token.endsWith("s") && !token.endsWith("ss") ? token.slice(0, -1) : token;
}

export function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Word forms without merging families: "analytics" stays apart from "analyst". */
function narrowStem(token: string): string {
  if (/^(intern|interns|internship|internships|co-op|coop)$/.test(token)) return "intern";
  return token.length > 4 && token.endsWith("s") && !token.endsWith("ss") ? token.slice(0, -1) : token;
}

function rawTokens(text: string): string[] {
  return fold(text)
    .replace(/\bml\b/g, "machine learning")
    .replace(/\bbi\b/g, "business intelligence")
    .split(/[^a-z0-9+#]+/)
    .filter((t) => t && !STOP.has(t));
}

function tokens(text: string): string[] {
  const words = fold(text)
    .replace(/\bml\b/g, "machine learning")
    .replace(/\bai\/ml\b/g, "ai machine learning")
    .replace(/\bbi\b/g, "business intelligence")
    .split(/[^a-z0-9+#]+/)
    .filter((t) => t && !STOP.has(t));
  return words.map(stem);
}

/** Whole-term, case-insensitive match. One-letter terms (like "R") are case-sensitive. */
export function hasTerm(text: string, term: string): boolean {
  const t = term.trim();
  if (!t) return false;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (t.length <= 2 && /^[A-Za-z]+$/.test(t)) {
    // "R", "Go", "C": require list-like context to avoid "R&D", "go to market".
    return new RegExp(`(^|[\\s,(/:;])${escaped}(?=[\\s,)/;.]|$)(?![\\s]*[&'-])`).test(text) &&
      (t !== "Go" || /\bgolang\b|\bGo\b(?=[,)/])/.test(text));
  }
  return new RegExp(`(^|[^a-z0-9+#])${escaped.toLowerCase()}($|[^a-z0-9+#])`, "i").test(fold(text));
}

// ------------------------------------------------------------------ level

const INTERN_RE =
  /\b(intern|interns|internship|co-?op|apprentice(ship)?|working student|student (researcher|worker|analyst)|summer (analyst|associate|intern|20\d\d)|20\d\d summer|summer program)\b/i;
const SENIOR_RE =
  /\b(senior|sr\.?|staff|principal|lead|manager|director|head of|head,|vp|vice president|chief|architect|distinguished|executive|partner|managing|supervisor|iii|iv|v)\b/i;
const ENTRY_RE =
  /\b(new grad(uate)?|graduate|entry[- ]level|entry|junior|jr\.?|associate|early career|early talent|campus|university|analyst i|engineer i|level i|i)\b/i;

export function titleLevel(title: string): "internship" | "entry" | "senior" | "other" {
  if (INTERN_RE.test(title)) return "internship";
  if (SENIOR_RE.test(title)) return "senior";
  if (ENTRY_RE.test(title)) return "entry";
  return "other";
}

/** Smallest "N+ years of experience" a posting asks for, if any. */
export function requiredYears(description: string | undefined): number | undefined {
  if (!description) return undefined;
  const years: number[] = [];
  const re =
    /(\d{1,2})\s*(?:\+|-\s*\d{1,2}|to\s*\d{1,2})?\s*(?:\+\s*)?years?(?:'|’)?\s*(?:of\s+)?(?:relevant\s+|professional\s+|industry\s+|full[- ]time\s+|work\s+|hands[- ]on\s+|related\s+|practical\s+)*(?:experience|exp\b)/gi;
  for (const m of description.matchAll(re)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 20) years.push(n);
  }
  return years.length ? Math.min(...years) : undefined;
}

// ------------------------------------------------------------------ flags

const NEG = String.raw`(?:not|unable to|cannot|can't|can not|won't|will not|do not|does not|don't|are not able to|is not able to)`;
const NO_SPONSOR_RE = [
  new RegExp(String.raw`\b${NEG}\s+(?:currently\s+|presently\s+)?sponsor`, "i"),
  new RegExp(String.raw`\b${NEG}\s+(?:currently\s+)?(?:be\s+able\s+to\s+)?(?:provide|offer|support|consider)\w*\s+(?:any\s+)?(?:[\w-]+\s+){0,3}sponsorship`, "i"),
  /\bwithout\s+(?:the\s+)?(?:need|requirement)\s+(?:for|of)\s+(?:current\s+or\s+future\s+)?(?:[\w-]+\s+){0,2}sponsorship/i,
  /\bno\s+(?:visa\s+|h-?1b\s+|immigration\s+)?sponsorship\b/i,
  /\bsponsorship\s+(?:is\s+|will\s+)?not\s+(?:be\s+)?(?:available|provided|offered)/i,
  /\bnot\s+eligible\s+for\s+(?:visa\s+|immigration\s+)?sponsorship/i,
];
const CITIZEN_RE = [
  /\b(?:u\.?s\.?|united states)\s+citizen(?:ship)?\s+(?:is\s+)?required/i,
  /\bmust\s+be\s+(?:a\s+)?(?:u\.?s\.?|united states)\s+citizen/i,
  /\b(?:active|current|ability to obtain)\s+(?:a\s+)?(?:secret|top secret|ts\/sci|security)\s+clearance/i,
];

export function postingFlags(title: string, description: string | undefined): string[] {
  const flags: string[] = [];
  const text = `${title}\n${description ?? ""}`;
  if (NO_SPONSOR_RE.some((re) => re.test(text))) flags.push("no_sponsorship");
  if (CITIZEN_RE.some((re) => re.test(text))) flags.push("citizenship");
  return flags;
}

// --------------------------------------------------------------- location

interface WantedLocation {
  place?: Place;
  admin?: string;
  country?: string;
  label: string;
}

const RADIUS_MILES = 50;

function parseWanted(entries: string[]): WantedLocation[] {
  return entries
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const f = fold(raw).replace(/[.]/g, "").trim();
      if (US_STATES[f]) return { admin: US_STATES[f], country: "US", label: raw };
      if (/^[A-Za-z]{2}$/.test(raw) && Object.values(US_STATES).includes(raw.toUpperCase())) {
        return { admin: raw.toUpperCase(), country: "US", label: raw };
      }
      const parsed = parseLocation(raw);
      if (parsed.places[0]) return { place: parsed.places[0], label: parsed.places[0].label };
      if (parsed.countries[0]) return { country: parsed.countries[0], label: raw };
      return { label: raw };
    });
}

function locationFit(
  loc: ParsedLocation,
  rawText: string | undefined,
  wanted: WantedLocation[],
  includeRemote: boolean,
): { ok: boolean; points: number; label?: string; place?: Place } {
  if (!wanted.length) {
    if (loc.remote && !includeRemote && !loc.places.length) return { ok: false, points: 0 };
    return { ok: true, points: 5, label: loc.remote ? "Remote" : loc.places[0]?.label, place: loc.places[0] };
  }
  // City within the radius of a wanted city.
  for (const w of wanted) {
    if (!w.place) continue;
    for (const p of loc.places) {
      if (distanceMiles(w.place, p) <= RADIUS_MILES) {
        return { ok: true, points: 12, label: p.label === w.place.label ? p.label : `${p.label} (near ${w.place.city})`, place: p };
      }
    }
  }
  for (const w of wanted) {
    const inState = w.admin ? loc.places.find((p) => p.country === "US" && p.admin === w.admin) : undefined;
    if (inState) return { ok: true, points: 9, label: inState.label, place: inState };
  }
  for (const w of wanted) {
    // Only plain country entries ("United States") match anywhere in the country.
    const inCountry = w.country && !w.admin && !w.place ? loc.places.find((p) => p.country === w.country) : undefined;
    if (inCountry) return { ok: true, points: 6, label: inCountry.label, place: inCountry };
  }
  if (loc.remote && includeRemote) {
    const wantedCountries = new Set(
      wanted.map((w) => w.country ?? w.place?.country ?? (w.admin ? "US" : undefined)).filter(Boolean),
    );
    const jobCountries = new Set([...loc.countries, ...loc.places.map((p) => p.country)]);
    const compatible =
      jobCountries.size === 0 || wantedCountries.size === 0 || [...jobCountries].some((c) => wantedCountries.has(c));
    if (compatible) return { ok: true, points: 8, label: jobCountries.size ? `Remote (${[...jobCountries].join(", ")})` : "Remote" };
  }
  // Free-text fallback, e.g. a wanted "Bay Area" written into the posting.
  const text = fold(rawText ?? "");
  const textHit = wanted.find((w) => !w.place && !w.admin && !w.country && text.includes(fold(w.label)));
  if (textHit) return { ok: true, points: 6, label: textHit.label };
  if (!rawText?.trim()) return { ok: true, points: 0, label: "Location not listed" };
  return { ok: false, points: 0 };
}

// ---------------------------------------------------------------- matcher

export interface Matcher {
  /** Cheap first pass on title and location, before fetching descriptions. */
  prefilter(title: string, location: string | undefined): boolean;
  /** Full score once the description is known. Null means it doesn't fit. */
  score(posting: { title: string; location?: string; description?: string }): MatchResult | null;
}

export function createMatcher(config: MatchConfig): Matcher {
  // Multi-word titles match word families ("data scientist" finds "Data Science
  // Intern"). A one-word title matches only its own word forms, so "analytics"
  // doesn't pull in every "... Analyst".
  const titleTargets = config.titles
    .map((t) => {
      const stems = tokens(t).filter((s) => s !== "intern");
      const narrow = rawTokens(t).map(narrowStem).filter((s) => s !== "intern");
      return { raw: t.trim(), stems, narrow: stems.length === 1 && narrow.length === 1 ? narrow[0] : null };
    })
    .filter((t) => t.raw && t.stems.length);
  const excludes = config.excludeWords.map((w) => w.trim()).filter(Boolean);
  const wanted = parseWanted(config.locations);
  const levels = new Set<Level>(config.levels.length ? config.levels : ["any"]);
  const keywords = Array.from(new Map(config.keywords.map((k) => [fold(k.trim()), k.trim()])).values()).filter(Boolean);

  function titleTarget(title: string): string | null {
    if (!titleTargets.length) return "";
    const have = new Set(tokens(title));
    const haveNarrow = new Set(rawTokens(title).map(narrowStem));
    for (const t of titleTargets) {
      if (t.narrow ? haveNarrow.has(t.narrow) : t.stems.every((s) => have.has(s))) return t.raw;
    }
    return null;
  }

  function levelOk(title: string): { ok: boolean; label?: string; level: ReturnType<typeof titleLevel> } {
    const level = titleLevel(title);
    if (levels.has("any")) return { ok: true, level, label: level === "internship" ? "Internship" : undefined };
    if (level === "internship") return { ok: levels.has("internship"), level, label: "Internship" };
    if (level === "senior") return { ok: false, level };
    return { ok: levels.has("entry"), level, label: level === "entry" ? "Entry level" : undefined };
  }

  function excluded(title: string): boolean {
    return excludes.some((w) => hasTerm(title, w));
  }

  return {
    prefilter(title, location) {
      if (!title || excluded(title)) return false;
      if (titleTarget(title) === null) return false;
      if (!levelOk(title).ok) return false;
      return locationFit(parseLocation(location), location, wanted, config.includeRemote).ok;
    },
    score({ title, location, description }) {
      if (excluded(title)) return null;
      const target = titleTarget(title);
      if (target === null) return null;
      const level = levelOk(title);
      if (!level.ok) return null;
      const loc = parseLocation(location);
      const fit = locationFit(loc, location, wanted, config.includeRemote);
      if (!fit.ok) return null;

      const text = `${title}\n${description ?? ""}`;
      const hits = keywords.filter((k) => hasTerm(text, k));
      const years = requiredYears(description);

      let score = target === "" ? 25 : 40;
      const denom = Math.max(5, Math.min(10, keywords.length));
      score += Math.round(Math.min(1, hits.length / denom) * 35);
      if (level.label) score += 8;
      score += fit.points;
      if (!levels.has("any") && years !== undefined) {
        if (years >= 5) score -= 25;
        else if (years >= 3) score -= 12;
      }
      if (!description) score -= 5;

      return {
        score: Math.max(0, Math.min(100, score)),
        reasons: {
          title: target || undefined,
          level: level.label,
          keywords: hits.slice(0, 12),
          location: fit.label,
          experienceYears: years,
        },
        flags: postingFlags(title, description),
        location: loc,
        place: fit.place,
      };
    },
  };
}

/** Search words for boards with server-side search (Workday). */
export function searchQueries(config: Pick<MatchConfig, "titles" | "levels">): string[] {
  const internOnly = config.levels.length === 1 && config.levels[0] === "internship";
  const qs = config.titles
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .map((t) => (internOnly && !/intern/.test(t) ? `${t} intern` : t));
  return Array.from(new Set(qs)).slice(0, 8);
}
