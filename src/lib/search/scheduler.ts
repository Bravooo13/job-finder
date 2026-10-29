import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { searches } from "@/lib/db/schema";
import { cleanUpStaleRuns, isSearchRunning, startSearchRun } from "./runner";

// Runs scheduled searches once a day at their chosen hour, while the app is open.
// If the app was closed at that hour, the search runs the next time it's open.

const CHECK_EVERY_MS = 5 * 60 * 1000;
const globalForScheduler = globalThis as unknown as {
  jobFinderScheduler?: NodeJS.Timeout; // timer from older versions of this file
  jobFinderSchedulerTimer?: NodeJS.Timeout;
  jobFinderSchedulerTick?: () => Promise<void>;
};

async function tick() {
  const now = new Date();
  const due = await db
    .select()
    .from(searches)
    .where(and(eq(searches.enabled, true), isNotNull(searches.scheduleHour)));
  for (const s of due) {
    if (isSearchRunning(s.id)) continue;
    const todayAtHour = new Date(now);
    todayAtHour.setHours(s.scheduleHour!, 0, 0, 0);
    const lastDue = todayAtHour <= now ? todayAtHour : new Date(todayAtHour.getTime() - 86_400_000);
    // Count from creation, so a brand-new search waits for its first scheduled time.
    const since = s.lastRunAt ?? s.createdAt;
    if (since < lastDue) {
      await startSearchRun(s.id, "schedule").catch((e) => console.error("Scheduled search failed to start", e));
    }
  }
}

export function startScheduler() {
  // The timer always calls the newest tick, so code updates apply without a restart.
  globalForScheduler.jobFinderSchedulerTick = tick;
  if (globalForScheduler.jobFinderScheduler) {
    clearInterval(globalForScheduler.jobFinderScheduler);
    globalForScheduler.jobFinderScheduler = undefined;
  }
  if (globalForScheduler.jobFinderSchedulerTimer) return;
  void cleanUpStaleRuns().catch(() => {});
  const run = () => void globalForScheduler.jobFinderSchedulerTick?.().catch((e) => console.error("Scheduler check failed", e));
  globalForScheduler.jobFinderSchedulerTimer = setInterval(run, CHECK_EVERY_MS);
  // First check shortly after start, once the app has settled.
  setTimeout(run, 30_000);
}
