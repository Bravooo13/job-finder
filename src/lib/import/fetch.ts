import { ImportError } from "./types";

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 5_000_000;

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 JobFinder/0.1",
  "Accept-Language": "en-US,en;q=0.9",
};

async function request(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      headers: { ...BROWSER_HEADERS, ...(init.headers ?? {}) },
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
    });
    if (res.status === 404) throw new ImportError("That job could not be found. It may have been taken down.");
    if (res.status === 429) throw new ImportError("The job site is rate-limiting requests. Try again in a minute.");
    if (!res.ok) throw new ImportError(`The job site answered with an error (${res.status}).`);
    return res;
  } catch (error) {
    if (error instanceof ImportError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ImportError("The job site took too long to answer.");
    }
    throw new ImportError("Couldn't reach the job site. Check the link and your internet connection.");
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await request(url, {
    ...init,
    headers: { Accept: "application/json", ...(init.headers ?? {}) },
  });
  try {
    return (await res.json()) as T;
  } catch {
    throw new ImportError("The job site sent back data we couldn't read.");
  }
}

export async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string }> {
  const res = await request(url, {
    headers: { Accept: "text/html,application/xhtml+xml" },
  });
  const type = res.headers.get("content-type") ?? "";
  if (type && !type.includes("html") && !type.includes("xml")) {
    throw new ImportError("That link doesn't point to a web page.");
  }
  const text = await res.text();
  return { html: text.slice(0, MAX_BYTES), finalUrl: res.url || url };
}
