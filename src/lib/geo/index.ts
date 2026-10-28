import "server-only";
import cityRows from "./cities.json";

// Offline geocoder for job locations. Turns strings like "Chicago, IL",
// "US, CA, Santa Clara", "New York, NY · Remote" or "Remote - US" into a city
// with coordinates, using the bundled GeoNames city list (see
// scripts/build-cities.cjs). No network calls.

type CityRow = [name: string, country: string, admin: string, lat: number, lng: number, population: number];

export interface Place {
  city: string;
  admin: string; // state code for the US, GeoNames admin1 code elsewhere
  country: string; // ISO 3166-1 alpha-2
  lat: number;
  lng: number;
  label: string; // "Chicago, IL" or "London, United Kingdom"
}

export interface ParsedLocation {
  places: Place[];
  remote: boolean;
  countries: string[]; // countries named without a city, e.g. "Remote - US"
}

export const US_STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI",
  wyoming: "WY", "puerto rico": "PR",
};
const STATE_CODES = new Set(Object.values(US_STATES));

// Names job boards use that differ from GeoNames.
const CITY_ALIASES: Record<string, string> = {
  "new york": "new york city",
  nyc: "new york city",
  manhattan: "new york city",
  brooklyn: "new york city",
  "washington dc": "washington, d.c.",
  "washington d.c.": "washington, d.c.",
  "washington, d.c.": "washington, d.c.",
  dc: "washington, d.c.",
  sf: "san francisco",
  "saint louis": "st. louis",
  "st louis": "st. louis",
  "saint paul": "st. paul",
  "st paul": "st. paul",
  "ft. lauderdale": "fort lauderdale",
  "ft lauderdale": "fort lauderdale",
  "bengaluru": "bengaluru",
  "bangalore": "bengaluru",
  "gurgaon": "gurugram",
  "tel aviv": "tel aviv",
  "tel aviv-yafo": "tel aviv",
  "montréal": "montreal",
  "méxico city": "mexico city",
  "cdmx": "mexico city",
  "são paulo": "sao paulo",
};

const COUNTRY_ALIASES: Record<string, string> = {
  us: "US", usa: "US", "u.s.": "US", "u.s.a.": "US", "united states": "US",
  "united states of america": "US", america: "US",
  uk: "GB", "u.k.": "GB", "united kingdom": "GB", "great britain": "GB", england: "GB",
  scotland: "GB", wales: "GB", uae: "AE", "south korea": "KR", korea: "KR",
  "hong kong": "HK", "hong kong sar": "HK", "czech republic": "CZ", czechia: "CZ",
  holland: "NL", "the netherlands": "NL", russia: "RU", vietnam: "VN", taiwan: "TW",
};

const REMOTE_RE = /\b(remote|anywhere|work from home|wfh|distributed|virtual)\b/i;

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

let index: Map<string, CityRow[]> | null = null;
let countryNames: Map<string, string> | null = null;
let regionNames: Intl.DisplayNames | null = null;

function cityIndex(): Map<string, CityRow[]> {
  if (index) return index;
  index = new Map();
  for (const row of cityRows as CityRow[]) {
    const key = fold(row[0]);
    const list = index.get(key);
    if (list) list.push(row);
    else index.set(key, [row]);
  }
  return index;
}

function countryLookup(): Map<string, string> {
  if (countryNames) return countryNames;
  countryNames = new Map(Object.entries(COUNTRY_ALIASES));
  regionNames = new Intl.DisplayNames(["en"], { type: "region" });
  const codes = new Set((cityRows as CityRow[]).map((r) => r[1]));
  for (const code of codes) {
    const name = regionNames.of(code);
    if (name && name !== code) countryNames.set(fold(name), code);
  }
  return countryNames;
}

export function countryName(code: string): string {
  countryLookup();
  return regionNames?.of(code) ?? code;
}

function toPlace(row: CityRow): Place {
  const [name, country, admin, lat, lng] = row;
  const display = name === "New York City" ? "New York" : name.replace(/, D\.C\.$/, "");
  const label = country === "US" ? `${display}, ${admin}` : `${display}, ${countryName(country)}`;
  return { city: name, admin, country, lat, lng, label };
}

/** Finds the best city for a name, preferring the given state/country. */
function findCity(name: string, hints: { admin?: string; country?: string }): CityRow | undefined {
  let key = CITY_ALIASES[fold(name)] ?? fold(name);
  if (hints.admin === "DC" && key === "washington") key = "washington, d.c.";
  const candidates = cityIndex().get(key);
  if (!candidates?.length) return undefined;
  const matches = candidates.filter(
    (r) =>
      (!hints.country || r[1] === hints.country) &&
      (!hints.admin || r[2] === hints.admin),
  );
  // Rows are sorted by population, so the first match is the biggest.
  if (matches.length) return matches[0];
  if (hints.admin && !hints.country) return undefined;
  if (hints.country) {
    const inCountry = candidates.filter((r) => r[1] === hints.country);
    if (inCountry.length) return inCountry[0];
    return undefined;
  }
  // No hints: only accept a clearly dominant city (e.g. "London", "Chicago").
  const top = candidates[0];
  return top[5] >= 100_000 ? top : undefined;
}

interface Hints {
  admin?: string;
  country?: string;
}

type PartKind = "code" | "statename" | "country" | "remote" | "text";

function classify(part: string): { kind: PartKind; value: string } {
  const f = fold(part).replace(/[()]/g, "").trim();
  if (!f) return { kind: "text", value: "" };
  if (REMOTE_RE.test(f) && f.split(" ").length <= 3) return { kind: "remote", value: f };
  const trimmed = part.trim();
  if (trimmed.length === 2 && STATE_CODES.has(trimmed.toUpperCase())) {
    return { kind: "code", value: trimmed.toUpperCase() };
  }
  if (US_STATES[f]) return { kind: "statename", value: US_STATES[f] };
  const country = countryLookup().get(f);
  if (country) return { kind: "country", value: country };
  return { kind: "text", value: trimmed };
}

/** Parses one location like "Chicago, IL" or "US-NY-New York". */
function parseOne(raw: string): { place?: Place; remote: boolean; country?: string } {
  let text = raw.replace(/\b(hybrid|on-?site|in[- ]office)\b/gi, " ");
  const remote = REMOTE_RE.test(text);
  text = text.replace(/\b(remote|anywhere|work from home|wfh|distributed|virtual)\b/gi, " ");
  // Workday style "US-CA-Santa Clara" becomes "Santa Clara, CA, US".
  text = text.trim().replace(/^([A-Z]{2})-([A-Z]{2})-(.+)$/, "$3, $2, $1");
  const parts = text
    .split(/,|\s[-–—|/]\s|\(|\)/)
    .map((p) => p.replace(/^[\s\-–—|/:]+|[\s\-–—|/:]+$/g, ""))
    .filter(Boolean);

  const hints: Hints = {};
  const texts: string[] = [];
  const classified = parts.map((part) => ({ part, ...classify(part) }));
  // State codes and countries first, so a state *name* can still be a city:
  // in "New York, NY" the first part is the city.
  for (const c of classified) {
    if (c.kind === "code") {
      hints.admin = c.value;
      hints.country = "US";
    } else if (c.kind === "country") {
      hints.country = hints.country ?? c.value;
    }
  }
  for (const c of classified) {
    if (c.kind === "text" && c.value) texts.push(c.value);
    else if (c.kind === "statename") {
      if (hints.admin) texts.push(c.part);
      else {
        hints.admin = c.value;
        hints.country = "US";
      }
    }
  }
  for (const t of texts) {
    const row = findCity(t, hints);
    if (row) return { place: toPlace(row), remote };
  }
  // Only a state ("Illinois") or a country ("United States").
  return { remote, country: hints.country };
}

/** Parses a job's location text, which may list several places. */
export function parseLocation(text: string | null | undefined): ParsedLocation {
  const result: ParsedLocation = { places: [], remote: false, countries: [] };
  if (!text?.trim()) return result;
  const segments = text.split(/\s*(?:·|;|\||\bor\b|\n|\/(?=\s*[A-Z]))\s*/).filter(Boolean);
  const seen = new Set<string>();
  for (const segment of segments) {
    const one = parseOne(segment);
    if (one.remote) result.remote = true;
    if (one.place && !seen.has(one.place.label)) {
      seen.add(one.place.label);
      result.places.push(one.place);
    } else if (one.country && !result.countries.includes(one.country)) {
      result.countries.push(one.country);
    }
  }
  if (REMOTE_RE.test(text)) result.remote = true;
  return result;
}

/** All countries a parsed location is in. */
export function locationCountries(loc: ParsedLocation): string[] {
  return Array.from(new Set([...loc.places.map((p) => p.country), ...loc.countries]));
}

export function distanceMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

/** Search box lookup: "chicago" → Chicago, IL. */
export function searchCities(query: string, limit = 8): Place[] {
  const q = fold(query);
  if (q.length < 2) return [];
  const out: Place[] = [];
  for (const row of cityRows as CityRow[]) {
    if (fold(row[0]).startsWith(q)) {
      out.push(toPlace(row));
      if (out.length >= limit) break;
    }
  }
  return out;
}
