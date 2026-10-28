// HTTP helper for reading job board feeds during searches. Unlike the link
// importer, errors here are short technical messages for the run log.

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 JobFinder/0.2";

export class BoardError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export async function getJson<T>(
  url: string,
  { signal, timeoutMs = 20_000, init }: { signal?: AbortSignal; timeoutMs?: number; init?: RequestInit } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
          "Accept-Language": "en-US,en;q=0.9",
          ...(init?.headers ?? {}),
        },
        signal: controller.signal,
        cache: "no-store",
      });
      if (res.status === 429 && attempt < 2) {
        await sleep(1500 * (attempt + 1), signal);
        continue;
      }
      if (!res.ok) throw new BoardError(`HTTP ${res.status}`, res.status);
      return (await res.json()) as T;
    } catch (error) {
      if (signal?.aborted) throw new BoardError("stopped");
      if (error instanceof BoardError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new BoardError("timed out");
      if (attempt < 1) {
        await sleep(800, signal);
        continue;
      }
      throw new BoardError(error instanceof SyntaxError ? "bad JSON" : "network error");
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

/** Runs `fn` over `items` with at most `limit` in flight. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length && !signal?.aborted) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
