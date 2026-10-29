import "server-only";
import { randomUUID } from "node:crypto";
import { grabLinkedIn, type LinkedInGrabOptions, type LinkedInGrabResult } from "./linkedin";

// LinkedIn grabs take a minute or more (a pause between jobs), so they run in
// the background and callers check on them.

export interface LinkedInRun {
  id: string;
  state: "running" | "done" | "error";
  message: string;
  startedAt: number;
  finishedAt?: number;
  result?: LinkedInGrabResult;
  error?: string;
}

const g = globalThis as unknown as { jobFinderLinkedInRuns?: Map<string, LinkedInRun>; jobFinderLinkedInBusy?: boolean };
const runs = (g.jobFinderLinkedInRuns ??= new Map());

export function summarize(r: LinkedInGrabResult): string {
  const parts = [`${r.found} jobs in the search`, `${r.added} new`];
  if (r.known) parts.push(`${r.known} already in Job Finder`);
  if (r.updated) parts.push(`${r.updated} updated`);
  if (r.boardsLearned) parts.push(`${r.boardsLearned} company boards learned`);
  let s = `${parts.join(", ")}.`;
  if (r.slowedDown) s += " LinkedIn asked to slow down, so some jobs were saved without details; try again later.";
  return s;
}

/** Starts a grab; only one runs at a time so LinkedIn sees one slow reader. */
export function startLinkedInRun(options: Omit<LinkedInGrabOptions, "onProgress">): LinkedInRun {
  if (g.jobFinderLinkedInBusy) throw new Error("A LinkedIn grab is already running. Wait for it to finish.");
  const run: LinkedInRun = { id: randomUUID(), state: "running", message: "Starting…", startedAt: Date.now() };
  runs.set(run.id, run);
  for (const [id, r] of runs) if (r.finishedAt && Date.now() - r.finishedAt > 6 * 3600_000) runs.delete(id);
  g.jobFinderLinkedInBusy = true;
  void grabLinkedIn({ ...options, onProgress: (m) => (run.message = m) })
    .then((result) => {
      run.state = "done";
      run.result = result;
      run.message = summarize(result);
    })
    .catch((e) => {
      run.state = "error";
      run.error = e instanceof Error ? e.message : String(e);
      run.message = run.error;
    })
    .finally(() => {
      run.finishedAt = Date.now();
      g.jobFinderLinkedInBusy = false;
    });
  return run;
}

export function getLinkedInRun(id: string): LinkedInRun | undefined {
  return runs.get(id);
}

/** Waits up to `ms` for a run to finish. */
export async function waitForRun(run: LinkedInRun, ms: number): Promise<LinkedInRun> {
  const end = Date.now() + ms;
  while (run.state === "running" && Date.now() < end) await new Promise((r) => setTimeout(r, 500));
  return run;
}
