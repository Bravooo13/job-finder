"use client";

// Browser side of Auto apply: queue jobs and nudge the browser helper to start now.

export interface QueueResult {
  batchId: string;
  queued: { id: string; title: string; company: string }[];
  skipped: { title: string; company: string; reason: string }[];
  helperRunning: boolean;
  note: string;
}

export async function queueAutoApply(body: { jobIds?: string[]; foundIds?: string[] }): Promise<{ ok: true; data: QueueResult } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/apply/auto", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, by: "you" }) });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error ?? `Job Finder said ${res.status}` };
    startHelperNow();
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** The extension's script on Job Finder pages starts the queue right away instead of within half a minute. */
export function startHelperNow() {
  window.postMessage({ jobFinderHelper: "start-auto-apply" }, window.location.origin);
}

/** Whether the browser helper's script is on this page (the extension is installed). */
export function helperInstalled(): string | null {
  return document.documentElement.dataset.jobFinderHelper ?? null;
}

export function describeQueue(r: QueueResult): string {
  const parts = [];
  if (r.queued.length) parts.push(`${r.queued.length} queued`);
  if (r.skipped.length) parts.push(`${r.skipped.length} skipped (${[...new Set(r.skipped.map((s) => s.reason.split(".")[0]))].slice(0, 2).join("; ")})`);
  return `${parts.join(", ")}.${r.queued.length && !r.helperRunning ? " Open Chrome with the Job Finder Helper to start." : ""}`;
}
