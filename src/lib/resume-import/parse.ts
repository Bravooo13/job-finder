// Turns resume text lines into profile fields: contact details, summary,
// entries for each section (with dates and bullet points) and skill groups.
// It's a best guess; everything lands in the editor for review.

export type SectionKind =
  | "education"
  | "experience"
  | "project"
  | "certification"
  | "award"
  | "volunteer"
  | "skills"
  | "summary"
  | "other";

export interface ParsedEntry {
  section: Exclude<SectionKind, "skills" | "summary" | "other">;
  title: string;
  organization: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  url: string;
  description: string;
}

export interface ParsedResume {
  fullName: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  linkedin: string;
  github: string;
  summary: string;
  entries: ParsedEntry[];
  skillGroups: { name: string; skills: string[] }[];
}

const HEADINGS: [RegExp, SectionKind][] = [
  [/^(education|academic background|academics)$/i, "education"],
  [/^((professional|work|relevant|industry|research)\s+)?(experience|employment|history)$|^internships?$/i, "experience"],
  [/^(selected\s+|academic\s+|personal\s+|relevant\s+)?projects?$|^(senior\s+)?thesis$|^research$|^publications?$|^competitions?$/i, "project"],
  [/^(certifications?|licenses?( (and|&) certifications?)?|certificates?|courses|coursework)$/i, "certification"],
  [/^(awards?|honors?( (and|&) awards?)?|achievements|scholarships?)$/i, "award"],
  [/^(leadership|community|volunteer(ing)?|activities|extracurriculars?|extra-curricular activities|involvement|campus involvement|leadership (and|&) (activities|community))$/i, "volunteer"],
  [/^((technical\s+)?skills|skills (and|&) (interests|languages)|technical proficiencies|languages|tools)$/i, "skills"],
  [/^(summary|profile|professional summary|objective|about( me)?)$/i, "summary"],
  [/^(interests|hobbies|references)$/i, "other"],
];

const MONTHS: Record<string, string> = {
  jan: "01", january: "01", feb: "02", february: "02", mar: "03", march: "03", apr: "04", april: "04",
  may: "05", jun: "06", june: "06", jul: "07", july: "07", aug: "08", august: "08", sep: "09", sept: "09",
  september: "09", oct: "10", october: "10", nov: "11", november: "11", dec: "12", december: "12",
  spring: "03", summer: "06", fall: "09", autumn: "09", winter: "01",
};
const MONTH_RE = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|spring|summer|fall|autumn|winter)";
const POINT = `(?:${MONTH_RE}\\.?\\s*,?\\s*\\d{4}|\\d{1,2}/\\d{4}|\\d{4})`;
const END = `(?:${POINT}|present|current|now|today|ongoing)`;
const RANGE_RE = new RegExp(`(${POINT})\\s*(?:–|—|-|to|~)\\s*(${END})\\s*$`, "i");
const SINGLE_RE = new RegExp(`(${POINT})\\s*$`, "i");
const BULLET_RE = /^[•▪◦●○■□➢►✓\-–*·]\s*/;

function headingKind(line: string): SectionKind | null {
  const clean = line.replace(/[:\s]+$/, "").trim();
  if (clean.length > 48 || /\t/.test(clean)) return null;
  for (const [re, kind] of HEADINGS) if (re.test(clean)) return kind;
  return null;
}

function toMonth(value: string): string {
  const v = value.trim().toLowerCase().replace(/\./g, "");
  const slash = v.match(/^(\d{1,2})\/(\d{4})$/);
  if (slash) return `${slash[2]}-${slash[1].padStart(2, "0")}`;
  const year = v.match(/(\d{4})/)?.[1];
  if (!year) return "";
  const month = v.match(/^([a-z]+)/)?.[1];
  return `${year}-${(month && MONTHS[month]) || "01"}`;
}

function splitDates(line: string): { rest: string; start: string; end: string; current: boolean } | null {
  const text = line.replace(/\t/g, " ").trim();
  const range = text.match(RANGE_RE);
  if (range) {
    const current = /present|current|now|today|ongoing/i.test(range[2]);
    return {
      rest: text.slice(0, range.index).replace(/[\s,|–—-]+$/, "").trim(),
      start: toMonth(range[1]),
      end: current ? "" : toMonth(range[2]),
      current,
    };
  }
  // A single date only counts when it's set apart (tab) or at the very end.
  const single = text.match(SINGLE_RE);
  if (single && (line.includes("\t") || /\b\d{4}$/.test(text)) && single.index! > 0) {
    const d = toMonth(single[1]);
    return { rest: text.slice(0, single.index).replace(/[\s,|–—-]+$/, "").trim(), start: d, end: d, current: false };
  }
  return null;
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_RE = /(\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
const URL_RE = /(?:https?:\/\/)?(?:www\.)?[\w-]+(?:\.[\w-]+)+(?:\/[\w\-./?%&=#]*)?/i;

function parseContact(lines: string[], out: ParsedResume) {
  const parts = lines
    .join(" | ")
    .split(/\s*[|•·◦]\s*|\t|\s{3,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const part of parts) {
    const email = part.match(EMAIL_RE)?.[0];
    if (email && !out.email) {
      out.email = email;
      continue;
    }
    if (/linkedin\.com/i.test(part)) {
      out.linkedin = part.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[\w\-/%]+/i)?.[0] ?? part;
      continue;
    }
    if (/github\.com/i.test(part)) {
      out.github = part.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[\w\-/]+/i)?.[0] ?? part;
      continue;
    }
    const phone = part.match(PHONE_RE)?.[0];
    if (phone && !out.phone && phone.replace(/\D/g, "").length >= 10) {
      out.phone = phone.trim();
      continue;
    }
    if (URL_RE.test(part) && !out.website && /\.[a-z]{2,}/i.test(part) && !/\s/.test(part)) {
      out.website = part;
      continue;
    }
    if (!out.location && /^[A-Za-z .'-]+,\s*[A-Za-z .'-]+$/.test(part) && part.length < 50) {
      out.location = part;
      continue;
    }
    if (!out.headline && part.length < 80 && !/\d{3}/.test(part)) out.headline = part;
  }
}

/** Splits "Python (Pandas, NumPy), SQL, and R" into skills. */
export function splitSkills(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if ((ch === "," || ch === ";" || ch === "|" || ch === "•") && depth === 0) {
      out.push(current);
      current = "";
    } else current += ch;
  }
  out.push(current);
  const skills: string[] = [];
  for (const raw of out) {
    const item = raw.replace(/^\s*(and|&)\s+/i, "").replace(/\.$/, "").trim();
    if (!item) continue;
    const paren = item.match(/^([^()]+)\(([^()]+)\)$/);
    // "Mandarin (Native)" stays whole; "Python (Pandas, NumPy)" expands.
    if (paren && /,/.test(paren[2]) && !/native|fluent|proficient|intermediate|basic|conversational|advanced|beginner/i.test(paren[2])) {
      skills.push(paren[1].trim());
      skills.push(...paren[2].split(",").map((s) => s.replace(/^\s*(and|&)\s+/i, "").trim()).filter(Boolean));
    } else skills.push(item);
  }
  return Array.from(new Map(skills.map((s) => [s.toLowerCase(), s])).values()).filter((s) => s.length <= 60);
}

function parseHeader(
  section: ParsedEntry["section"],
  text: string,
  headingLabel: string,
): Pick<ParsedEntry, "title" | "organization" | "location"> {
  const [main, ...more] = text.split(/\s+[|•·]\s+|\t/).map((s) => s.trim()).filter(Boolean);
  const tail = more.join(" · ");
  if (!main) return { title: text, organization: "", location: "" };

  if (section === "education") {
    // "University of Chicago, Chicago, IL"
    const [school, ...loc] = main.split(/,\s*/);
    return { title: "", organization: school, location: [loc.join(", "), tail].filter(Boolean).join(" · ") };
  }
  if (section === "project" || section === "award" || section === "certification") {
    const generic = /^(projects?|awards?|honors?|certifications?|research|publications?)$/i.test(headingLabel);
    return { title: main, organization: tail || (generic ? "" : headingLabel), location: "" };
  }
  // Experience and volunteering: "Company, Role | City, Country"
  const comma = main.lastIndexOf(", ");
  if (comma > 0) {
    return { organization: main.slice(0, comma).trim(), title: main.slice(comma + 2).trim(), location: tail };
  }
  const dash = main.split(/\s+[–—-]\s+/);
  if (dash.length === 2) return { organization: dash[0], title: dash[1], location: tail };
  return { organization: main, title: tail || main, location: tail ? "" : "" };
}

const DEGREE_RE = /\b(B\.?\s?[AS]\.?|M\.?\s?[AS]\.?|MBA|M\.?Eng|Ph\.?\s?D\.?|Bachelor|Master|Associate|Doctor|BBA|BEng|MFA|JD|MD)\b/;

export function parseResume(lines: string[]): ParsedResume {
  const out: ParsedResume = {
    fullName: "",
    headline: "",
    email: "",
    phone: "",
    location: "",
    website: "",
    linkedin: "",
    github: "",
    summary: "",
    entries: [],
    skillGroups: [],
  };

  const firstHeading = lines.findIndex((l) => headingKind(l) !== null);
  const header = firstHeading === -1 ? lines.slice(0, 3) : lines.slice(0, firstHeading);
  out.fullName = (header[0] ?? "").replace(/\t/g, " ").trim();
  parseContact(header.slice(1), out);

  let kind: SectionKind | null = null;
  let headingLabel = "";
  let entry: ParsedEntry | null = null;
  const bullets: string[] = [];
  const summary: string[] = [];

  function closeEntry() {
    if (!entry) return;
    if (entry.section === "education" && !entry.title) {
      const degree = bullets.findIndex((b) => DEGREE_RE.test(b));
      if (degree >= 0) entry.title = bullets.splice(degree, 1)[0];
      else entry.title = entry.organization;
    }
    entry.description = bullets.map((b) => `- ${b}`).join("\n");
    if (!entry.title) entry.title = entry.organization || "Untitled";
    out.entries.push(entry);
    entry = null;
    bullets.length = 0;
  }

  for (const raw of lines.slice(Math.max(firstHeading, 0))) {
    const line = raw.trim();
    const heading = headingKind(line);
    if (heading) {
      closeEntry();
      kind = heading;
      headingLabel = line.replace(/[:\s]+$/, "");
      continue;
    }
    if (!kind || kind === "other") continue;

    if (kind === "summary") {
      summary.push(line.replace(/\t/g, " "));
      continue;
    }
    if (kind === "skills") {
      const text = line.replace(BULLET_RE, "").replace(/\t/g, " ");
      const labeled = text.match(/^([^:]{2,40}):\s*(.+)$/);
      if (labeled) out.skillGroups.push({ name: labeled[1].trim(), skills: splitSkills(labeled[2]) });
      else if (out.skillGroups.length && /^[a-z(]/.test(text)) {
        out.skillGroups[out.skillGroups.length - 1].skills.push(...splitSkills(text));
      } else out.skillGroups.push({ name: headingLabel || "Skills", skills: splitSkills(text) });
      continue;
    }

    const isBullet = BULLET_RE.test(line);
    if (isBullet) {
      const text = line.replace(BULLET_RE, "").replace(/\t/g, " ").trim();
      if (entry) bullets.push(text);
      continue;
    }
    // A wrapped bullet continues on the next line in lowercase.
    if (entry && bullets.length && /^[a-z(]/.test(line) && !line.includes("\t")) {
      bullets[bullets.length - 1] += ` ${line}`;
      continue;
    }
    const link = line.match(/^(?:link|url|website|github|demo)\s*:\s*(\S+)/i);
    if (entry && link) {
      entry.url = link[1];
      continue;
    }

    const dates = splitDates(line);
    const section = kind as ParsedEntry["section"];
    if (dates || !entry || line.includes("\t") || bullets.length) {
      closeEntry();
      const head = parseHeader(section, dates?.rest ?? line, headingLabel);
      entry = {
        section,
        ...head,
        startDate: dates?.start ?? "",
        endDate: dates?.end ?? "",
        current: dates?.current ?? false,
        url: "",
        description: "",
      };
    } else if (entry) {
      // A second header line, e.g. the role under a company name.
      bullets.push(line.replace(/\t/g, " "));
    }
  }
  closeEntry();
  out.summary = summary.join(" ").trim();
  out.skillGroups = out.skillGroups.filter((g) => g.skills.length);
  return out;
}
