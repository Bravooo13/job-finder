import { fetchHtml } from "./fetch";
import { findJobPosting, jobFromJsonLd, jobFromMeta } from "./jsonld";
import { PROVIDERS } from "./providers";
import { ImportError, type ImportResult } from "./types";

export type { ImportedJob, ImportResult } from "./types";

// Sites that require you to be signed in, or whose terms forbid automated
// access. We don't fetch these; the user adds the job from their own browser.
const SIGNED_IN_SITES: { pattern: RegExp; name: string }[] = [
  { pattern: /(^|\.)linkedin\.com$/, name: "LinkedIn" },
  { pattern: /(^|\.)joinhandshake\.com$/, name: "Handshake" },
  { pattern: /(^|\.)indeed\.com$/, name: "Indeed" },
  { pattern: /(^|\.)glassdoor\.com$/, name: "Glassdoor" },
];

export async function importJobFromUrl(rawUrl: string): Promise<ImportResult> {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`);
  } catch {
    return { ok: false, error: "That doesn't look like a link." };
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    return { ok: false, error: "Only web links (http or https) can be imported." };
  }

  const signedIn = SIGNED_IN_SITES.find((s) => s.pattern.test(url.hostname));
  if (signedIn) {
    return {
      ok: false,
      error: `${signedIn.name} jobs can't be read from a link. Paste the job description below, or ask Claude to add it from your browser.`,
    };
  }

  try {
    const provider = PROVIDERS.find((p) => p.match(url));
    if (provider) {
      const job = await provider.load(url);
      return { ok: true, job };
    }

    const { html, finalUrl } = await fetchHtml(url.toString());

    // A company page may redirect to, or embed, a known job board.
    const redirected = new URL(finalUrl);
    const redirectProvider = PROVIDERS.find((p) => p.match(redirected));
    if (redirectProvider) {
      return { ok: true, job: await redirectProvider.load(redirected) };
    }

    const posting = findJobPosting(html);
    if (posting) {
      const job = jobFromJsonLd(posting, finalUrl);
      if (job.title) {
        return {
          ok: true,
          job,
          warning: job.company ? undefined : "Couldn't find the company name. Please fill it in.",
        };
      }
    }

    const fallback = jobFromMeta(html, finalUrl);
    if (!fallback.title) {
      return {
        ok: false,
        error: "Couldn't find a job on that page. Paste the job description instead.",
      };
    }
    return {
      ok: true,
      job: fallback,
      warning:
        "This page doesn't publish full job details, so only the basics were filled in. Paste the full description for better matching.",
    };
  } catch (error) {
    if (error instanceof ImportError) return { ok: false, error: error.message };
    console.error("Job import failed", error);
    return { ok: false, error: "Something went wrong reading that page." };
  }
}
