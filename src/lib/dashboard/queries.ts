import "server-only";
import {
  addDays,
  differenceInCalendarDays,
  format,
  startOfDay,
  startOfWeek,
  subDays,
  subWeeks,
} from "date-fns";
import { count } from "drizzle-orm";
import { APPLIED_STATUSES, JOB_STATUSES, type JobStatus } from "@/lib/constants";
import { db } from "@/lib/db";
import { resumes } from "@/lib/db/schema";
import { listJobs } from "@/lib/jobs/queries";

const RESPONDED: JobStatus[] = ["interview", "offer", "offer_accepted", "offer_declined"];

export async function getDashboardData() {
  const [allJobs, resumeCount] = await Promise.all([
    listJobs(),
    db.select({ n: count() }).from(resumes),
  ]);
  const now = new Date();
  const today = startOfDay(now);

  const isApplied = (j: (typeof allJobs)[number]) =>
    j.dateApplied != null || APPLIED_STATUSES.includes(j.status as JobStatus);
  const applied = allJobs.filter(isApplied);
  const datedApplied = applied.filter((j) => j.dateApplied != null);

  const appliedSince = (days: number) =>
    datedApplied.filter((j) => j.dateApplied! >= subDays(today, days - 1)).length;

  const responded = applied.filter((j) => RESPONDED.includes(j.status as JobStatus)).length;

  // Applications per week for the last 12 weeks (weeks start Monday).
  const thisWeek = startOfWeek(now, { weekStartsOn: 1 });
  const weekly = Array.from({ length: 12 }, (_, i) => {
    const start = subWeeks(thisWeek, 11 - i);
    const end = addDays(start, 7);
    return {
      week: format(start, "MMM d"),
      applied: datedApplied.filter((j) => j.dateApplied! >= start && j.dateApplied! < end).length,
      saved: allJobs.filter((j) => j.createdAt >= start && j.createdAt < end).length,
    };
  });

  // One entry per day with at least one application, for the calendar.
  const perDay = new Map<string, number>();
  for (const j of datedApplied) {
    if (differenceInCalendarDays(today, j.dateApplied!) > 365) continue;
    const day = format(j.dateApplied!, "yyyy-MM-dd");
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  const calendar = Array.from(perDay, ([day, value]) => ({ day, value }));

  const statusCounts = JOB_STATUSES.map((s) => ({
    status: s.value,
    label: s.label,
    count: allJobs.filter((j) => j.status === s.value).length,
  })).filter((s) => s.count > 0);

  const upcoming = allJobs
    .filter(
      (j) =>
        j.dueDate != null &&
        j.dueDate >= today &&
        ["new", "draft"].includes(j.status),
    )
    .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())
    .slice(0, 5);

  return {
    totals: {
      tracked: allJobs.length,
      applied: applied.length,
      applied7: appliedSince(7),
      applied30: appliedSince(30),
      interviews: allJobs.filter((j) => j.status === "interview").length,
      offers: allJobs.filter((j) => ["offer", "offer_accepted"].includes(j.status)).length,
      responseRate: applied.length ? Math.round((responded / applied.length) * 100) : null,
      resumes: resumeCount[0]?.n ?? 0,
    },
    weekly,
    calendar,
    calendarFrom: format(subDays(today, 365), "yyyy-MM-dd"),
    // The calendar treats "to" as exclusive, so end tomorrow to include today.
    calendarTo: format(addDays(today, 1), "yyyy-MM-dd"),
    statusCounts,
    recent: allJobs.slice(0, 6),
    upcoming,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
