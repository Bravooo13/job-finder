// What a page looks like after Submit, and which postings Auto apply can't finish.
// The patterns are sent to the browser helper with each application, so they can be
// improved here without reloading the extension.

export const OUTCOME_PATTERNS = {
  /** A thank-you or confirmation page. */
  thanks:
    "thank you for (applying|your application|submitting)|application (has been |was )?(submitted|received|sent)|we('ve| have) received your application|successfully (submitted|applied)|your application is (complete|in)|thanks for applying|you('ve| have) (successfully )?applied|application complete",
  /** A confirmation page by its address (Greenhouse, Lever, Ashby, SmartRecruiters). */
  thanksUrl: "/confirmation|/thanks|/thank-you|/thank_you|application[-_]?(submitted|confirmation|complete)|[?&](submitted|success)=",
  /** A page asking for a code the site emailed or texted. */
  code: "(security|verification|confirmation|one[- ]time|access) code|enter the (\\d+[- ]character |\\d+[- ]digit )?code|we('ve| have)? (just )?(sent|emailed|texted) (you )?(a|an|the) .{0,40}code|check your (email|inbox) for (a|the) code|verify (your|it's) (email|you)",
  /** Inputs that take such a code. */
  codeInput:
    'input[autocomplete="one-time-code"], input[name*="code" i]:not([type=hidden]):not([name*="zip" i]):not([name*="postal" i]):not([name*="country" i]), input[id*="security" i], input[id*="verification" i], input[aria-label*="code" i]',
} as const;

export type OutcomePatterns = typeof OUTCOME_PATTERNS;

const WORKDAY = /(^|\.)myworkday(jobs|site)\.com$|(^|\.)wd\d+\.myworkday/i;
const SIGN_IN_ONLY = /(^|\.)(taleo\.net|icims\.com|successfactors\.(com|eu)|oraclecloud\.com|brassring\.com)$/i;

/**
 * Why Auto apply can't finish this posting by itself (it is skipped when queued), or null.
 * Workday and similar sites need you to sign in or make an account; some postings want a
 * video or files sent by email.
 */
export function queueBlocker(url: string, description?: string | null): string | null {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  if (WORKDAY.test(host)) return "Workday: you sign in on the company's site and apply there (Auto apply can't sign in or make accounts for you)";
  if (SIGN_IN_ONLY.test(host)) return `${host.split(".").slice(-2).join(".")}: the company's site needs you to sign in or make an account first`;
  const d = (description ?? "").replace(/\s+/g, " ").toLowerCase();
  if (/\b(record|submit|send|upload|include)\b.{0,60}\bvideo\b|\b\d{2,3}[–-]\d{2,3} ?second video\b|\bvideo (submission|introduction|response) (is )?required\b/.test(d))
    return "The posting asks for a video you record yourself";
  if (/\brequired\b.{0,200}\b(send|email) (this|it|your [a-z ]{0,30}) to [\w.+-]+@[\w-]+\.[a-z.]+/.test(d) || /\b(send|email) your (resume|application|portfolio|writing sample|video)\b.{0,40}\bto [\w.+-]+@/.test(d))
    return "The posting asks you to email something yourself";
  return null;
}
