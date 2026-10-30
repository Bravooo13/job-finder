// The page with the application form for a posting. Pure, shared by the server and the tests.

const JOB_SITES = /(^|\.)(linkedin\.com|joinhandshake\.com|indeed\.com|glassdoor\.com|ziprecruiter\.com|simplify\.jobs|wellfound\.com)$/i;

export interface PostingRef {
  url: string | null;
  applyUrl?: string | null;
  provider?: string | null;
  boardToken?: string | null;
}

/** Greenhouse's own form page works for every company, even ones that show jobs on their own site. */
function greenhouseForm(u: URL, boardToken?: string | null): string | null {
  const eu = /\.eu\.greenhouse\.io$/.test(u.hostname) ? ".eu" : "";
  const path = /^\/(?:embed\/job_app)?\/?([^/]+)\/jobs\/(\d+)/.exec(u.pathname);
  if (/greenhouse\.io$/.test(u.hostname)) {
    if (u.pathname.startsWith("/embed/job_app")) return u.toString();
    if (path) return `https://job-boards${eu}.greenhouse.io/embed/job_app?for=${encodeURIComponent(path[1])}&token=${path[2]}`;
    const token = u.searchParams.get("for") ?? boardToken;
    const id = u.searchParams.get("token") ?? u.searchParams.get("gh_jid");
    if (token && id) return `https://job-boards${eu}.greenhouse.io/embed/job_app?for=${encodeURIComponent(token)}&token=${id}`;
    return null;
  }
  // A company careers page with ?gh_jid=123 (West Monroe, Stripe, …).
  const id = u.searchParams.get("gh_jid");
  if (id && boardToken) return `https://job-boards.greenhouse.io/embed/job_app?for=${encodeURIComponent(boardToken)}&token=${id}`;
  return null;
}

export function applicationUrl(ref: PostingRef): { url: string } | { error: string } {
  const candidates = [ref.applyUrl, ref.url].filter((x): x is string => Boolean(x && /^https?:\/\//i.test(x)));
  for (const raw of candidates) {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      continue;
    }
    const host = u.hostname.replace(/^www\./, "");
    if (JOB_SITES.test(host)) continue;
    const gh = greenhouseForm(u, ref.provider === "greenhouse" ? ref.boardToken : null);
    if (gh) return { url: gh };
    if (/(^|\.)lever\.co$/.test(host)) {
      const m = /^\/([^/]+)\/([0-9a-f-]{36})(\/apply)?/i.exec(u.pathname);
      if (m) return { url: `https://${u.hostname}/${m[1]}/${m[2]}/apply` };
    }
    if (host === "jobs.ashbyhq.com") {
      const m = /^\/([^/]+)\/([0-9a-f-]{36})(\/application)?/i.exec(u.pathname);
      if (m) return { url: `https://jobs.ashbyhq.com/${m[1]}/${m[2]}/application` };
    }
    return { url: u.toString() };
  }
  const site = candidates[0] ? new URL(candidates[0]).hostname.replace(/^www\./, "") : "";
  return {
    error: site
      ? `Only a ${site} link so far. Open the job there and save the company's own apply link (the extension's “Save the job I'm viewing” picks it up).`
      : "No application link.",
  };
}
