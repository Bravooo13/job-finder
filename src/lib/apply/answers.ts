// The answer engine: reads an application question the way a person would and
// answers it from your saved profile. Used by the browser extension's
// "Fill this application" button and by AI agents filling forms.
//
// It is deliberately careful with legal questions. "Are you authorized to work
// in the US?", "Will you now or in the future require sponsorship?" and
// "Are you authorized to work without sponsorship?" are three different
// questions with different answers for an F-1 student, so each has its own rule.

import type { ApplyProfile } from "./profile-schema";

export type FieldType =
  | "text"
  | "email"
  | "tel"
  | "url"
  | "number"
  | "date"
  | "month"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "combobox"
  | "file";

export interface FormField {
  key: string; // the extension's own id for the field
  label: string; // question text as shown
  type: FieldType;
  options?: string[]; // choices for select / radio / combobox / checkbox groups
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
  /** The element's id or name ("school--0", "question_123"): a clue when labels repeat, like Greenhouse's education rows. */
  hint?: string;
  /** A dropdown or list of checkboxes that takes several answers. */
  multiple?: boolean;
}

export type Confidence = "high" | "medium" | "low";

export interface FieldAnswer {
  key: string;
  /** Text to type, the option to pick (several for a multi-select), true/false for a single checkbox, or null to leave alone. */
  value: string | boolean | string[] | null;
  confidence: Confidence;
  /** Which rule answered it, for review. */
  rule: string;
  note?: string;
  /** Upload this file into a file field. */
  file?: "resume" | "cover_letter";
  /** An open question that needs a written answer (the AI can draft it). */
  needsWriting?: boolean;
  /** Other wordings to try in a type-to-search dropdown when the first one finds nothing. */
  alts?: string[];
  /** A consent, acknowledgment or "I certify" question. */
  consent?: boolean;
}

export interface AnswerContext {
  company?: string;
  jobTitle?: string;
  /** Where the job is ("Chicago, IL"), for "Do you live near the office?" questions. */
  jobLocation?: string;
  coverLetter?: string;
  /** Answers you or the AI wrote for this job before, by question. */
  saved?: { question: string; answer: string }[];
  /** You allowed Auto apply to tick consent, acknowledgment and "I certify" boxes for you. */
  consent?: boolean;
  /** Skills from your master resume, for "Which tools have you used?" lists. */
  skills?: string[];
  /** Places you've worked, from your master resume, for "Have you worked here before?". */
  employers?: string[];
  /** Greenhouse education row numbers on this form, in order (filled in by answerFields). */
  educationRows?: number[];
}

// ------------------------------------------------------------------ helpers

export function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[*✱]/g, " ")
    .replace(/\((?:required|optional)\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const YES_RE = /^(?:yes|y|true|i am|i do|i will|i have|i can|i agree|authorized|eligible)\b/i;
const NO_RE = /^(?:no|n|false|i am not|i'm not|i do not|i don't|i will not|i won't|i have not|i cannot|not)\b/i;
const DECLINE_RE =
  /(decline|prefer not|do(?: not|n'?t) (?:wish|want)|not wish to|choose not|rather not|not to (?:say|answer|disclose|self)|wish not|undisclosed|not specified)/i;

const words = (s: string) => normalizeLabel(s).replace(/[^a-z0-9+#. ]/g, " ").split(/\s+/).filter(Boolean);

const STOP = new Set(
  "a an and are as at be by can do does for from have how i if in is it me my of on or our please the this to us we what when where which who will with would you your".split(" "),
);
const content = (s: string) => new Set(words(s).filter((w) => !STOP.has(w)));

/** A saved question matches a form question when they say the same thing, not just share words ("…with Python?" vs "…with SQL?"). */
function sameQuestion(saved: string, asked: string): boolean {
  const A = content(saved);
  const B = content(asked);
  if (!A.size || !B.size) return false;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  if (shared === A.size) return true; // every word of your question is in theirs
  return Math.min(A.size, B.size) >= 2 && shared / Math.min(A.size, B.size) >= 0.9;
}

function overlap(a: string, b: string): number {
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size);
}

/** Picks the option that means `wanted` ("yes", "no", "decline" or any text). */
export function chooseOption(options: string[] | undefined, wanted: string): string | null {
  if (!options?.length) return null;
  const opts = options.filter((o) => o.trim() && !/^(select|choose|please select|--)/i.test(o.trim()));
  const w = wanted.trim().toLowerCase();
  if (w === "yes") return opts.find((o) => YES_RE.test(o.trim())) ?? null;
  if (w === "no") return opts.find((o) => NO_RE.test(o.trim())) ?? null;
  if (w === "decline") return opts.find((o) => DECLINE_RE.test(o)) ?? null;
  const exact = opts.find((o) => o.trim().toLowerCase() === w);
  if (exact) return exact;
  const contains = opts.find((o) => o.toLowerCase().includes(w) || w.includes(o.trim().toLowerCase()));
  if (contains) return contains;
  let best: string | null = null;
  let bestScore = 0;
  for (const o of opts) {
    const s = overlap(o, wanted);
    if (s > bestScore) {
      best = o;
      bestScore = s;
    }
  }
  return bestScore >= 0.5 ? best : null;
}

const isChoice = (f: FormField) => ["select", "radio", "combobox"].includes(f.type) || (f.type === "checkbox" && (f.options?.length ?? 0) > 1);

function monthYear(ym: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(ym);
  if (!m) return ym;
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${names[Number(m[2]) - 1] ?? ""} ${m[1]}`.trim();
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "December 2027" → 202712, "Spring 2028" → 202805, "05/2028" → 202805. */
function yearMonthIn(s: string): number[] {
  const out: { at: number; v: number }[] = [];
  for (const m of s.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,? (\d{4})\b/g)) out.push({ at: m.index!, v: Number(m[2]) * 100 + MONTHS.indexOf(m[1]) + 1 });
  const SEASON: Record<string, number> = { spring: 5, summer: 8, fall: 12, autumn: 12, winter: 12 };
  for (const m of s.matchAll(/\b(spring|summer|fall|autumn|winter) (\d{4})\b/g)) out.push({ at: m.index!, v: Number(m[2]) * 100 + SEASON[m[1]] });
  for (const m of s.matchAll(/\b(\d{1,2})\/(\d{4})\b/g)) out.push({ at: m.index!, v: Number(m[2]) * 100 + Number(m[1]) });
  return out.sort((a, b) => a.at - b.at).map((x) => x.v);
}
const ym = (s: string) => {
  const m = /^(\d{4})-(\d{2})/.exec(s);
  return m ? Number(m[1]) * 100 + Number(m[2]) : null;
};

/** The option of a GPA dropdown ("3.5+", "3.0-3.49", "2.49 or below", "No GPA") that holds your GPA. */
export function gpaOption(options: string[], gpa: string): string | null {
  const g = Number.parseFloat(gpa);
  if (!Number.isFinite(g)) return chooseOption(options, "no gpa") ?? chooseOption(options, "n/a");
  for (const o of options) {
    const s = o.toLowerCase().replace(/\s+/g, " ");
    const nums = [...s.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number.parseFloat(m[0])).filter((n) => n <= 5);
    if (!nums.length) continue;
    if (nums.length >= 2 && /\d\s*(?:-|–|—|to|through)\s*\d/.test(s)) {
      const [a, b] = [Math.min(nums[0], nums[1]), Math.max(nums[0], nums[1])];
      // "3.0-3.49" holds 3.495 too: the top is rounded to its decimals.
      if (g >= a - 1e-9 && g < b + 0.005) return o;
      continue;
    }
    if (/\+|above|or (higher|more|greater|above)|and (up|above|higher|over)|at least|greater than|over/.test(s)) {
      if (g >= nums[0] - 1e-9) return o;
      continue;
    }
    if (/below|or (lower|less|under)|under|less than/.test(s)) {
      if (g < nums[0] || (/or (lower|less|below|under)/.test(s) && g <= nums[0] + 1e-9)) return o;
    }
  }
  return null;
}

/** Ways a form may spell your degree: "M.S." is "Master of Science" and "Master's Degree". */
export function degreeAliases(degree: string): string[] {
  const d = degree.trim();
  if (!d) return [];
  const s = d.toLowerCase().replace(/\./g, "").replace(/'/g, "");
  const out = [d];
  if (/^mba\b/.test(s)) out.push("MBA", "Master of Business Administration", "Master's Degree", "Masters");
  else if (/^(ms|msc|mse|meng|ma|mfa|mph|mpp|master)/.test(s)) {
    out.push(/^ma\b|arts/.test(s) ? "Master of Arts" : "Master of Science", "Master's Degree", "Masters Degree", "Master's", "Masters", "Master");
  } else if (/^(ba|ab|bs|bsc|bse|beng|bba|bachelor)/.test(s)) {
    out.push(/^(ba|ab)\b|arts/.test(s) ? "Bachelor of Arts" : "Bachelor of Science", "Bachelor's Degree", "Bachelors Degree", "Bachelor's", "Bachelors", "Bachelor");
  } else if (/^(phd|doctor)/.test(s)) out.push("Doctor of Philosophy", "Ph.D.", "PhD", "Doctorate");
  return [...new Set(out)];
}

/** "Applied Data Science" can also be found as "Data Science". */
function majorAliases(major: string): string[] {
  const m = major.trim();
  if (!m) return [];
  const out = [m];
  const words = m.split(/\s+/);
  if (words.length >= 3) out.push(words.slice(1).join(" "));
  if (/^(applied|computational|quantitative) /i.test(m)) out.push(m.replace(/^\S+ /, ""));
  return [...new Set(out)];
}

const degreeOf = (title: string) => title.split(/,| in /i)[0]?.trim() ?? "";
const majorOf = (title: string) => /\bin\s+([^,(]+)/i.exec(title)?.[1]?.trim() ?? "";
const splitList = (s: string) => s.split(/[;\n,]| and /).map((x) => x.trim()).filter(Boolean);

const companyKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(inc|llc|ltd|corp|corporation|company|co|group|holdings|the|lp|llp|plc)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const sameCompany = (a: string, b: string) => {
  const x = companyKey(a);
  const y = companyKey(b);
  return Boolean(x && y && (x === y || (x.length >= 4 && y.startsWith(x + " ")) || (y.length >= 4 && x.startsWith(y + " "))));
};

const sameSkill = (skill: string, option: string) => {
  const a = skill.toLowerCase().trim();
  const b = option.toLowerCase().replace(/\(.*?\)/g, "").trim();
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length <= 2 || b.length <= 2) return false; // "R", "C": exact only
  return new RegExp(`(^|[^a-z0-9+#])${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9+#])`).test(a) || new RegExp(`(^|[^a-z0-9+#])${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9+#])`).test(b);
};

/** Options that all mean "I acknowledge" ("Acknowledged", "I agree", "Yes, I certify"). */
const ACK_OPTION = /^(acknowledged?|i acknowledge|i agree|agreed?|i accept|accept(ed)?|i understand|understood|i certify|certified|i consent|i confirm|confirm(ed)?|yes,? i (agree|understand|acknowledge|certify|accept|consent|confirm|have read))\b/i;
const MARKETING =
  /(newsletter|marketing|promotional|job alerts?|talent (community|network|pool)|future (job )?(opportunities|openings|roles)|keep (me|you) (informed|updated|in mind)|receive (emails?|updates|news|communications|offers))/;
const CONSENT_Q =
  /\bi (hereby )?certify|certify that|\battest|by (checking|clicking|selecting|ticking|submitting)|i (have read|acknowledge|understand and agree|agree|consent)|\backnowledg|\bconsent\b|agree to|privacy (policy|notice|statement)|terms (and|&) conditions|terms of (use|service)|review (our|the) .{0,40}polic|accurate and complete|true,? (complete|correct|and accurate)/;

// -------------------------------------------------------------------- rules

interface Rule {
  id: string;
  test: (q: string, f: FormField) => boolean;
  answer: (p: ApplyProfile, f: FormField, q: string, ctx: AnswerContext) => Omit<FieldAnswer, "key" | "rule"> | null;
}

const yn = (v: "yes" | "no" | "", confidence: Confidence = "high", note?: string) =>
  v ? { value: v, confidence, note } : { value: null, confidence: "low" as const, note: note ?? "Set this in My answers" };

const textAnswer = (v: string, confidence: Confidence = "high", note?: string) =>
  v ? { value: v, confidence, note } : { value: null, confidence: "low" as const, note: note ?? "Add this to My answers" };

/** Yes if either kind of sponsorship is needed. */
function anySponsorship(p: ApplyProfile): "yes" | "no" | "" {
  if (p.needsSponsorshipNow === "yes" || p.needsSponsorshipLater === "yes") return "yes";
  if (p.needsSponsorshipNow === "no" && p.needsSponsorshipLater === "no") return "no";
  return "";
}
const not = (v: "yes" | "no" | ""): "yes" | "no" | "" => (v === "yes" ? "no" : v === "no" ? "yes" : "");

const RULES: Rule[] = [
  // ---- files
  {
    id: "resume-file",
    test: (q, f) => f.type === "file" && /\b(resume|résumé|cv|curriculum)\b/.test(q),
    answer: () => ({ value: null, file: "resume", confidence: "high" }),
  },
  {
    id: "cover-letter-file",
    test: (q, f) => f.type === "file" && /cover letter/.test(q),
    answer: () => ({ value: null, file: "cover_letter", confidence: "high" }),
  },
  {
    id: "other-file",
    test: (_q, f) => f.type === "file",
    answer: () => ({ value: null, confidence: "low", note: "Attach this yourself (transcript, portfolio, …)" }),
  },

  // ---- Greenhouse's education rows (school--0, degree--0, start-month--0, …): labels repeat, the id says which
  {
    id: "education-row",
    test: (_q, f) => /^(school|degree|discipline|start-month|start-year|end-month|end-year)--\d+$/.test(f.hint ?? ""),
    answer: (p, f, _q, ctx) => {
      const [, part, n] = /^([a-z-]+)--(\d+)$/.exec(f.hint!)!;
      const row = (ctx.educationRows ?? [Number(n)]).indexOf(Number(n));
      const e =
        row === 0
          ? { school: p.school, degree: p.degree, major: p.major, start: p.schoolStart, end: p.graduation }
          : row === 1
            ? { school: p.previousSchool, degree: degreeOf(p.previousDegree), major: p.previousMajor || majorOf(p.previousDegree), start: p.previousStart, end: p.previousGraduation }
            : null;
      if (!e) return { value: null, confidence: "high", note: "Extra education row" };
      if (part === "school") return pickOrText(f, [e.school]);
      if (part === "degree") return pickOrText(f, degreeAliases(e.degree));
      if (part === "discipline") return pickOrText(f, majorAliases(e.major));
      const date = part.startsWith("start") ? e.start : e.end;
      const m = /^(\d{4})-(\d{2})/.exec(date);
      if (!m) return { value: null, confidence: part.startsWith("start") ? "high" : "low", note: date ? undefined : "Add the dates to your resume or My answers" };
      return part.endsWith("year") ? { value: m[1], confidence: "high" } : pickOrText(f, [MONTH_NAMES[Number(m[2]) - 1]]);
    },
  },

  // ---- messages and opt-ins (before email/phone and consent: these mention both)
  {
    id: "text-messages",
    test: (q, f) => (isChoice(f) || f.type === "checkbox") && /\b(sms|text messages?|texting|whatsapp)\b/.test(q),
    answer: (p) => yn(p.textMessages || "no", "high", p.textMessages ? undefined : "Text updates: no (change it in My answers)"),
  },
  {
    id: "marketing-opt-in",
    test: (q, f) => (isChoice(f) || f.type === "checkbox") && MARKETING.test(q),
    answer: (_p, f) => (f.type === "checkbox" && (f.options?.length ?? 0) <= 1 ? { value: false, confidence: "high", note: "Left unticked" } : yn("no")),
  },
  {
    id: "consent",
    test: (q, f) =>
      (f.type === "checkbox" || isChoice(f)) &&
      (CONSENT_Q.test(q) || (!!f.options?.length && f.options.filter((o) => o.trim() && !/^(select|choose)/i.test(o.trim())).every((o) => ACK_OPTION.test(o.trim())))),
    answer: (_p, f, _q, ctx) => {
      if (!ctx.consent) return { value: null, confidence: "low", consent: true, note: "Read this and tick it yourself, or let Auto apply do it (its settings)" };
      if (f.type === "checkbox" && (f.options?.length ?? 0) <= 1) return { value: true, confidence: "high", consent: true, note: "Ticked: you let Auto apply accept these" };
      const opts = f.options?.filter((o) => o.trim() && !/^(select|choose)/i.test(o.trim())) ?? [];
      const pick = opts.find((o) => ACK_OPTION.test(o.trim())) ?? chooseOption(opts, "yes") ?? (opts.length === 1 ? opts[0] : null);
      return pick ? { value: f.type === "checkbox" ? [pick] : pick, confidence: "high", consent: true } : { value: null, confidence: "low", consent: true, note: "Pick the “I agree” option yourself" };
    },
  },

  // ---- legal: sponsorship and work authorization (order matters)
  {
    id: "sponsored-status",
    test: (q) => /(currently|presently) (in|on|hold(ing)?) (one of )?(these|the following|a|any)? ?(sponsored|employer[- ]sponsored|work) (visa )?status/.test(q) || /\b(o-?1|tn|e-?3|h-?1b1?)\b.{0,30}\b(h-?1b|o-?1|tn|e-?3)\b/.test(q),
    answer: (p) => (p.visaStatus ? yn(/\b(h-?1b|o-?1|tn|e-?3|l-?1)\b/i.test(p.visaStatus) ? "yes" : "no") : yn("")),
  },
  {
    id: "student-status",
    test: (q) => /\b(f-?1|j-?1)\b.{0,60}status|(student|trainee|exchange visitor) (visa|status)/.test(q),
    answer: (p) => (p.visaStatus ? yn(/f-?1|j-?1|student|opt|cpt/i.test(p.visaStatus) ? "yes" : "no") : yn("")),
  },
  {
    id: "sponsorship",
    test: (q) =>
      /sponsor/.test(q) &&
      !/without (?:the )?(?:need (?:for|of) )?(?:any |visa |employer |immigration )?sponsor/.test(q) &&
      /(require|need|will you|do you|would you|seek|request)/.test(q),
    answer: (p, _f, q) => {
      const nowOnly = /\b(currently|now|at this time|to start)\b/.test(q) && !/future|later|or in the|at any (point|time)/.test(q);
      return nowOnly ? yn(p.needsSponsorshipNow) : yn(anySponsorship(p));
    },
  },
  {
    id: "authorized-without-sponsorship",
    test: (q) => /(authori[sz]ed|eligible|permitted|able|legally)\b.{0,60}\bwork\b/.test(q) && /without/.test(q) && /sponsor/.test(q),
    answer: (p, _f, q) => {
      // "...without sponsorship now or in the future" is the strict version.
      if (/future|later|at any (point|time)|now or/.test(q)) return yn(not(anySponsorship(p)));
      return yn(not(p.needsSponsorshipNow), "medium", "Only true while you're on CPT/OPT; check the wording");
    },
  },
  {
    id: "authorized",
    test: (q) =>
      /(legally )?(authori[sz]ed|eligible|permitted|entitled|right) to (?:lawfully )?work/.test(q) ||
      /work authori[sz]ation/.test(q) && /(do you|have|are you|valid)/.test(q),
    answer: (p) => yn(p.authorizedToWork),
  },
  {
    id: "opt-cpt",
    test: (q) => /\b(opt|cpt|stem opt|optional practical training|curricular practical training)\b/.test(q),
    answer: (p) => yn(/f-?1|opt|cpt/i.test(p.visaStatus) ? "yes" : p.visaStatus ? "no" : "", "medium"),
  },
  {
    id: "visa-status",
    test: (q) => /(visa|immigration|work authori[sz]ation|citizenship) (status|type)|type of (visa|work authori[sz]ation)|current visa/.test(q),
    answer: (p, f) => {
      if (!p.visaStatus) return textAnswer("");
      if (isChoice(f) && f.options?.length) {
        const f1 = /f-?1/i.test(p.visaStatus) ? f.options.find((o) => /\bf-?1\b/i.test(o)) : undefined;
        const exact = f1 ?? chooseOption(f.options, p.visaStatus);
        if (exact) return { value: exact, confidence: "high" };
        const pick = (/f-?1/i.test(p.visaStatus) ? chooseOption(f.options, "student visa") : null) ?? chooseOption(f.options, "other");
        return pick ? { value: pick, confidence: "medium" } : textAnswer("", "low", `Pick the option for ${p.visaStatus}`);
      }
      return textAnswer(p.visaStatus);
    },
  },
  {
    id: "us-citizen",
    test: (q) => /\b(u\.?s\.?|united states|american) citizen/.test(q) && !/country of citizenship/.test(q),
    answer: (p) => yn(p.usCitizen),
  },
  {
    id: "citizenship-country",
    test: (q) => /country of citizenship|citizenship|nationality/.test(q),
    answer: (p, f) => choiceOrText(f, p.citizenship, "medium"),
  },
  {
    id: "permanent-resident",
    test: (q) => /permanent resident|green card|lawful permanent/.test(q),
    answer: (p) => yn(p.permanentResident),
  },
  {
    id: "export-control",
    test: (q) => /\b(u\.?s\.? person|itar|ear\b|export control|deemed export)/.test(q),
    answer: (p) => yn(p.usPerson || (p.usCitizen === "yes" || p.permanentResident === "yes" ? "yes" : p.usCitizen === "no" ? "no" : ""), "medium"),
  },
  {
    id: "clearance",
    test: (q) => /security clearance|active clearance|\bclearance\b/.test(q),
    answer: (p) => yn(p.hasClearance || "no", p.hasClearance ? "high" : "medium"),
  },
  {
    id: "age",
    test: (q) => /\b(18|eighteen)\b.{0,30}(years|age|older)|at least 18|over 18|legal age/.test(q),
    answer: (p) => yn(p.over18 || "yes"),
  },

  // ---- where and how you want to work
  {
    id: "near-office",
    test: (q) => /within (a |an )?\d+[- ]?(mile|km|kilomet)|\bmile radius|live (within|near|close to|in the area)|commut(e|able|ing) (distance|to)|reside (in|near|within)|location requirement|relocate (to the area )?before/.test(q),
    answer: (p, _f, _q, ctx) => {
      const here = [p.city, ...p.preferredLocations.split(/[;\n]/)].map((s) => s.split(",")[0]?.trim().toLowerCase()).filter(Boolean);
      const job = (ctx.jobLocation ?? "").toLowerCase();
      if (job && here.some((c) => job.includes(c!))) return yn("yes", "high", `You're in ${p.city || "that city"}`);
      if (p.willingToRelocate === "yes") return yn("yes", "high", "You're willing to relocate");
      if (p.willingToRelocate === "no") return yn("no", "medium");
      return yn("", "low", "Set “Willing to relocate” in My answers");
    },
  },
  {
    id: "location-preference",
    test: (q) =>
      /prefer(red)? (office|location|city|work location)|location preference|office preference|which (of our )?(office|location|city)|office location|desired (work )?location|where would you (like|prefer) to (work|be based)|locations? (are|would) you (be )?(interested|open|willing)|interested in working (in|at|from)/.test(
        q,
      ),
    answer: (p, f) => {
      const wanted = p.preferredLocations.split(/[;\n]|\s\/\s/).map((s) => s.trim()).filter(Boolean);
      if (!wanted.length) return textAnswer("", "low", "Add your preferred locations in My answers");
      if (isChoice(f) && f.options?.length) {
        for (const w of wanted) {
          const pick = chooseOption(f.options, w) ?? chooseOption(f.options, w.split(",")[0]);
          if (pick) return { value: pick, confidence: "high" };
        }
        return { value: null, confidence: "low", note: `None of the options match ${wanted.join(", ")}` };
      }
      return textAnswer(wanted.join("; "));
    },
  },
  {
    id: "work-arrangement",
    test: (q) =>
      !/relocat/.test(q) &&
      /\b(remote(ly)?|hybrid|on-?site|in[- ]office|in the office|in[- ]person|work arrangement|work(ing)? model|workplace (type|preference)|days (a|per) week in)\b/.test(q),
    answer: (p, f, q) => {
      const pref = p.workArrangement;
      if (!pref) return textAnswer("", "low", "Set your work arrangement in My answers");
      const LABEL = { any: "Open to on-site, hybrid or remote", onsite: "On-site", hybrid: "Hybrid", remote: "Remote" } as const;
      if (isChoice(f) && f.options?.length && f.options.some((o) => /remote|hybrid|on-?site|in[- ]office|flexible|no preference/i.test(o))) {
        const pick =
          pref === "any"
            ? chooseOption(f.options, "no preference") ?? chooseOption(f.options, "flexible") ?? chooseOption(f.options, "any") ?? chooseOption(f.options, "hybrid")
            : chooseOption(f.options, LABEL[pref]) ?? chooseOption(f.options, pref === "onsite" ? "in office" : pref);
        return pick ? { value: pick, confidence: "high" } : { value: null, confidence: "low", note: `No option for ${LABEL[pref]}` };
      }
      if (!isChoice(f) && f.type !== "checkbox") return textAnswer(LABEL[pref], "medium");
      // A yes/no question about one way of working.
      const asks = /remote/.test(q) ? "remote" : /hybrid/.test(q) ? "hybrid" : "onsite";
      if (pref === "any" || pref === asks) return yn("yes");
      if (pref === "remote") return yn("no", "medium", "You prefer remote; check this");
      if (asks === "onsite" && pref === "hybrid") return yn("yes", "medium", "You prefer hybrid; check how many days they mean");
      return { value: null, confidence: "low", note: `You prefer ${LABEL[pref].toLowerCase()}; answer this one yourself` };
    },
  },
  {
    id: "travel",
    test: (q) => /willing(ness)? to travel|able to travel|comfortable (with )?travel|travel (up to|requirement|\d+ ?%)/.test(q),
    answer: (p) => yn(p.willingToTravel),
  },

  // ---- contact
  { id: "first-name", test: (q, f) => !isChoice(f) && /(^|your )(legal )?first name|given name|^first$/.test(q), answer: (p) => textAnswer(p.firstName) },
  { id: "last-name", test: (q, f) => !isChoice(f) && /(^|your )(legal )?last name|surname|family name|^last$/.test(q), answer: (p) => textAnswer(p.lastName) },
  {
    id: "preferred-name",
    test: (q) => /preferred (first )?name|nickname|name you go by/.test(q),
    answer: (p) => textAnswer(p.preferredName || p.firstName),
  },
  {
    id: "full-name",
    test: (q) => /^(full |legal |your )?name$|full (legal )?name|^name \(|signature/.test(q),
    answer: (p) => textAnswer([p.firstName, p.lastName].filter(Boolean).join(" ")),
  },
  { id: "pronouns", test: (q) => /pronoun/.test(q), answer: (p, f) => (p.pronouns ? choiceOrText(f, p.pronouns) : { value: null, confidence: "low", note: "Optional" }) },
  { id: "email", test: (q, f) => !isChoice(f) && f.type !== "checkbox" && (f.type === "email" || /e-?mail/.test(q)), answer: (p) => textAnswer(p.email) },
  {
    id: "phone-type",
    test: (q, f) => /phone/.test(q) && /type|device/.test(q) && isChoice(f),
    answer: (_p, f) => ({ value: f.options?.length ? chooseOption(f.options, "mobile") ?? chooseOption(f.options, "cell") : "Mobile", confidence: "high" }),
  },
  { id: "phone", test: (q, f) => !isChoice(f) && f.type !== "checkbox" && (f.type === "tel" || /phone|mobile|cell/.test(q)), answer: (p) => textAnswer(p.phone) },
  { id: "linkedin", test: (q) => /linkedin/.test(q), answer: (p) => textAnswer(p.linkedin) },
  { id: "github", test: (q) => /github|git hub/.test(q), answer: (p) => textAnswer(p.github) },
  {
    id: "website",
    test: (q, f) => /website|portfolio|personal (site|url|page)|other (url|link)|^url$/.test(q) || (f.type === "url" && !/linkedin|github/.test(q)),
    answer: (p) => textAnswer(p.website || p.github || p.linkedin, p.website ? "high" : "medium"),
  },
  {
    id: "location",
    test: (q) => /^(current )?location|where are you (currently )?(located|based)|city,? state|current city/.test(q),
    answer: (p) => textAnswer([p.city, p.state].filter(Boolean).join(", ")),
  },
  { id: "street", test: (q) => /street|address line 1|^address( 1)?$|mailing address|home address/.test(q), answer: (p) => textAnswer(p.street) },
  { id: "address2", test: (q) => /address line 2|apt|suite|unit/.test(q), answer: () => ({ value: null, confidence: "high" }) },
  { id: "city", test: (q) => /^city|town/.test(q), answer: (p) => textAnswer(p.city) },
  {
    id: "state",
    test: (q) => /^(state|province|region)|state\/province|state or province/.test(q) && !/united states/.test(q),
    answer: (p, f) => choiceOrText(f, p.state),
  },
  { id: "zip", test: (q) => /zip|postal/.test(q), answer: (p) => textAnswer(p.zip) },
  { id: "country", test: (q) => /^country|country of residence|country\/region/.test(q), answer: (p, f) => choiceOrText(f, p.country || "United States") },

  // ---- education
  {
    id: "school",
    test: (q) => /(school|university|college|institution)( name)?$|which (school|university)|attending/.test(q) && !/high school/.test(q),
    answer: (p, f) => choiceOrText(f, p.school),
  },
  { id: "degree", test: (q) => /degree|level of education|highest education/.test(q), answer: (p, f) => pickOrText(f, degreeAliases(p.degree)) },
  { id: "major", test: (q) => /major|field of study|discipline|concentration|area of study/.test(q), answer: (p, f) => pickOrText(f, majorAliases(p.major)) },
  {
    id: "gpa",
    test: (q) => /\bgpa\b|grade point/.test(q),
    answer: (p, f) => {
      if (isChoice(f) && f.options?.length) {
        const pick = gpaOption(f.options, p.gpa);
        return pick ? { value: pick, confidence: "high" } : { value: null, confidence: "low", note: p.gpa ? `No option holds ${p.gpa}` : "Add your GPA in My answers" };
      }
      return textAnswer(p.gpa, "high", p.gpa ? undefined : "Leave blank or add your GPA in My answers");
    },
  },
  {
    id: "graduation-window",
    test: (q, f) => /graduat/.test(q) && (isChoice(f) || f.type === "checkbox") && (/\b(between|before|by|no later than|after|in) /.test(q) && (yearMonthIn(q).length > 0 || /\b20\d\d\b/.test(q))),
    answer: (p, f, q) => {
      const grad = ym(p.graduation);
      if (!grad) return yn("", "low", "Add your graduation date in My answers");
      if (f.options?.length && !f.options.some((o) => YES_RE.test(o.trim()))) return null; // a list of dates: the graduation rule picks one
      const dates = yearMonthIn(q);
      let ok: boolean | null = null;
      if (/between/.test(q) && dates.length >= 2) ok = grad >= Math.min(dates[0], dates[1]) && grad <= Math.max(dates[0], dates[1]);
      else if (/(before|by|no later than)/.test(q) && dates.length) ok = grad <= dates[0];
      else if (/after/.test(q) && dates.length) ok = grad >= dates[0];
      else {
        const year = /\b(20\d\d)\b/.exec(q)?.[1];
        if (year) ok = String(grad).startsWith(year);
      }
      return ok === null ? null : yn(ok ? "yes" : "no", "high", `You graduate ${monthYear(p.graduation)}`);
    },
  },
  {
    id: "graduation",
    test: (q) => /graduat|completion date|class of|expected (end|finish)/.test(q),
    answer: (p, f) => {
      if (!p.graduation) return textAnswer("");
      if (f.type === "month") return { value: p.graduation.slice(0, 7), confidence: "high" };
      if (f.type === "date") return { value: `${p.graduation.slice(0, 7)}-15`, confidence: "medium" };
      if (isChoice(f) && f.options?.length) {
        const year = p.graduation.slice(0, 4);
        return { value: chooseOption(f.options, monthYear(p.graduation)) ?? chooseOption(f.options, year), confidence: "medium" };
      }
      if (/\byear\b/.test(normalizeLabel(f.label)) && !/month/.test(normalizeLabel(f.label))) return { value: p.graduation.slice(0, 4), confidence: "high" };
      return textAnswer(monthYear(p.graduation));
    },
  },

  // ---- availability, pay, misc
  {
    id: "start-date",
    test: (q) => /start date|available to start|earliest (start|date)|when can you (start|begin)|availability date/.test(q),
    answer: (p, f) => {
      const v = p.startDate || "";
      if (!v) return textAnswer(p.availability, "medium");
      if (f.type === "date") return { value: v.length === 7 ? `${v}-01` : v, confidence: "high" };
      return textAnswer(v.length >= 7 ? monthYear(v) : v);
    },
  },
  { id: "availability", test: (q) => /availability|which term|semester|season/.test(q), answer: (p, f) => choiceOrText(f, p.availability, "medium") },
  { id: "relocate", test: (q) => /relocat/.test(q), answer: (p) => yn(p.willingToRelocate) },
  {
    id: "salary",
    test: (q) => /salary|compensation|pay (expectation|requirement|range)|desired (pay|rate)|hourly rate/.test(q),
    answer: (p) => textAnswer(p.salaryExpectation, "medium", "Optional; leave blank if you'd rather not say"),
  },
  {
    id: "hear-about",
    test: (q) => /how did you (hear|find|learn)|where did you (hear|find|see|learn)|referral source|source of (application|referral)|how were you referred/.test(q),
    answer: (p, f) => {
      const wanted = p.hearAbout || "LinkedIn";
      if (!isChoice(f) || !f.options?.length) return { ...textAnswer(wanted), alts: ["LinkedIn", "Job board", "Company website", "Other"] };
      const best = chooseOption(f.options, wanted) ?? (/linkedin/i.test(wanted) ? f.options.find((o) => /linkedin/i.test(o) && !/peer|referral|recruiter/i.test(o)) : null);
      if (best) return { value: best, confidence: "high" };
      return {
        value: chooseOption(f.options, "linkedin") ?? chooseOption(f.options, "job board") ?? chooseOption(f.options, "company website") ?? chooseOption(f.options, "other"),
        confidence: "medium",
      };
    },
  },
  {
    id: "referral-name",
    test: (q) => /referred by|referrer|employee referral|who referred/.test(q),
    answer: () => ({ value: null, confidence: "high", note: "Fill in if someone referred you" }),
  },
  {
    id: "client-relationship",
    test: (q) => /\bclients? of\b|professional relationship with|(worked|work) (for|with) (one of )?(our|its) clients/.test(q),
    answer: (p) => declaration(p.clientRelationship),
  },
  {
    id: "worked-here",
    test: (q) => /previously (been )?(employed|worked)|worked (for|at|with) .{0,40}(before|previously)|former employee|ever (been )?employed by|have you (ever )?worked (for|at) /.test(q),
    answer: (p, _f, _q, ctx) => {
      if (ctx.company && ctx.employers?.some((e) => sameCompany(e, ctx.company!))) return yn("yes", "high", "It's on your resume");
      if (p.workedHereBefore) return yn(p.workedHereBefore);
      return yn("no", ctx.employers?.length ? "high" : "medium", ctx.employers?.length ? "Not on your resume" : undefined);
    },
  },
  {
    id: "relatives",
    test: (q) => /relatives?\b|related to (a|an|any|someone|anyone)\b|family members? .{0,30}(work|employ)|(spouse|partner|family) .{0,30}(employee|works? (for|at|here))/.test(q),
    answer: (p) => declaration(p.relatedToEmployee),
  },
  {
    id: "non-compete",
    test: (q) => /non-?compete|non-?solicit|restrictive covenant|post-employment (restriction|obligation|covenant)|(agreement|obligation)s? .{0,80}(affect|restrict|prevent|limit) .{0,40}(abilit|perform|work)/.test(q),
    answer: (p) => declaration(p.restrictiveAgreement),
  },
  {
    id: "languages",
    test: (q) => /languages? (do you|you) speak|which languages|language (proficiency|fluency|skills)|fluent in|^languages?( spoken)?$/.test(q),
    answer: (p, f) => {
      const langs = splitList(p.languages);
      if (!langs.length) return textAnswer("", "low", "Add your languages in My answers");
      if (f.multiple || (f.type === "checkbox" && (f.options?.length ?? 0) > 1)) {
        if (!f.options?.length) return { value: langs, confidence: "high" };
        const picks = langs.map((l) => chooseOption(f.options, l)).filter((x): x is string => Boolean(x));
        return picks.length ? { value: [...new Set(picks)], confidence: "high" } : { value: null, confidence: "low", note: `No option for ${langs.join(", ")}` };
      }
      return pickOrText(f, [langs.join(", "), ...langs]);
    },
  },
  {
    id: "skills-list",
    test: (q, f) =>
      (f.multiple || f.type === "checkbox") && (f.options?.length ?? 0) >= 2 && /\b(tools?|software|programming|languages?|technolog|skills?|platforms?|packages?|frameworks?)\b/.test(q) && !/spoken|fluen/.test(q),
    answer: (_p, f, _q, ctx) => {
      const picks = (f.options ?? []).filter((o) => (ctx.skills ?? []).some((s) => sameSkill(s, o)));
      return picks.length
        ? { value: picks, confidence: "medium", note: "Picked from the skills on your resume" }
        : { value: null, confidence: "low", note: "None of these are on your resume's skills" };
    },
  },

  // ---- voluntary self-identification (EEO); default is "decline"
  { id: "eeo-gender", test: (q) => /\bgender\b|\bsex\b/.test(q), answer: (p, f) => eeo(f, p.gender) },
  { id: "eeo-hispanic", test: (q) => /hispanic|latin[oa]/.test(q), answer: (p, f) => eeo(f, p.hispanicLatino) },
  { id: "eeo-race", test: (q) => /\brac(e|ial)\b|ethnicit/.test(q), answer: (p, f) => eeo(f, p.race) },
  { id: "eeo-veteran", test: (q) => /veteran|military service|armed forces/.test(q), answer: (p, f) => eeo(f, p.veteran) },
  { id: "eeo-disability", test: (q) => /disabilit/.test(q), answer: (p, f) => eeo(f, p.disability) },

  // ---- things only you should do
  {
    id: "cover-letter-text",
    test: (q, f) => /cover letter/.test(q) && (f.type === "textarea" || f.type === "text"),
    answer: (_p, _f, _q, ctx) =>
      ctx.coverLetter ? { value: ctx.coverLetter, confidence: "high" } : { value: null, confidence: "low", needsWriting: true, note: "No cover letter for this job yet" },
  },
];

function choiceOrText(f: FormField, value: string, confidence: Confidence = "high"): Omit<FieldAnswer, "key" | "rule"> {
  if (!value) return { value: null, confidence: "low", note: "Add this to My answers" };
  if (isChoice(f) && f.options?.length) {
    const pick = chooseOption(f.options, value);
    return pick ? { value: pick, confidence } : { value: null, confidence: "low", note: `No option matches “${value}”` };
  }
  // A type-to-search dropdown: the browser checks that an option really matches.
  return { value, confidence: isChoice(f) && f.type !== "combobox" ? "medium" : confidence };
}

/** The first of several wordings that a dropdown offers; for type-to-search dropdowns, the rest become fallbacks. */
function pickOrText(f: FormField, candidates: string[], confidence: Confidence = "high"): Omit<FieldAnswer, "key" | "rule"> {
  const c = candidates.map((x) => x.trim()).filter(Boolean);
  if (!c.length) return { value: null, confidence: "low", note: "Add this to My answers" };
  if (isChoice(f) && f.options?.length) {
    for (const x of c) {
      const pick = chooseOption(f.options, x);
      if (pick) return { value: pick, confidence };
    }
    return { value: null, confidence: "low", note: `No option matches “${c[0]}”` };
  }
  return { value: c[0], confidence, alts: c.length > 1 ? c.slice(1) : undefined };
}

/** A standard declaration ("related to an employee?"): your saved answer, else "No" held for you to check. */
function declaration(v: "yes" | "no" | "") {
  return v ? yn(v) : yn("no", "medium", "Usually No: set it in My answers to skip this check");
}

function eeo(f: FormField, value: string): Omit<FieldAnswer, "key" | "rule"> {
  if (value) return choiceOrText(f, value);
  if (isChoice(f) && !f.options?.length) return { value: "Decline", confidence: "medium", note: "Voluntary; pick the “prefer not to say” option" };
  if (isChoice(f)) {
    const pick = chooseOption(f.options, "decline");
    return pick ? { value: pick, confidence: "high", note: "Voluntary; you chose not to say" } : { value: null, confidence: "low", note: "Voluntary question" };
  }
  return { value: null, confidence: "high", note: "Voluntary question" };
}

const OPEN_QUESTION =
  /\b(why|describe|tell us|explain|what (interests|excites|motivates|draws)|how would you|share (an|a|your)|walk us through|give an example|what makes you|anything else|additional information|in your own words|essay)\b/;

/** Answers every field it understands; the rest come back with value null and a note. */
export function answerFields(fields: FormField[], profile: ApplyProfile, context: AnswerContext = {}): FieldAnswer[] {
  const educationRows = [
    ...new Set(fields.map((f) => /^school--(\d+)$/.exec(f.hint ?? "")?.[1]).filter((x): x is string => x !== undefined).map(Number)),
  ].sort((a, b) => a - b);
  const ctx: AnswerContext = { ...context, educationRows };
  return fields.map((f) => {
    const q = normalizeLabel(`${f.label} ${f.placeholder ?? ""}`.trim());

    // Your own saved answers win, matched by wording.
    const own = [...(ctx.saved ?? []), ...profile.custom].find((c) => sameQuestion(c.question, q));
    if (own && f.type !== "file") {
      const value = isChoice(f) && f.options?.length ? chooseOption(f.options, own.answer) : own.answer;
      if (value) return { key: f.key, value, confidence: "high", rule: "saved-answer" };
    }

    for (const rule of RULES) {
      if (!rule.test(q, f)) continue;
      const a = rule.answer(profile, f, q, ctx);
      if (a && Array.isArray(a.value) && !(f.multiple || f.type === "checkbox")) a.value = a.value[0] ?? null;
      if (!a) continue;
      let value = a.value;
      // Yes/no answers for choice fields become the matching option ("Yes, I will require…").
      if ((value === "yes" || value === "no") && isChoice(f) && !f.options?.length) {
        // A dropdown whose options load later (comboboxes): the browser picks the closest one.
        value = value === "yes" ? "Yes" : "No";
      } else if ((value === "yes" || value === "no") && isChoice(f)) {
        value = chooseOption(f.options, value);
        if (!value) return { key: f.key, value: null, confidence: "low", rule: rule.id, note: `Couldn't find the “${a.value}” option` };
      } else if ((value === "yes" || value === "no") && f.type === "checkbox") {
        value = value === "yes";
      }
      if (typeof value === "string" && f.maxLength && value.length > f.maxLength) value = value.slice(0, f.maxLength);
      return { key: f.key, ...a, value, rule: rule.id };
    }

    if (f.type === "textarea" || OPEN_QUESTION.test(q)) {
      return { key: f.key, value: null, confidence: "low", rule: "open-question", needsWriting: true, note: "Needs a written answer" };
    }
    return { key: f.key, value: null, confidence: "low", rule: "unknown", note: f.required ? "Required: fill this in" : undefined };
  });
}

export { RULES as ANSWER_RULES };
