import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, asc, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { applyTasks, companies, discoveredJobs, jobs, settings, type ApplyTaskAnswer } from "@/lib/db/schema";
import { updateJobStatus } from "@/lib/jobs/actions";
import { saveFoundJob } from "@/lib/search/actions";
import { applicationUrl } from "./apply-url";
import { autoApplySettingsSchema, OPEN_STATUSES, type AutoApplySettings, type TaskStatus } from "./auto-schema";
import { findJobForUrl, markAppliedByUrl } from "./jobs";
import { onlyProvided } from "./profile-schema";

// Auto apply: a queue of applications. The browser helper (Chrome extension)
// claims one at a time, fills the form in your Chrome, and reports back.

const SETTINGS_KEY = "apply.auto";
const RESUME_KEY = "apply.resumeFile";
const UPLOADS = path.join(process.cwd(), "data", "uploads");

export type ApplyTask = typeof applyTasks.$inferSelect;

// ------------------------------------------------------------------ settings

export async function getAutoSettings(): Promise<AutoApplySettings> {
  const row = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, SETTINGS_KEY)).limit(1);
  const parsed = autoApplySettingsSchema.partial().safeParse(row[0]?.value ?? {});
  return autoApplySettingsSchema.parse(parsed.success ? parsed.data : {});
}

export async function saveAutoSettings(input: unknown): Promise<AutoApplySettings> {
  const next = { ...(await getAutoSettings()), ...onlyProvided(autoApplySettingsSchema.partial().parse(input), input) };
  await db
    .insert(settings)
    .values({ key: SETTINGS_KEY, value: next })
    .onConflictDoUpdate({ target: settings.key, set: { value: next, updatedAt: new Date() } });
  return next;
}

// ------------------------------------------------------------ resume file

export interface ResumeFile {
  name: string;
  size: number;
  uploadedAt: string;
  file: string; // name inside data/uploads
}

export async function getResumeFile(): Promise<ResumeFile | null> {
  const row = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, RESUME_KEY)).limit(1);
  const v = row[0]?.value as ResumeFile | undefined;
  return v?.file ? v : null;
}

export async function readResumeFile(): Promise<{ pdf: Buffer; fileName: string } | null> {
  const f = await getResumeFile();
  if (!f) return null;
  try {
    return { pdf: await readFile(path.join(UPLOADS, path.basename(f.file))), fileName: f.name };
  } catch {
    return null;
  }
}

export async function saveResumeFile(name: string, bytes: Buffer): Promise<ResumeFile> {
  if (bytes.length > 10 * 1024 * 1024) throw new Error("That file is over 10 MB.");
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("That isn't a PDF.");
  await mkdir(UPLOADS, { recursive: true });
  const old = await getResumeFile();
  const file = `resume-${Date.now()}.pdf`;
  await writeFile(path.join(UPLOADS, file), bytes);
  const clean = name.replace(/[^\w\-. ()]+/g, "").trim() || "Resume.pdf";
  const value: ResumeFile = { name: /\.pdf$/i.test(clean) ? clean : `${clean}.pdf`, size: bytes.length, uploadedAt: new Date().toISOString(), file };
  await db.insert(settings).values({ key: RESUME_KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
  if (old && old.file !== file) await rm(path.join(UPLOADS, path.basename(old.file)), { force: true });
  return value;
}

export async function deleteResumeFile() {
  const old = await getResumeFile();
  await db.delete(settings).where(eq(settings.key, RESUME_KEY));
  if (old) await rm(path.join(UPLOADS, path.basename(old.file)), { force: true });
}

// --------------------------------------------------------------- the helper

const seen = globalThis as unknown as { jobFinderHelperSeen?: { at: number; version?: string } };
export function helperSeen(version?: string) {
  seen.jobFinderHelperSeen = { at: Date.now(), version };
}
/** When the browser helper last asked for work (it asks every half minute while Chrome is open). */
export function helperLastSeen(): { at: number; version?: string } | null {
  return seen.jobFinderHelperSeen ?? null;
}

// ------------------------------------------------------------------- queue

export interface EnqueueInput {
  jobIds?: string[];
  foundIds?: string[];
  urls?: string[];
  by?: "you" | "agent";
}

export interface EnqueueResult {
  batchId: string;
  queued: { id: string; title: string; company: string; url: string }[];
  skipped: { title: string; company: string; reason: string }[];
}

interface Candidate {
  jobId: string | null;
  foundId: string | null;
  title: string;
  company: string;
  status?: string;
  ref: { url: string | null; applyUrl?: string | null; provider?: string | null; boardToken?: string | null };
}

async function candidates(input: EnqueueInput): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const jobIds = [...new Set(input.jobIds ?? [])].slice(0, 100);
  const foundIds = [...new Set(input.foundIds ?? [])].slice(0, 100);
  if (jobIds.length) {
    const rows = await db
      .select({ id: jobs.id, title: jobs.title, company: companies.name, status: jobs.status, url: jobs.url, applyUrl: jobs.applyUrl })
      .from(jobs)
      .innerJoin(companies, eq(jobs.companyId, companies.id))
      .where(inArray(jobs.id, jobIds));
    // A tracked job saved from Found jobs knows its board (for Greenhouse jobs shown on a company's own site).
    const found = await db
      .select({ jobId: discoveredJobs.jobId, provider: discoveredJobs.provider, boardToken: discoveredJobs.boardToken })
      .from(discoveredJobs)
      .where(inArray(discoveredJobs.jobId, jobIds));
    for (const r of rows) {
      const f = found.find((x) => x.jobId === r.id);
      out.push({ jobId: r.id, foundId: null, title: r.title, company: r.company, status: r.status, ref: { url: r.url, applyUrl: r.applyUrl, provider: f?.provider, boardToken: f?.boardToken } });
    }
  }
  if (foundIds.length) {
    const rows = await db.select().from(discoveredJobs).where(inArray(discoveredJobs.id, foundIds));
    const tracked = rows.filter((r) => r.jobId).map((r) => r.jobId!);
    const statuses = tracked.length ? await db.select({ id: jobs.id, status: jobs.status }).from(jobs).where(inArray(jobs.id, tracked)) : [];
    for (const r of rows) {
      out.push({
        jobId: r.jobId,
        foundId: r.id,
        title: r.title,
        company: r.company,
        status: statuses.find((s) => s.id === r.jobId)?.status,
        ref: { url: r.url, applyUrl: r.applyUrl, provider: r.provider, boardToken: r.boardToken },
      });
    }
  }
  for (const url of [...new Set(input.urls ?? [])].slice(0, 100)) {
    const m = await findJobForUrl(url);
    out.push({ jobId: m?.jobId ?? null, foundId: m?.foundId ?? null, title: m?.title ?? "Application", company: m?.company ?? new URL(url).hostname.replace(/^www\./, ""), ref: { url } });
  }
  return out;
}

const DONE_JOB = new Set(["applied", "interview", "offer", "offer_accepted", "offer_declined", "rejected", "withdrawn"]);

/** Adds applications to the queue (skipping ones already applied to or already queued). */
export async function enqueueApplications(input: EnqueueInput): Promise<EnqueueResult> {
  const batchId = crypto.randomUUID();
  const result: EnqueueResult = { batchId, queued: [], skipped: [] };
  const list = await candidates(input);
  const open = list.length
    ? await db
        .select({ jobId: applyTasks.jobId, foundId: applyTasks.foundId, url: applyTasks.url })
        .from(applyTasks)
        .where(inArray(applyTasks.status, OPEN_STATUSES))
    : [];
  for (const c of list) {
    if (c.status && DONE_JOB.has(c.status)) {
      result.skipped.push({ title: c.title, company: c.company, reason: `Already ${c.status}` });
      continue;
    }
    const target = applicationUrl(c.ref);
    const url = "url" in target ? target.url : (c.ref.applyUrl ?? c.ref.url ?? "");
    if (open.some((o) => (c.jobId && o.jobId === c.jobId) || (c.foundId && o.foundId === c.foundId) || o.url === url)) {
      result.skipped.push({ title: c.title, company: c.company, reason: "Already in Auto apply" });
      continue;
    }
    const needsLink = "error" in target;
    const [row] = await db
      .insert(applyTasks)
      .values({
        batchId,
        jobId: c.jobId,
        foundId: c.foundId,
        title: c.title.slice(0, 300),
        company: c.company.slice(0, 200),
        url: url || "about:blank",
        status: needsLink ? "needs_you" : "queued",
        summary: needsLink ? target.error : null,
        needs: needsLink ? ["The company's application link"] : [],
        checks: [],
        answers: [],
        by: input.by ?? "you",
        finishedAt: needsLink ? new Date() : null,
      })
      .returning({ id: applyTasks.id });
    if (needsLink) result.skipped.push({ title: c.title, company: c.company, reason: target.error });
    else result.queued.push({ id: row.id, title: c.title, company: c.company, url });
  }
  return result;
}

/** Gives the browser helper the next application to fill, or null. */
export async function claimNext(version?: string): Promise<ApplyTask | null> {
  helperSeen(version);
  // Applications the helper started but never finished (Chrome closed, page hung).
  await db
    .update(applyTasks)
    .set({ status: "failed", summary: "The browser helper stopped before finishing. Press Retry.", finishedAt: new Date() })
    .where(and(inArray(applyTasks.status, ["running", "submitting"]), lt(applyTasks.startedAt, new Date(Date.now() - 15 * 60_000))));
  const s = await getAutoSettings();
  if (!s.enabled) return null;
  for (let tries = 0; tries < 3; tries++) {
    const [next] = await db
      .select()
      .from(applyTasks)
      .where(eq(applyTasks.status, "queued"))
      .orderBy(desc(applyTasks.approved), asc(applyTasks.createdAt))
      .limit(1);
    if (!next) return null;
    // Claim it only if nobody else did in the meantime.
    const claimed = await db
      .update(applyTasks)
      .set({ status: "running", startedAt: new Date(), attempts: sql`${applyTasks.attempts} + 1`, summary: "Filling the form…" })
      .where(and(eq(applyTasks.id, next.id), eq(applyTasks.status, "queued")))
      .returning();
    if (claimed[0]) return claimed[0];
  }
  return null;
}

export async function getTask(id: string): Promise<ApplyTask | null> {
  const [row] = await db.select().from(applyTasks).where(eq(applyTasks.id, id)).limit(1);
  return row ?? null;
}

export async function listTasks(o: { status?: TaskStatus[]; batchId?: string; limit?: number } = {}) {
  const where = and(o.status?.length ? inArray(applyTasks.status, o.status) : undefined, o.batchId ? eq(applyTasks.batchId, o.batchId) : undefined);
  const rows = await db
    .select()
    .from(applyTasks)
    .where(where)
    .orderBy(desc(applyTasks.updatedAt))
    .limit(Math.min(o.limit ?? 100, 500));
  const counts = await db
    .select({ status: applyTasks.status, n: sql<number>`count(*)` })
    .from(applyTasks)
    .where(o.batchId ? eq(applyTasks.batchId, o.batchId) : undefined)
    .groupBy(applyTasks.status);
  return { tasks: rows, counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])) as Partial<Record<TaskStatus, number>> };
}

export interface TaskReport {
  status: TaskStatus;
  summary?: string;
  needs?: string[];
  checks?: string[];
  answers?: ApplyTaskAnswer[];
  url?: string;
}

async function markApplied(task: ApplyTask): Promise<string | null> {
  if (task.jobId) {
    const r = await updateJobStatus(task.jobId, "applied");
    return r.ok ? task.jobId : null;
  }
  if (task.foundId) {
    const saved = await saveFoundJob(task.foundId);
    if (saved.ok) {
      await updateJobStatus(saved.data.jobId, "applied");
      await db.update(jobs).set({ applyUrl: task.url }).where(and(eq(jobs.id, saved.data.jobId), sql`${jobs.applyUrl} is null`));
      return saved.data.jobId;
    }
  }
  const r = await markAppliedByUrl(task.url);
  return "jobId" in r ? r.jobId : null;
}

/** The browser helper's report on an application. */
export async function reportTask(id: string, report: TaskReport): Promise<ApplyTask | null> {
  const task = await getTask(id);
  if (!task) return null;
  const finished = ["held", "needs_you", "submitted", "failed", "canceled"].includes(report.status);
  const set: Partial<typeof applyTasks.$inferInsert> = {
    status: report.status,
    ...(report.summary !== undefined ? { summary: report.summary.slice(0, 2000) } : {}),
    ...(report.needs ? { needs: report.needs.slice(0, 50).map((s) => s.slice(0, 300)) } : {}),
    ...(report.checks ? { checks: report.checks.slice(0, 80).map((s) => s.slice(0, 300)) } : {}),
    ...(report.answers ? { answers: report.answers.slice(0, 300) } : {}),
    ...(report.url && /^https?:\/\//.test(report.url) ? { url: report.url.slice(0, 2000) } : {}),
    ...(finished ? { finishedAt: new Date() } : {}),
  };
  if (report.status === "submitted") {
    const jobId = await markApplied({ ...task, url: set.url ?? task.url });
    if (jobId) set.jobId = jobId;
  }
  const [row] = await db.update(applyTasks).set(set).where(eq(applyTasks.id, id)).returning();
  return row ?? null;
}

/** Your buttons on the Apply page: approve a held one, try again, cancel, or remove it from the list. */
export async function actOnTask(id: string, action: "approve" | "retry" | "cancel" | "remove" | "submitted"): Promise<ApplyTask | null> {
  const task = await getTask(id);
  if (!task) return null;
  if (action === "remove") {
    await db.delete(applyTasks).where(eq(applyTasks.id, id));
    return task;
  }
  if (action === "submitted") return reportTask(id, { status: "submitted", summary: "You submitted it yourself." });
  if (action === "cancel") {
    const [row] = await db.update(applyTasks).set({ status: "canceled", finishedAt: new Date() }).where(eq(applyTasks.id, id)).returning();
    return row;
  }
  // The job may have a company link by now (or still only a LinkedIn one).
  let url = task.url;
  if (task.jobId || task.foundId) {
    const [c] = await candidates(task.jobId ? { jobIds: [task.jobId] } : { foundIds: [task.foundId!] });
    if (c) {
      const target = applicationUrl(c.ref);
      if ("error" in target) {
        const [row] = await db.update(applyTasks).set({ status: "needs_you", summary: target.error, needs: ["The company's application link"], finishedAt: new Date() }).where(eq(applyTasks.id, id)).returning();
        return row;
      }
      url = target.url;
    }
  }
  const [row] = await db
    .update(applyTasks)
    .set({ status: "queued", url, approved: action === "approve", summary: action === "approve" ? "Approved: it will be submitted." : "Waiting to try again.", needs: [], finishedAt: null })
    .where(eq(applyTasks.id, id))
    .returning();
  return row;
}

/** Open applications per tracked job and found job, for badges in lists. */
export async function openTasksFor(ids: { jobIds?: string[]; foundIds?: string[] }) {
  const conds = [];
  if (ids.jobIds?.length) conds.push(inArray(applyTasks.jobId, ids.jobIds));
  if (ids.foundIds?.length) conds.push(inArray(applyTasks.foundId, ids.foundIds));
  if (!conds.length) return [];
  return db
    .select({ id: applyTasks.id, jobId: applyTasks.jobId, foundId: applyTasks.foundId, status: applyTasks.status, summary: applyTasks.summary })
    .from(applyTasks)
    .where(or(...conds))
    .orderBy(desc(applyTasks.updatedAt));
}
