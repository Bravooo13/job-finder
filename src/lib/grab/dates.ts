// Job sites show dates like "6 days ago", "Posted 3d ago", "1wk ago" or "Reposted 2 weeks ago".

const UNIT_MS: [RegExp, number][] = [
  [/^(?:m|mins?|minutes?)$/, 60_000],
  [/^(?:h|hrs?|hours?)$/, 3_600_000],
  [/^(?:d|days?)$/, 86_400_000],
  [/^(?:w|wks?|weeks?)$/, 7 * 86_400_000],
  [/^(?:mo|mos|months?)$/, 30 * 86_400_000],
  [/^(?:y|yrs?|years?)$/, 365 * 86_400_000],
];

/** Turns an ISO date, a timestamp or a relative date into a Date (or null). */
export function parsePostedDate(value: string | number | null | undefined, now = Date.now()): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return new Date(value < 1e12 ? value * 1000 : value);
  const text = value.trim().toLowerCase();
  if (/\b(just now|just posted|today|moments? ago)\b/.test(text)) return new Date(now);
  if (/\byesterday\b/.test(text)) return new Date(now - 86_400_000);
  const rel = /(\d+|an?|one)\s*\+?\s*([a-z]+)\s+ago\b/.exec(text);
  if (rel) {
    const n = /^\d+$/.test(rel[1]) ? Number(rel[1]) : 1;
    const unit = UNIT_MS.find(([re]) => re.test(rel[2]));
    if (unit) return new Date(now - n * unit[1]);
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}
