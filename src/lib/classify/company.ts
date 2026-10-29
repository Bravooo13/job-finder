// Company names in a form that can be compared across sources
// ("GOLDMAN SACHS & CO LLC", "Goldman Sachs" and "goldman-sachs" all become "goldman sachs").

const SUFFIXES = new Set([
  "inc", "incorporated", "llc", "llp", "lp", "ltd", "limited", "corp", "corporation", "co", "company", "plc", "pllc",
  "pc", "pa", "sa", "ag", "gmbh", "bv", "nv", "the", "and", "group", "holdings", "holding",
]);

// Words that often trail a company's name in official filings ("Amazon.com Services LLC").
const TRAILING = new Set([
  "services", "service", "us", "usa", "america", "americas", "north", "international", "global", "technologies",
  "technology", "systems", "solutions", "enterprises", "partners", "com", "na",
]);

function words(name: string): string[] {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** The main comparison key: lowercase words without legal suffixes. */
export function companyKey(name: string | null | undefined): string {
  if (!name) return "";
  const w = words(name).filter((x) => !SUFFIXES.has(x));
  return w.join(" ");
}

/** Looser keys for matching official filing names to brand names, most specific first. */
export function companyKeyVariants(name: string): string[] {
  const base = words(name).filter((x) => !SUFFIXES.has(x));
  const out = new Set<string>();
  if (base.length) out.add(base.join(" "));
  const trimmed = [...base];
  while (trimmed.length > 1 && TRAILING.has(trimmed[trimmed.length - 1])) {
    trimmed.pop();
    out.add(trimmed.join(" "));
  }
  // "amazon com" style: drop a lone "com" anywhere.
  const noCom = base.filter((x) => x !== "com");
  if (noCom.length && noCom.length !== base.length) out.add(noCom.join(" "));
  return [...out];
}
