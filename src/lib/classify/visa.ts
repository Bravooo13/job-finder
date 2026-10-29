// What a posting says about visas: does it sponsor, welcome OPT/CPT (F-1)
// students, rule out sponsorship, or require US citizenship?

export type VisaStatus = "sponsors" | "opt_cpt" | "unknown" | "no_sponsorship" | "citizens_only";

export const VISA_STATUSES: { id: VisaStatus; label: string; short: string; tone: "good" | "neutral" | "bad" }[] = [
  { id: "sponsors", label: "Offers visa sponsorship", short: "Sponsors visas", tone: "good" },
  { id: "opt_cpt", label: "Open to OPT/CPT (F-1) students", short: "OPT/CPT OK", tone: "good" },
  { id: "unknown", label: "Doesn't say", short: "Visa: not stated", tone: "neutral" },
  { id: "no_sponsorship", label: "No visa sponsorship", short: "No sponsorship", tone: "bad" },
  { id: "citizens_only", label: "US citizens / clearance only", short: "Citizens only", tone: "bad" },
];

export function visaLabel(id: string | null | undefined): string {
  return VISA_STATUSES.find((v) => v.id === id)?.label ?? "Doesn't say";
}

const NEG = String.raw`(?:not|unable to|cannot|can't|can not|won't|will not|do not|does not|don't|are not able to|is not able to|no longer)`;

const CITIZEN: RegExp[] = [
  /\b(?:u\.?s\.?|united states)\s+citizen(?:ship)?\s+(?:is\s+)?(?:required|needed|mandatory)/i,
  /\bmust\s+(?:be|hold)\s+(?:a\s+)?(?:u\.?s\.?|united states)\s+(?:citizen|citizenship)/i,
  /\b(?:only|exclusively)\s+(?:open\s+to\s+)?(?:u\.?s\.?|united states)\s+citizens/i,
  /\b(?:u\.?s\.?|united states)\s+citizens?\s+only\b/i,
  /\bcitizenship\s+is\s+required/i,
  /\b(?:active|current|ability to obtain|eligib\w+ (?:for|to obtain)|obtain and maintain)\s+(?:a\s+|an\s+)?(?:u\.?s\.?\s+)?(?:government\s+)?(?:secret|top secret|ts\/sci|ts|security|public trust)\s+clearance/i,
  /\b(?:secret|top secret|ts\/sci)\s+clearance\s+(?:is\s+)?(?:required|needed)/i,
  /\bitar\b[^.]{0,120}\b(?:u\.?s\.? persons?|citizens?|permanent residents?)/i,
  /\b(?:u\.?s\.? persons?)\s+(?:as defined|only|is required)/i,
  /\bgreen card holders?\s+(?:or citizens\s+)?only/i,
];

const NO_SPONSOR: RegExp[] = [
  new RegExp(String.raw`\b${NEG}\s+(?:currently\s+|presently\s+)?(?:be\s+able\s+to\s+)?sponsor`, "i"),
  new RegExp(String.raw`\b${NEG}\s+(?:currently\s+)?(?:be\s+able\s+to\s+)?(?:provide|offer|support|consider|accommodate)\w*\s+(?:any\s+)?(?:[\w-]+\s+){0,3}(?:sponsorship|visas?)`, "i"),
  /\bwithout\s+(?:the\s+)?(?:need|requirement|necessity)\s+(?:for|of)\s+(?:current\s+or\s+future\s+|now\s+or\s+in\s+the\s+future\s+)?(?:[\w-]+\s+){0,3}sponsorship/i,
  /\bwithout\s+(?:current\s+or\s+future\s+|requiring\s+|needing\s+)?(?:employer\s+|visa\s+|immigration\s+)?sponsorship/i,
  /\bno\s+(?:visa\s+|h-?1b\s+|immigration\s+|employment\s+)?sponsorship\b/i,
  /\bsponsorship\s+(?:is\s+|will\s+)?not\s+(?:be\s+)?(?:available|provided|offered|possible)/i,
  /\bnot\s+(?:eligible|open)\s+(?:for|to)\s+(?:candidates\s+(?:requiring|who require)\s+)?(?:visa\s+|immigration\s+)?sponsorship/i,
  /\bus work authorization required\b/i, // Handshake's wording
  /\b(?:must|need to|required to)\s+(?:be\s+)?(?:legally\s+)?(?:authorized|eligible)\s+to\s+work\s+in\s+the\s+(?:u\.?s\.?|united states)\s+(?:on\s+a\s+(?:permanent|full-time)\s+basis\s+)?without/i,
];

const NO_OPT: RegExp[] = [
  /\b(?:opt|cpt|stem opt|f-?1)\b[^.]{0,60}\b(?:not\s+(?:eligible|accepted|considered|supported)|ineligible|will not be considered)/i,
  new RegExp(String.raw`\b${NEG}\s+(?:accept|consider|support)\s+(?:candidates\s+on\s+)?(?:opt|cpt|f-?1)`, "i"),
];

const SPONSORS: RegExp[] = [
  /\b(?:visa|h-?1b|immigration|employment)\s+sponsorship\s+(?:is\s+|will\s+be\s+)?(?:available|offered|provided|possible|supported)/i,
  /\b(?:we|company|employer|firm)\s+(?:will|can|is able to|are able to|do|does)\s+(?:offer\s+|provide\s+)?sponsor(?:ship)?\b/i,
  /\b(?:able|willing|happy|glad)\s+to\s+sponsor\b/i,
  /\bopen to (?:u\.?s\.?\s+)?visa sponsorship\b/i, // Handshake's wording
  /\bsponsorship\s+(?:available|offered|provided)\b/i,
  /\boffers?\s+(?:visa\s+|h-?1b\s+)?sponsorship\b/i,
  /\bwill sponsor\b/i,
  /\bopen to (?:candidates|applicants) (?:who (?:require|need)|requiring|needing) (?:visa )?sponsorship\b/i,
];

const OPT_CPT: RegExp[] = [
  /\bus work authorization not required\b/i, // Handshake: open to candidates without US work authorization
  /\b(?:opt|cpt|stem opt|f-?1)\b[^.]{0,80}\b(?:welcome|eligible|encouraged|accepted|considered|supported|okay|ok|apply)\b/i,
  /\b(?:accepts?|open to|welcomes?)\s+(?:candidates\s+(?:on|with)\s+)?(?:opt|cpt|f-?1|international students)/i,
  /\binternational students?\s+(?:are\s+)?(?:welcome|encouraged|eligible)/i,
];

export interface VisaResult {
  status: VisaStatus;
  note: string | null; // the sentence that decided it
  noOptCpt: boolean;
}

/** The sentence around a match (bullets and line breaks count as sentence ends; "U.S." doesn't). */
export function sentenceAround(text: string, index: number, length: number): string {
  const MAX = 300;
  const before = text.slice(0, index);
  const boundary = /(?:[.!?](?<![A-Z]\.)\s|\n|•|\u2022|·\s)/g;
  let start = 0;
  for (const m of before.matchAll(boundary)) start = (m.index ?? 0) + m[0].length;
  const after = text.slice(index + length);
  const endMatch = /(?:[.!?](?<![A-Z]\.)(?=\s|$)|\n|•)/.exec(after);
  let end = endMatch ? index + length + endMatch.index + (endMatch[0] === "." ? 1 : 0) : Math.min(text.length, index + length + 160);
  // Long sentence: keep a window around the match, cut at spaces, and mark the cuts.
  let lead = "";
  let tail = "";
  if (end - start > MAX) {
    if (index - start > 120) {
      const s = text.lastIndexOf(" ", index - 100);
      if (s > start) {
        start = s + 1;
        lead = "…";
      }
    }
    if (end - start > MAX) {
      const e = text.lastIndexOf(" ", start + MAX);
      end = e > index + length ? e : start + MAX;
      tail = "…";
    }
  }
  return lead + text.slice(start, end).replace(/\s+/g, " ").trim() + tail;
}

function firstHit(text: string, res: RegExp[]): string | null {
  for (const re of res) {
    const m = re.exec(text);
    if (m) return sentenceAround(text, m.index, m[0].length);
  }
  return null;
}

/**
 * Reads a posting for visa signals. `hint` is a source's own field, such as
 * Simplify's "Offers Sponsorship" or Handshake's work-authorization line.
 */
export function classifyVisa(title: string, description: string | null | undefined, hint?: string | null): VisaResult {
  const text = `${title}\n${hint ?? ""}\n${description ?? ""}`;
  const citizen = firstHit(text, CITIZEN);
  const noOpt = firstHit(text, NO_OPT);
  if (citizen) return { status: "citizens_only", note: citizen, noOptCpt: Boolean(noOpt) };
  if (/^u\.?s\.? citizenship is required/i.test(hint ?? "")) return { status: "citizens_only", note: hint!, noOptCpt: true };
  if (/^does not offer sponsorship/i.test(hint ?? "")) return { status: "no_sponsorship", note: hint!, noOptCpt: Boolean(noOpt) };
  if (/^offers sponsorship/i.test(hint ?? "")) return { status: "sponsors", note: hint!, noOptCpt: false };

  const sponsors = firstHit(text, SPONSORS);
  const opt = firstHit(text, OPT_CPT);
  const none = firstHit(text, NO_SPONSOR);
  // "We don't sponsor" usually wins over a generic sponsorship sentence, but a
  // posting can rule out H-1B and still welcome OPT/CPT interns.
  if (none && opt && !noOpt) return { status: "opt_cpt", note: opt, noOptCpt: false };
  if (none) return { status: "no_sponsorship", note: none, noOptCpt: Boolean(noOpt) };
  if (sponsors) return { status: "sponsors", note: sponsors, noOptCpt: Boolean(noOpt) };
  if (opt && !noOpt) return { status: "opt_cpt", note: opt, noOptCpt: false };
  return { status: "unknown", note: noOpt, noOptCpt: Boolean(noOpt) };
}
