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
}

export type Confidence = "high" | "medium" | "low";

export interface FieldAnswer {
  key: string;
  /** Text to type, the option to pick, true/false for a single checkbox, or null to leave alone. */
  value: string | boolean | null;
  confidence: Confidence;
  /** Which rule answered it, for review. */
  rule: string;
  note?: string;
  /** Upload this file into a file field. */
  file?: "resume" | "cover_letter";
  /** An open question that needs a written answer (the AI can draft it). */
  needsWriting?: boolean;
}

export interface AnswerContext {
  company?: string;
  jobTitle?: string;
  coverLetter?: string;
  /** Answers you or the AI wrote for this job before, by question. */
  saved?: { question: string; answer: string }[];
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

  // ---- legal: sponsorship and work authorization (order matters)
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
        const pick =
          chooseOption(f.options, p.visaStatus) ??
          (/f-?1/i.test(p.visaStatus) ? chooseOption(f.options, "F-1") ?? chooseOption(f.options, "student visa") : null) ??
          chooseOption(f.options, "other");
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

  // ---- contact
  { id: "first-name", test: (q) => /^(legal )?first name|given name|^first$/.test(q), answer: (p) => textAnswer(p.firstName) },
  { id: "last-name", test: (q) => /^(legal )?last name|surname|family name|^last$/.test(q), answer: (p) => textAnswer(p.lastName) },
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
  { id: "email", test: (q, f) => f.type === "email" || /e-?mail/.test(q), answer: (p) => textAnswer(p.email) },
  {
    id: "phone-type",
    test: (q, f) => /phone/.test(q) && /type|device/.test(q) && isChoice(f),
    answer: (_p, f) => ({ value: f.options?.length ? chooseOption(f.options, "mobile") ?? chooseOption(f.options, "cell") : "Mobile", confidence: "high" }),
  },
  { id: "phone", test: (q, f) => f.type === "tel" || /phone|mobile|cell/.test(q), answer: (p) => textAnswer(p.phone) },
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
  { id: "degree", test: (q) => /degree|level of education|highest education/.test(q), answer: (p, f) => choiceOrText(f, p.degree) },
  { id: "major", test: (q) => /major|field of study|discipline|concentration|area of study/.test(q), answer: (p, f) => choiceOrText(f, p.major) },
  { id: "gpa", test: (q) => /\bgpa\b|grade point/.test(q), answer: (p) => textAnswer(p.gpa, "high", p.gpa ? undefined : "Leave blank or add your GPA in My answers") },
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
      if (!isChoice(f) || !f.options?.length) return textAnswer(wanted, isChoice(f) ? "medium" : "high");
      return {
        value:
          chooseOption(f.options, wanted) ??
          chooseOption(f.options, "linkedin") ??
          chooseOption(f.options, "job board") ??
          chooseOption(f.options, "company website") ??
          chooseOption(f.options, "other"),
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
    id: "worked-here",
    test: (q) => /previously (been )?(employed|worked)|worked (for|at|with) .{0,40}(before|previously)|former employee|ever (been )?employed by/.test(q),
    answer: (p) => yn(p.workedHereBefore || "no"),
  },
  { id: "relatives", test: (q) => /relatives?|family members? .{0,30}(work|employ)/.test(q), answer: () => yn("no", "medium") },
  { id: "non-compete", test: (q) => /non-?compete|non-?solicit|restrictive covenant/.test(q), answer: () => yn("no", "medium") },
  { id: "languages", test: (q) => /languages? (do you|you) speak|which languages|language proficiency/.test(q), answer: (p, f) => choiceOrText(f, p.languages, "medium") },

  // ---- voluntary self-identification (EEO); default is "decline"
  { id: "eeo-gender", test: (q) => /\bgender\b|\bsex\b/.test(q), answer: (p, f) => eeo(f, p.gender) },
  { id: "eeo-hispanic", test: (q) => /hispanic|latin[oa]/.test(q), answer: (p, f) => eeo(f, p.hispanicLatino) },
  { id: "eeo-race", test: (q) => /\brace\b|ethnicity/.test(q), answer: (p, f) => eeo(f, p.race) },
  { id: "eeo-veteran", test: (q) => /veteran|military service|armed forces/.test(q), answer: (p, f) => eeo(f, p.veteran) },
  { id: "eeo-disability", test: (q) => /disabilit/.test(q), answer: (p, f) => eeo(f, p.disability) },

  // ---- things only you should do
  {
    id: "consent",
    test: (q, f) => (f.type === "checkbox" || isChoice(f)) && /acknowledge|consent|i agree|agree to|certif|attest|privacy (policy|notice)|terms|accurate and complete/.test(q),
    answer: () => ({ value: null, confidence: "low", note: "Read this and tick it yourself" }),
  },
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
  return { value, confidence: isChoice(f) ? "medium" : confidence };
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
export function answerFields(fields: FormField[], profile: ApplyProfile, ctx: AnswerContext = {}): FieldAnswer[] {
  return fields.map((f) => {
    const q = normalizeLabel(`${f.label} ${f.placeholder ?? ""}`.trim());

    // Your own saved answers win, matched by wording.
    const own = [...(ctx.saved ?? []), ...profile.custom].find((c) => overlap(c.question, q) >= 0.75);
    if (own && f.type !== "file") {
      const value = isChoice(f) && f.options?.length ? chooseOption(f.options, own.answer) : own.answer;
      if (value) return { key: f.key, value, confidence: "high", rule: "saved-answer" };
    }

    for (const rule of RULES) {
      if (!rule.test(q, f)) continue;
      const a = rule.answer(profile, f, q, ctx);
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
