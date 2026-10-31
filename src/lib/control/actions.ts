import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { AGENTS, extractLatex, getAgent, type AgentId } from "@/lib/ai/agents";
import { buildSystemPrompt, resumeToText, type ChatContext } from "@/lib/ai/context";
import { forApplying } from "@/lib/ai/models";
import { runChat, stripThinking } from "@/lib/ai/providers";
import { getAiSettings, getAiStatus } from "@/lib/ai/settings";
import { actOnTask, enqueueApplications, getAutoSettings, getResumeFile, getTask, helperLastSeen, listTasks, saveAutoSettings } from "@/lib/apply/auto";
import { SUBMIT_MODES, TASK_STATUSES, type TaskStatus } from "@/lib/apply/auto-schema";
import { fillAnswers, fillSchema } from "@/lib/apply/fill";
import { findJobById, findJobForUrl, markAppliedByUrl, rememberAnswer } from "@/lib/apply/jobs";
import { letterForApplication, saveLetterForApplication } from "@/lib/apply/letter";
import { getApplyProfile, saveApplyProfile } from "@/lib/apply/profile";
import { applyQueue } from "@/lib/apply/queue";
import { writeAnswerSchema, writeApplicationAnswer } from "@/lib/apply/write-answer";
import { findBoards, verifyBoard } from "@/lib/boards/detect";
import { PROVIDERS, type Provider } from "@/lib/boards/types";
import { JOB_STATUS_VALUES } from "@/lib/constants";
import { db } from "@/lib/db";
import { aiMessages, aiThreads, coverLetters, resumes } from "@/lib/db/schema";
import { filtersFromParams } from "@/lib/found/filters";
import { foundFacets, getFoundMany, listFound } from "@/lib/found/queries";
import { LINKEDIN_LIMITS } from "@/lib/grab/linkedin";
import { getLinkedInRun, startLinkedInRun, waitForRun, type LinkedInRun } from "@/lib/grab/linkedin-runs";
import { grabPage, pageSchema } from "@/lib/grab/page";
import { grabSchema, saveGrabbed } from "@/lib/grab/save";
import { addNote, updateJobStatus } from "@/lib/jobs/actions";
import { getJob, listJobs } from "@/lib/jobs/queries";
import { compileLatex } from "@/lib/latex/tectonic";
import { createIndustryVersion, saveResumeLatex } from "@/lib/resumes/actions";
import { addCompanyBoard, createSearch, runSearch, saveFoundJob, setFoundStatus } from "@/lib/search/actions";
import { newSearchDefaults } from "@/lib/search/defaults";
import { getResume } from "@/lib/resumes/queries";
import { listSearches } from "@/lib/search/queries";
import { SEARCH_SOURCES } from "@/lib/search/schema";
import { currentActor } from "./context";
import { listActivity, listRequests, noteActivity, spendStatus, waitingCounts } from "./log";
import { getControlSettings } from "./settings";
import { ACTOR_LABELS, GROUPS, resolveLevel, type Actor, type GroupId } from "./shared";

// Everything Job Finder can do, defined once. The Job Finder assistant and the
// Job scout get these as tools, the MCP server lists them for outside AIs, and
// each one runs through runAction (./run.ts), which checks your permissions and
// writes the activity log. Your buttons call the same functions underneath.

type Json = Record<string, unknown>;

export interface ActionDef<S extends z.ZodType = z.ZodType> {
  name: string;
  /** What it does, for people (permissions page, Waiting for you). */
  title: string;
  /** What it does, for the AI. */
  description: string;
  group: GroupId | ((input: z.infer<S>) => GroupId);
  input: S;
  /** The line shown in a chat while it runs. */
  status?: (input: z.infer<S>) => string;
  /** The activity-log line, when the work didn't write its own. */
  describe?: (input: z.infer<S>, result: unknown) => string;
  /** What it would do, in words, for Waiting for you (it may look things up). */
  explain?: (input: z.infer<S>) => Promise<string>;
  /** The Job scout gets these. */
  find?: boolean;
  run: (input: z.infer<S>) => Promise<unknown>;
}

function action<S extends z.ZodType>(def: ActionDef<S>): ActionDef {
  return def as unknown as ActionDef;
}

const id = (what: string) => z.string().min(1).max(100).describe(what);
const jobTarget = {
  url: z.string().url().optional().describe("The posting or application URL (matched to a saved or found job)."),
  jobId: z.string().max(100).nullish().describe("A My jobs id."),
  foundId: z.string().max(100).nullish().describe("A found job id."),
};
const strings = (what: string, max = 50) => z.array(z.string().max(200)).max(max).optional().describe(what);
const clip = (s: string | null | undefined, n: number) => (s && s.length > n ? `${s.slice(0, n)}…` : (s ?? ""));
const unwrap = <T>(r: { ok: true; data: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.data;
};

/** Found-job rows trimmed so lists stay readable for a model. */
function slimFound(j: Awaited<ReturnType<typeof listFound>>["rows"][number]) {
  return {
    id: j.id,
    title: j.title,
    company: j.company,
    location: j.location,
    state: j.state,
    workplace: j.workplace,
    jobType: j.jobType,
    level: j.level,
    industry: j.industry,
    roleType: j.roleType,
    visa: j.visa,
    visaNote: j.visaNote,
    h1bApprovals: j.h1bApprovals ?? undefined,
    salary: j.salary,
    score: j.score,
    keywords: j.reasons?.keywords,
    yearsAsked: j.reasons?.experienceYears,
    postedAt: j.postedAt,
    status: j.status,
    source: j.provider,
    url: j.url,
    applyUrl: j.applyUrl,
    savedJobId: j.jobId,
  };
}

function slimRun(r: LinkedInRun) {
  return { id: r.id, state: r.state, message: r.message, result: r.result, error: r.error };
}

const SPECIALISTS = AGENTS.filter((a) => !a.tools && a.id !== "assistant");
const specialistIds = SPECIALISTS.map((a) => a.id) as [AgentId, ...AgentId[]];

async function taskName(id: string): Promise<string> {
  const t = await getTask(id);
  return t ? `${t.title} at ${t.company}` : `application ${id}`;
}

async function jobNames(ids: { foundIds?: string[]; jobIds?: string[] }): Promise<string> {
  const names: string[] = [];
  if (ids.foundIds?.length) for (const r of await getFoundMany(ids.foundIds.slice(0, 5))) names.push(`${r.found.title} at ${r.found.company}`);
  for (const id of (ids.jobIds ?? []).slice(0, 5)) {
    const j = await getJob(id);
    if (j) names.push(`${j.title} at ${j.company.name}`);
  }
  const total = (ids.foundIds?.length ?? 0) + (ids.jobIds?.length ?? 0);
  return names.join("; ") + (total > names.length ? ` and ${total - names.length} more` : "");
}

const show = (v: unknown) => (typeof v === "string" ? `“${clip(v, 60)}”` : JSON.stringify(v));

/** The My jobs id for a job given by jobId, foundId or URL (a found job is saved to My jobs first). */
async function trackedJobId(a: { url?: string; jobId?: string | null; foundId?: string | null }): Promise<string> {
  const match = (await findJobById(a)) ?? (a.url ? await findJobForUrl(a.url) : null);
  let jobId = match?.jobId ?? a.jobId ?? null;
  const foundId = match?.foundId ?? a.foundId ?? null;
  if (!jobId && foundId) jobId = unwrap(await saveFoundJob(foundId)).jobId;
  if (!jobId) throw new Error("Give the job: jobId, foundId, or a URL Job Finder knows.");
  return jobId;
}

async function masterResumeId(): Promise<string | undefined> {
  const row = await db.select({ id: resumes.id }).from(resumes).orderBy(desc(resumes.isMaster), desc(resumes.updatedAt)).limit(1);
  return row[0]?.id;
}

/** Saves a specialist's conversation so you can read it on the AI agents page. */
async function saveThread(agent: AgentId, message: string, reply: string, ctx: ChatContext, model: string | null) {
  const via = currentActor()?.via ?? "an AI";
  const [t] = await db
    .insert(aiThreads)
    .values({ agent, title: `From ${via}: ${message.replace(/\s+/g, " ")}`.slice(0, 80), resumeId: ctx.resumeId ?? null, jobId: ctx.jobId ?? null })
    .returning({ id: aiThreads.id });
  await db.insert(aiMessages).values([
    { threadId: t.id, role: "user", content: message },
    { threadId: t.id, role: "assistant", content: reply, model },
  ]);
  return t.id;
}

async function askSpecialist(agentId: AgentId, message: string, ctx: ChatContext) {
  const agent = getAgent(agentId)!;
  if (agentId === "latex" && ctx.resumeId && !ctx.latex) {
    const r = await db.query.resumes.findFirst({ where: eq(resumes.id, ctx.resumeId), columns: { latex: true } });
    ctx.latex = r?.latex ?? undefined;
  }
  const system = await buildSystemPrompt(agentId, ctx);
  const settings = await getAiSettings();
  let text = "";
  const result = await runChat(
    { system, messages: [{ role: "user", content: message }], maxTokens: agent.maxTokens, feature: agentId, onText: (t) => (text += t) },
    agentId === "apply-writer" ? forApplying(settings) : settings,
  );
  const reply = stripThinking(text);
  const threadId = await saveThread(agentId, message, reply, ctx, result.model);
  return { reply, threadId, model: result.model, stopReason: result.stopReason };
}

// ----------------------------------------------------------------- actions

export const ACTIONS: ActionDef[] = [
  // ------------------------------------------------------------- look up
  action({
    name: "job_finder_status",
    title: "Check Job Finder's status",
    description:
      "Is Job Finder set up: AI, My answers, the browser helper for Auto apply, what waits for the owner, today's AI spending against the daily limit, and what AIs may do (permission per group).",
    group: "read",
    input: z.object({}),
    run: async () => {
      const [ai, profile, waiting, spend, control, auto] = await Promise.all([
        getAiStatus(),
        getApplyProfile(),
        waitingCounts(),
        spendStatus(),
        getControlSettings(),
        getAutoSettings(),
      ]);
      const seen = helperLastSeen();
      return {
        app: "job-finder",
        ai: { ready: ai.ready, label: ai.label, applyModel: ai.settings.applyModel },
        profile: {
          ready: Boolean(profile.firstName && profile.email),
          workAuthorizationSet: profile.authorizedToWork !== "" && profile.needsSponsorshipLater !== "",
        },
        browserHelper: seen ? { running: Date.now() - seen.at < 90_000, lastSeen: new Date(seen.at).toISOString() } : { running: false, lastSeen: null },
        autoApply: { submit: auto.submit, consent: auto.consent, enabled: auto.enabled },
        waitingForOwner: waiting,
        aiSpendToday: { usd: Number(spend.spent.toFixed(4)), dailyCapUsd: spend.cap, capReached: spend.over },
        permissions: Object.fromEntries(GROUPS.map((g) => [g.id, resolveLevel(control, "", g.id)])),
      };
    },
  }),
  action({
    name: "search_found_jobs",
    title: "Search found jobs",
    description:
      "Lists jobs Job Finder found (company boards, Simplify lists, LinkedIn/Handshake grabs, careers pages), best match first. Same filters as the Found jobs page. facets=true adds counts per filter option.",
    group: "read",
    find: true,
    input: z.object({
      q: z.string().max(200).optional().describe("Words in the title, company or description."),
      status: z.string().max(20).optional().describe("new (default), saved, dismissed or all."),
      visa: z
        .string()
        .max(20)
        .optional()
        .describe(
          "One of: friendly (sponsors, open to OPT/CPT, or a known H-1B sponsor that doesn't rule it out), nored (hides 'no sponsorship' and 'US citizens only'), sponsors, h1b (known H-1B sponsors), red (only red flags).",
        ),
      industry: strings(
        "Industry ids: quant, finance, fintech, insurance, consulting, tech, hardware, healthcare, aerospace, government, education, energy, consumer, media, manufacturing, realestate, transport, telecom, legal, nonprofit, other.",
      ),
      role: strings(
        "Role ids: data-science, analytics, quant, finance, consulting, economics, software, product, risk, accounting, operations, marketing, hardware, other.",
      ),
      level: strings("internship, entry or other."),
      type: strings("internship, full_time, part_time, contract."),
      work: strings("remote, hybrid, onsite."),
      state: strings("US state codes like NY, IL, CA, or Remote."),
      posted: z.number().optional().describe("Posted within this many days (1, 3, 7, 14, 30)."),
      source: strings("greenhouse, lever, ashby, workday, smartrecruiters, simplify, linkedin, handshake, web."),
      years: z.number().optional().describe("Hide jobs asking for more than this many years of experience."),
      pay: z.boolean().optional().describe("Only jobs that show pay."),
      min: z.number().optional().describe("Minimum match score (0-100)."),
      sort: z.string().max(20).optional().describe("score (default), newest (found most recently), posted or deadline."),
      limit: z.number().int().min(1).max(200).optional().describe("How many (default 25)."),
      offset: z.number().int().min(0).optional(),
      facets: z.boolean().optional().describe("Include counts per filter option."),
    }),
    status: (a) => `Looking through found jobs${a.q ? ` for “${a.q}”` : ""}`,
    run: async (a) => {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(a)) {
        if (v === undefined || v === null || v === "" || k === "facets") continue;
        if (k === "pay") {
          if (v) p.set("pay", "1");
          continue;
        }
        p.set(k, Array.isArray(v) ? v.join(",") : String(v));
      }
      p.set("limit", String(a.limit ?? 25));
      const filters = filtersFromParams(p);
      const { rows, total } = await listFound(filters);
      const facets = a.facets ? await foundFacets(filters) : undefined;
      return { total, count: rows.length, jobs: rows.map(slimFound), facets };
    },
  }),
  action({
    name: "get_found_job",
    title: "Read a found job",
    description: "Full details of one found job, including the description.",
    group: "read",
    find: true,
    input: z.object({ id: id("Found job id.") }),
    status: () => "Reading a job",
    run: async (a) => {
      const [row] = await getFoundMany([a.id]);
      if (!row) throw new Error("No found job with that id");
      return { ...row.found, description: clip(row.found.description, 12_000), h1bApprovals: row.h1bApprovals, h1bYear: row.h1bYear };
    },
  }),
  action({
    name: "list_my_jobs",
    title: "List My jobs",
    description: "Jobs the owner tracks (My jobs). Filter by status: new, draft, applied, interview, offer, rejected, withdrawn.",
    group: "read",
    input: z.object({ status: strings("Statuses to include.", 10) }),
    status: () => "Checking My jobs",
    run: async (a) => {
      const rows = await listJobs();
      const jobs = a.status?.length ? rows.filter((j) => a.status!.includes(j.status)) : rows;
      return { count: jobs.length, jobs };
    },
  }),
  action({
    name: "get_my_job",
    title: "Read a tracked job",
    description: "One tracked job with notes, resume and description.",
    group: "read",
    input: z.object({ id: id("My jobs id.") }),
    status: () => "Reading a tracked job",
    run: async (a) => {
      const job = await getJob(a.id);
      if (!job) throw new Error("No tracked job with that id");
      return { ...job, description: clip(job.description, 12_000) };
    },
  }),
  action({
    name: "list_searches",
    title: "List saved searches",
    description: "The owner's saved searches (titles, places, levels, schedule) with their latest run.",
    group: "read",
    find: true,
    input: z.object({}),
    status: () => "Checking your saved searches",
    run: async () => ({ searches: await listSearches() }),
  }),
  action({
    name: "list_resumes",
    title: "List resumes",
    description:
      "The owner's resumes: the master and the versions by industry or for one job. Applications use the version for the job's field automatically (tailored for the job, else the industry version, else the uploaded PDF, else the master).",
    group: "read",
    input: z.object({}),
    status: () => "Checking your resumes",
    run: async () => {
      const rows = await db
        .select({ id: resumes.id, title: resumes.title, industry: resumes.industry, isMaster: resumes.isMaster, targetJobId: resumes.targetJobId, updatedAt: resumes.updatedAt })
        .from(resumes)
        .orderBy(desc(resumes.isMaster), asc(resumes.title));
      const file = await getResumeFile();
      return { resumes: rows, uploadedPdf: file ? { name: file.name } : null };
    },
  }),
  action({
    name: "get_resume",
    title: "Read a resume",
    description:
      "One resume as plain text plus its LaTeX source, so you can tailor it yourself and save the result with make_resume_version (latex).",
    group: "read",
    input: z.object({ id: z.string().max(100).optional().describe("Resume id from list_resumes (default the master).") }),
    status: () => "Reading a resume",
    run: async (a) => {
      const id = a.id ?? (await masterResumeId());
      const r = id ? await getResume(id) : null;
      if (!r) throw new Error("No resume with that id");
      return { id: r.id, title: r.title, industry: r.industry, isMaster: r.isMaster, text: resumeToText(r), latex: r.latex };
    },
  }),
  action({
    name: "list_cover_letters",
    title: "List cover letters",
    description: "Recent cover letters (company, role, the job they belong to).",
    group: "read",
    input: z.object({ limit: z.number().int().min(1).max(100).optional() }),
    status: () => "Checking your cover letters",
    run: async (a) => ({
      letters: await db
        .select({ id: coverLetters.id, title: coverLetters.title, company: coverLetters.company, role: coverLetters.role, jobId: coverLetters.jobId, updatedAt: coverLetters.updatedAt })
        .from(coverLetters)
        .orderBy(desc(coverLetters.updatedAt))
        .limit(a.limit ?? 30),
    }),
  }),
  action({
    name: "apply_queue",
    title: "Check the apply queue",
    description: "Saved jobs not applied to yet, with whether a tailored resume, cover letter and written answers are ready.",
    group: "read",
    input: z.object({}),
    status: () => "Checking the apply queue",
    run: async () => {
      const items = await applyQueue();
      return { count: items.length, jobs: items };
    },
  }),
  action({
    name: "get_apply_profile",
    title: "Read My answers",
    description:
      "The owner's standard application answers: contact, education, work authorization (authorized to work, sponsorship now/later, visa status), preferred offices and work arrangement, availability, standard declarations, EEO choices and his own Q&A. Read it before answering any form.",
    group: "read",
    input: z.object({}),
    status: () => "Reading My answers",
    run: () => getApplyProfile(),
  }),
  action({
    name: "answer_application_fields",
    title: "Answer form fields from My answers",
    description:
      "Answers an application form's questions from My answers and the resume. Send every field with its exact label and options; get back the value for each, a confidence (high/medium/low) and a reason. Fields marked needsWriting are open questions: use write_application_answer. Changes nothing.",
    group: "read",
    input: fillSchema.omit({ auto: true }),
    status: () => "Answering form fields from My answers",
    run: (a) => fillAnswers(a),
  }),
  action({
    name: "auto_apply_status",
    title: "Check Auto apply",
    description:
      "Auto apply's applications with their status (queued, running, submitting, held = waiting for the owner's OK, needs_you, submitted, failed), a summary, what only the owner can do (needs), answers to check (checks), whether the browser helper is running, and the settings.",
    group: "read",
    input: z.object({
      batchId: z.string().max(100).optional().describe("Only this batch (from auto_apply)."),
      status: z.string().max(200).optional().describe("Comma-separated statuses, e.g. held,needs_you."),
      limit: z.number().int().min(1).max(200).optional().describe("Default 50."),
    }),
    status: () => "Checking Auto apply",
    run: async (a) => {
      const status = (a.status ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is TaskStatus => (TASK_STATUSES as readonly string[]).includes(s));
      const [list, settings] = await Promise.all([listTasks({ status, batchId: a.batchId, limit: a.limit ?? 50 }), getAutoSettings()]);
      const seen = helperLastSeen();
      return {
        counts: list.counts,
        helper: seen ? { running: Date.now() - seen.at < 90_000, lastSeen: new Date(seen.at).toISOString() } : { running: false, lastSeen: null },
        settings,
        applications: list.tasks.map((t) => ({ id: t.id, title: t.title, company: t.company, status: t.status, summary: t.summary, needs: t.needs, checks: t.checks, url: t.url, updatedAt: t.updatedAt })),
      };
    },
  }),
  action({
    name: "grab_linkedin_status",
    title: "Check a LinkedIn grab",
    description: "Progress and result of a grab_linkedin run that was still running.",
    group: "read",
    find: true,
    input: z.object({ id: id("The run id from grab_linkedin.") }),
    status: () => "Checking the LinkedIn grab",
    run: async (a) => {
      const run = getLinkedInRun(a.id);
      if (!run) throw new Error("No such run (runs are kept for six hours)");
      return slimRun(run);
    },
  }),
  action({
    name: "list_waiting",
    title: "List what waits for the owner",
    description:
      "What waits for the owner: requests from AIs that need his OK (with their results once he decided) and Auto apply applications held for his OK or needing him.",
    group: "read",
    input: z.object({}),
    status: () => "Checking what waits for you",
    run: async () => {
      const [requests, decided, tasks] = await Promise.all([
        listRequests({ status: ["waiting"] }),
        listRequests({ status: ["done", "failed", "declined"], limit: 20 }),
        listTasks({ status: ["held", "needs_you"], limit: 50 }),
      ]);
      const slim = (r: (typeof requests)[number]) => ({ id: r.id, action: r.action, title: r.title, by: ACTOR_LABELS[r.actor], via: r.via, status: r.status, result: r.result, error: r.error, createdAt: r.createdAt, decidedAt: r.decidedAt });
      return {
        waiting: requests.map(slim),
        recentlyDecided: decided.map(slim),
        applications: tasks.tasks.map((t) => ({ id: t.id, title: t.title, company: t.company, status: t.status, summary: t.summary, needs: t.needs, checks: t.checks })),
      };
    },
  }),
  action({
    name: "list_activity",
    title: "Read the activity log",
    description: "Recent activity: who (owner, AI in Job Finder, outside AI, browser helper, schedule) did what, when, and what it cost.",
    group: "read",
    input: z.object({
      limit: z.number().int().min(1).max(200).optional().describe("Default 30."),
      actor: z.enum(["you", "assistant", "outside", "extension", "scheduler"]).optional(),
    }),
    status: () => "Reading the activity log",
    run: async (a) => {
      const rows = await listActivity({ limit: a.limit ?? 30, actor: a.actor as Actor | undefined });
      return { activity: rows.map((r) => ({ at: r.createdAt, by: ACTOR_LABELS[r.actor], via: r.via, what: r.title, status: r.status, costUsd: Number(r.costUsd.toFixed(4)) })) };
    },
  }),

  // ---------------------------------------------------------------- find
  action({
    name: "grab_linkedin",
    title: "Grab jobs from LinkedIn",
    description:
      "Reads a LinkedIn job search and adds every job to Found jobs: pass a search URL (searchUrl), or keywords + location. Job Finder reads LinkedIn's public job pages itself, one at a time with a pause, skips jobs it already has and stops if LinkedIn asks it to slow down. No LinkedIn login. About a minute per page of 25; 1 to 3 pages is plenty. Waits up to waitSeconds, then returns the run; if it's still running, check with grab_linkedin_status.",
    group: "find",
    find: true,
    input: z
      .object({
        searchUrl: z.string().url().max(4000).optional().describe("A LinkedIn job search URL from the address bar."),
        keywords: z.string().trim().max(200).optional().describe("Search words, when there's no searchUrl."),
        location: z.string().trim().max(200).optional().describe("City, state or country (default United States)."),
        postedDays: z.number().positive().max(60).optional().describe("Only jobs posted in the last N days."),
        remote: z.boolean().optional().describe("Remote jobs only."),
        ids: z.array(z.string().regex(/^\d{6,}$/)).max(LINKEDIN_LIMITS.jobs).optional().describe("LinkedIn job ids to read."),
        pages: z.number().int().min(1).max(LINKEDIN_LIMITS.pages).optional().describe("Result pages of 25 (default 1)."),
        save: z.boolean().optional().describe("Also save them to My jobs."),
        waitSeconds: z.number().min(0).max(240).optional().describe("How long to wait for the result (default 150)."),
      })
      .refine((b) => b.searchUrl || b.keywords || b.location || b.ids?.length, "Give a searchUrl, keywords or job ids."),
    status: (a) => `Searching LinkedIn: ${a.keywords ?? a.searchUrl ?? "your search"}${a.remote ? ", remote" : a.location ? `, ${a.location}` : ""}`,
    describe: (a, r) => `Grabbed LinkedIn: ${a.keywords ?? "a search"}${a.location ? `, ${a.location}` : ""}. ${(r as { message?: string })?.message ?? ""}`,
    run: async ({ waitSeconds, ...options }) => {
      const run = startLinkedInRun({ ...options, by: "agent" });
      await waitForRun(run, (waitSeconds ?? 150) * 1000);
      return slimRun(run);
    },
  }),
  action({
    name: "send_grabbed_jobs",
    title: "Add jobs read from a website",
    description:
      "Adds jobs you read from a website (LinkedIn, Handshake, Indeed, a company careers page) to Found jobs. Job Finder scores them against the owner's searches, classifies industry and visa, dedupes, and learns company boards from applyUrl. Up to 200 per call.",
    group: "find",
    input: grabSchema.omit({ by: true }),
    status: (a) => `Adding ${a.jobs.length} jobs`,
    describe: (a) => `Sent ${a.jobs.length} jobs from ${a.source}`,
    run: (a) => saveGrabbed({ ...a, by: "agent" }),
  }),
  action({
    name: "grab_page",
    title: "Read a careers page",
    description:
      "Gives Job Finder a careers page: it reads JSON-LD job data, learns Greenhouse/Lever/Ashby/Workday/SmartRecruiters boards linked from it (scanned on every later search), and can ask the AI to list openings when nothing else works. Pass html or text and links when you have them; with only a url, Job Finder fetches it.",
    group: "find",
    find: true,
    input: pageSchema.extend({ save: z.boolean().optional().describe("Also save the jobs to My jobs.") }),
    status: (a) => `Reading ${a.url}`,
    describe: (a, r) => `Read the careers page ${a.url} (${(r as { jobsFound?: number })?.jobsFound ?? 0} jobs)`,
    run: async ({ save, ...input }) => {
      const page = await grabPage(input);
      const saved = page.jobs.length ? await saveGrabbed({ source: "web", pageUrl: input.url, by: "agent", save: Boolean(save), jobs: page.jobs.slice(0, 200) }) : null;
      return {
        jobsFound: page.jobs.length,
        added: saved?.added ?? 0,
        updated: saved?.updated ?? 0,
        boards: page.boards,
        boardsAdded: page.boardsAdded,
        usedAi: page.usedAi,
        aiError: page.aiError,
      };
    },
  }),
  action({
    name: "find_company_boards",
    title: "Look up a company's job board",
    description: "Finds a company's public job board (Greenhouse, Lever, Ashby, Workday, SmartRecruiters) from its name or careers URL. Check the returned name is really that company.",
    group: "find",
    find: true,
    input: z.object({ q: z.string().trim().min(1).max(500).describe("Company name or careers URL.") }),
    status: (a) => `Looking for ${a.q}'s job board`,
    describe: (a) => `Looked up ${a.q}'s job board`,
    run: async (a) => ({ boards: (await findBoards(a.q)).slice(0, 8) }),
  }),
  action({
    name: "add_company_board",
    title: "Follow a company's job board",
    description: "Adds a company job board so every search run scans it. Use a board from find_company_boards.",
    group: "find",
    find: true,
    input: z.object({
      provider: z.enum(PROVIDERS as unknown as [Provider, ...Provider[]]).describe("greenhouse, lever, ashby, workday or smartrecruiters."),
      token: z.string().min(1).max(200).describe("The board token, e.g. 'stripe' for boards.greenhouse.io/stripe."),
      name: z.string().max(200).optional().describe("Company name."),
      host: z.string().max(200).optional().describe("Workday host, e.g. acme.wd5.myworkdayjobs.com."),
      site: z.string().max(200).optional().describe("Workday site name."),
    }),
    status: (a) => `Adding ${a.name ?? a.token}'s job board`,
    run: async (a) => {
      const board = await verifyBoard({ provider: a.provider, token: a.token, name: a.name, host: a.host, site: a.site });
      if (!board) throw new Error("That board doesn't exist");
      if (a.name?.trim()) board.name = a.name.trim();
      unwrap(await addCompanyBoard(board));
      return { added: board.name, provider: board.provider, jobs: board.jobCount };
    },
  }),
  action({
    name: "run_search",
    title: "Run a saved search",
    description: "Starts a saved search in the background (thousands of company boards plus LinkedIn and Simplify). New jobs land in Found jobs over several minutes.",
    group: "find",
    find: true,
    input: z.object({ id: id("Search id from list_searches.") }),
    status: () => "Starting a saved search",
    run: async (a) => unwrap(await runSearch(a.id)),
  }),
  action({
    name: "save_found_job",
    title: "Save a found job to My jobs",
    description: "Saves a found job to My jobs (status New) so it shows in the Apply queue.",
    group: "find",
    find: true,
    input: z.object({ id: id("Found job id.") }),
    explain: async (a) => `Save to My jobs: ${await jobNames({ foundIds: [a.id] })}`,
    status: () => "Saving a job to My jobs",
    run: async (a) => unwrap(await saveFoundJob(a.id)),
  }),
  action({
    name: "dismiss_found_job",
    title: "Hide a found job",
    description: "Hides found jobs (status dismissed). restore=true brings them back.",
    group: "find",
    find: true,
    input: z.object({
      id: z.string().max(100).optional().describe("Found job id."),
      ids: z.array(z.string().max(100)).max(200).optional().describe("Several found job ids."),
      restore: z.boolean().optional(),
    }),
    explain: async (a) => `${a.restore ? "Bring back" : "Hide"}: ${await jobNames({ foundIds: [...(a.ids ?? []), ...(a.id ? [a.id] : [])] })}`,
    status: (a) => (a.restore ? "Bringing a job back" : "Hiding a job"),
    run: async (a) => {
      const ids = [...(a.ids ?? []), ...(a.id ? [a.id] : [])];
      if (!ids.length) throw new Error("Give id or ids");
      unwrap(await setFoundStatus(ids, a.restore ? "new" : "dismissed"));
      return { updated: ids.length, status: a.restore ? "new" : "dismissed" };
    },
  }),

  // ---------------------------------------------------------- specialists
  action({
    name: "ask_agent",
    title: "Ask a specialist agent",
    description: `Asks one of Job Finder's specialist agents and returns its reply. They read the owner's resume, notes and the job you point at, and only write text (nothing is changed). The conversation is saved on the AI agents page. Agents: ${SPECIALISTS.map((a) => `${a.id} (${a.name}: ${a.description})`).join("; ")}.`,
    group: "agents",
    input: z.object({
      agent: z.enum(specialistIds).describe("Which specialist."),
      message: z.string().trim().min(1).max(20_000).describe("What to ask, as you would ask a person."),
      jobId: z.string().max(100).optional().describe("A My jobs id the question is about."),
      foundId: z.string().max(100).optional().describe("A found job id the question is about."),
      resumeId: z.string().max(100).optional().describe("Which resume to read (default the master)."),
      industry: z.string().max(200).optional().describe("Target industry, for the resume tailor or LaTeX editor."),
      jobIds: z.array(z.string().max(100)).max(8).optional().describe("Tracked jobs to compare (compare agent)."),
      foundIds: z.array(z.string().max(100)).max(8).optional().describe("Found jobs to compare (compare agent)."),
      jobDescription: z.string().max(40_000).optional().describe("A pasted job description, when the job isn't in Job Finder."),
    }),
    status: (a) => `Asking the ${getAgent(a.agent)?.name ?? a.agent}`,
    describe: (a) => `Asked the ${getAgent(a.agent)?.name ?? a.agent}: “${clip(a.message.replace(/\s+/g, " "), 90)}”`,
    run: async ({ agent, message, ...ctx }) => {
      const r = await askSpecialist(agent, message, { ...ctx });
      return { agent: getAgent(agent)?.name, reply: r.reply, threadId: r.threadId, cutOff: r.stopReason === "max_tokens" };
    },
  }),

  // --------------------------------------------------------------- write
  action({
    name: "make_resume_version",
    title: "Make a resume version for an industry",
    description:
      "Copies the master resume (or fromId) as a new version for an industry, e.g. 'Data engineering'. Give latex (a complete document you tailored yourself, e.g. from get_resume) to save that, with no AI cost in Job Finder; otherwise, with tailor (default true), Job Finder's LaTeX editor rewrites it (uses the owner's API credits). Either way it's kept only if it compiles. Applications to jobs in that field then use it automatically.",
    group: "write",
    input: z.object({
      industry: z.string().trim().min(1).max(120).describe("The field, e.g. Data engineering, Quant research, Consulting."),
      title: z.string().max(150).optional().describe("Name of the version (default 'Resume – <industry>')."),
      fromId: z.string().max(100).optional().describe("Resume to copy (default the master)."),
      jobId: z.string().max(100).optional().describe("A My jobs id to aim it at."),
      foundId: z.string().max(100).optional().describe("A found job id to aim it at."),
      tailor: z.boolean().optional().describe("Let the LaTeX editor rewrite it for the field (default true)."),
      instructions: z.string().max(3000).optional().describe("Anything the LaTeX editor should do or keep."),
      latex: z.string().max(500_000).optional().describe("Your own tailored LaTeX, the complete document (\\documentclass … \\end{document})."),
    }),
    explain: async (a) => `Make a ${a.industry} resume version${a.tailor === false ? "" : " and let the LaTeX editor tailor it"}`,
    status: (a) => `Making a ${a.industry} resume version`,
    run: async (a) => {
      const fromId = a.fromId ?? (await masterResumeId());
      if (!fromId) throw new Error("There's no resume yet. Add one on Profile & resumes first.");
      const title = a.title?.trim() || `Resume – ${a.industry}`;
      if (a.latex !== undefined && !/\\documentclass[\s\S]*\\end\{document\}/.test(a.latex)) throw new Error("latex must be a complete document, from \\documentclass to \\end{document}.");
      if (a.latex) {
        const check = await compileLatex(a.latex);
        if (!check.ok && !check.notInstalled) throw new Error(`That LaTeX doesn't compile: ${clip(check.error, 300)}`);
      }
      const { id: resumeId } = unwrap(await createIndustryVersion({ fromId, industry: a.industry, title, targetJobId: a.jobId ?? "" }));
      if (a.latex) {
        unwrap(await saveResumeLatex(resumeId, a.latex));
        await noteActivity({ action: "make_resume_version", title: `Saved the tailored LaTeX for “${title}”`, detail: { resumeId } });
        return { resumeId, title, industry: a.industry, tailored: true, by: "you (the caller)" };
      }
      if (a.tailor === false) return { resumeId, title, industry: a.industry, tailored: false };
      const ask = `Make this the ${a.industry} version of my resume${a.jobId || a.foundId ? ", aimed at the target job below" : ""}. ${a.instructions ?? ""} Reply with the complete updated document.`;
      const r = await askSpecialist("latex", ask.trim(), { resumeId, jobId: a.jobId, foundId: a.foundId, industry: a.industry });
      const tex = extractLatex(r.reply);
      const notes = clip(r.reply.split("```")[0].trim(), 600);
      if (!tex) return { resumeId, title, industry: a.industry, tailored: false, note: "The LaTeX editor didn't send a full document, so the version is a copy of your resume for now.", notes };
      const compiled = await compileLatex(tex);
      if (!compiled.ok && !compiled.notInstalled)
        return { resumeId, title, industry: a.industry, tailored: false, note: `The rewritten LaTeX didn't compile (${clip(compiled.error, 200)}), so the version stays a copy. Fix it in the LaTeX studio.`, notes };
      unwrap(await saveResumeLatex(resumeId, tex));
      await noteActivity({ action: "make_resume_version", title: `Tailored “${title}” for ${a.industry} with the LaTeX editor`, detail: { resumeId } });
      return { resumeId, title, industry: a.industry, tailored: true, compiled: compiled.ok, notes };
    },
  }),
  action({
    name: "write_cover_letter",
    title: "Write a cover letter",
    description:
      "The job's cover letter, or a new one from the Cover letter writer (the owner's voice rules, his resume version for the job's field and the job description). Saved on the Cover letters page; a found job is saved to My jobs first. Returns { id, jobId, content, written }.",
    group: "write",
    input: z.object(jobTarget),
    explain: async (a) => `Write a cover letter for ${(await jobNames({ foundIds: a.foundId ? [a.foundId] : [], jobIds: a.jobId ? [a.jobId] : [] })) || a.url || "a job"}`,
    status: () => "Writing a cover letter",
    describe: (_a, r) => ((r as { written?: boolean })?.written ? "Wrote a cover letter" : "Found the job's cover letter"),
    run: async (a) => {
      const match = (await findJobById(a)) ?? (a.url ? await findJobForUrl(a.url) : null);
      const r = await letterForApplication({ jobId: match?.jobId ?? a.jobId, foundId: match?.foundId ?? a.foundId }, { write: true });
      if ("error" in r) throw new Error(r.error);
      return r;
    },
  }),
  action({
    name: "write_application_answer",
    title: "Write an answer to an application question",
    description:
      "Drafts an answer to an open application question (why this company, a project you're proud of…) in the owner's voice, from the resume and the job, with the application model. Remembered for that job.",
    group: "write",
    input: writeAnswerSchema,
    status: (a) => `Writing an answer to “${clip(a.question, 60)}”`,
    describe: (a) => `Wrote an answer to “${clip(a.question, 90)}”`,
    run: (a) => writeApplicationAnswer(a),
  }),

  action({
    name: "save_cover_letter",
    title: "Save a cover letter you wrote",
    description:
      "Saves a cover letter you wrote yourself for a job (no AI cost in Job Finder). It shows on the Cover letters page, gets a PDF (get_cover_letter_pdf), and Auto apply attaches it when the form asks for one. Plain text, the letter only, in the owner's voice; show it to him before relying on it.",
    group: "write",
    input: z.object({
      ...jobTarget,
      content: z.string().trim().min(200).max(20_000).describe("The letter, plain text."),
      notes: z.string().max(4000).optional().describe("Anything the owner should know (what you emphasized, what to check)."),
    }),
    explain: async (a) => `Save a cover letter for ${(await jobNames({ foundIds: a.foundId ? [a.foundId] : [], jobIds: a.jobId ? [a.jobId] : [] })) || a.url || "a job"}`,
    status: () => "Saving a cover letter",
    run: async (a) => {
      const match = (await findJobById(a)) ?? (a.url ? await findJobForUrl(a.url) : null);
      const r = await saveLetterForApplication({ jobId: match?.jobId ?? a.jobId, foundId: match?.foundId ?? a.foundId }, a.content, a.notes);
      if ("error" in r) throw new Error(r.error);
      return { id: r.id, jobId: r.jobId };
    },
  }),
  action({
    name: "save_application_answer",
    title: "Save an answer you wrote",
    description:
      "Saves your answer to one application question for a job (no AI cost in Job Finder), so Auto apply and Fill use it when the form asks that question. Use the question's wording from the form. Answers saved by an AI are held for the owner to read before the application is sent.",
    group: "write",
    input: z.object({
      ...jobTarget,
      question: z.string().trim().min(3).max(1000).describe("The question as the form words it."),
      answer: z.string().trim().min(1).max(8000),
    }),
    status: (a) => `Saving an answer to “${clip(a.question, 60)}”`,
    describe: (a) => `Saved an answer to “${clip(a.question, 90)}”`,
    run: async (a) => {
      const jobId = await trackedJobId(a);
      await rememberAnswer(jobId, a.question, a.answer, "ai");
      return { jobId, saved: true };
    },
  }),

  // --------------------------------------------------------------- apply
  action({
    name: "auto_apply",
    title: "Queue applications for Auto apply",
    description:
      "Queues applications for Auto apply. The Job Finder Helper extension in the owner's Chrome opens each form in a background tab, fills it from My answers, attaches the right resume (and a cover letter when required), and submits it or holds it by the owner's Auto apply settings. One call per batch; then check with auto_apply_status. Jobs already applied to, already queued, or with only a LinkedIn/Handshake link are skipped with a reason.",
    group: "queue",
    input: z
      .object({
        foundIds: z.array(z.string().max(100)).max(100).optional().describe("Found job ids."),
        jobIds: z.array(z.string().max(100)).max(100).optional().describe("My jobs ids."),
        urls: z.array(z.string().url()).max(100).optional().describe("Application page URLs."),
      })
      .refine((b) => (b.jobIds?.length ?? 0) + (b.foundIds?.length ?? 0) + (b.urls?.length ?? 0) > 0, "Give foundIds, jobIds or urls"),
    explain: async (a) => `Queue for Auto apply: ${[await jobNames(a), ...(a.urls ?? []).slice(0, 3)].filter(Boolean).join("; ")}`,
    status: (a) => `Queuing ${(a.foundIds?.length ?? 0) + (a.jobIds?.length ?? 0) + (a.urls?.length ?? 0)} applications for Auto apply`,
    run: async (a) => {
      const r = await enqueueApplications({ ...a, by: "agent" });
      const seen = helperLastSeen();
      const running = Boolean(seen && Date.now() - seen.at < 90_000);
      return { ...r, helperRunning: running, note: running ? "The browser helper starts within half a minute." : "The browser helper hasn't checked in: the owner needs Chrome open with the Job Finder Helper extension." };
    },
  }),
  action({
    name: "auto_apply_action",
    title: "Act on an Auto apply application",
    description:
      "One Auto apply application: retry, cancel (a queued one), remove (from the list), submitted (the owner sent it himself; marks the job applied) or approve (submit a held one; this is the owner's call and usually waits for his OK).",
    group: (a) => (a.action === "approve" ? "approve" : a.action === "submitted" ? "track" : "queue"),
    explain: async (a) =>
      `${{ approve: "Submit the held application", retry: "Try again", cancel: "Cancel", remove: "Remove from Auto apply", submitted: "Mark as submitted" }[a.action]}: ${await taskName(a.id)}`,
    input: z.object({
      id: id("The application id (from auto_apply_status)."),
      action: z.enum(["approve", "retry", "cancel", "remove", "submitted"]),
    }),
    status: (a) => `Auto apply: ${a.action}`,
    run: async (a) => {
      const task = await actOnTask(a.id, a.action);
      if (!task) throw new Error("No application with that id");
      return { id: task.id, title: task.title, company: task.company, status: task.status, summary: task.summary };
    },
  }),
  action({
    name: "approve_application",
    title: "Approve a held application",
    description: "Tells Auto apply to submit an application it held for the owner's OK. This is the owner's call: by default it waits in his Waiting for you list.",
    group: "approve",
    input: z.object({ id: id("The application id (from auto_apply_status or list_waiting).") }),
    explain: async (a) => `Submit the held application: ${await taskName(a.id)}`,
    status: () => "Approving an application",
    run: async (a) => {
      const task = await actOnTask(a.id, "approve");
      if (!task) throw new Error("No application with that id");
      return { id: task.id, title: task.title, company: task.company, status: task.status, summary: task.summary };
    },
  }),

  // --------------------------------------------------------------- track
  action({
    name: "update_my_job",
    title: "Update a tracked job",
    description: "Changes a tracked job's status and/or adds a note.",
    group: "track",
    input: z.object({
      id: id("My jobs id."),
      status: z.enum(JOB_STATUS_VALUES).optional().describe(JOB_STATUS_VALUES.join(", ")),
      note: z.string().trim().max(5000).optional().describe("A note to add."),
    }),
    explain: async (a) => `${a.status ? `Move to ${a.status}` : "Add a note to"}: ${await jobNames({ jobIds: [a.id] })}${a.note ? ` (note: “${clip(a.note, 80)}”)` : ""}`,
    status: () => "Updating a tracked job",
    run: async (a) => {
      if (a.status) unwrap(await updateJobStatus(a.id, a.status));
      if (a.note) unwrap(await addNote(a.id, a.note));
      const job = await getJob(a.id);
      return job ? { id: job.id, title: job.title, company: job.company.name, status: job.status } : null;
    },
  }),
  action({
    name: "mark_applied",
    title: "Mark a job applied",
    description: "Marks a job as applied (today) after the owner submitted the application. Saves a found job to My jobs first.",
    group: "track",
    input: z.object({ url: z.string().url().optional().describe("The posting or application URL."), jobId: z.string().max(100).optional().describe("A My jobs id.") }),
    status: () => "Marking a job applied",
    run: async (a) => {
      if (a.jobId) {
        unwrap(await updateJobStatus(a.jobId, "applied"));
        return { jobId: a.jobId };
      }
      if (!a.url) throw new Error("Give url or jobId");
      const r = await markAppliedByUrl(a.url);
      if ("error" in r) throw new Error(r.error);
      return r;
    },
  }),

  // ------------------------------------------------------------ settings
  action({
    name: "update_apply_profile",
    title: "Change My answers",
    description:
      "Changes fields of My answers (the same names get_apply_profile returns), e.g. {\"phone\": \"…\", \"startDate\": \"2027-06\"}. Only the fields you give change. Use only facts the owner told you.",
    group: "settings",
    input: z.object({ changes: z.record(z.string(), z.unknown()).describe("Fields to change, as in get_apply_profile.") }),
    explain: async (a) => `Change My answers: ${Object.entries(a.changes).slice(0, 6).map(([k, v]) => `${k} → ${show(v)}`).join(", ")}`,
    status: () => "Updating My answers",
    run: (a) => saveApplyProfile(a.changes),
  }),
  action({
    name: "update_auto_apply_settings",
    title: "Change Auto apply settings",
    description:
      "Changes Auto apply settings: submit (sure = only when every answer came from My answers / review = hold everything / fill = fill only / always), consent (tick consent and certify boxes), essays, aiPick, resume (match / file / generated), coverLetters (required / always / never), pauseSeconds, keepTabs, enabled. Changing submit or consent counts as approving submissions, so it usually waits for the owner.",
    group: (a) => (a.submit !== undefined || a.consent !== undefined ? "approve" : "settings"),
    // No defaults here: only the settings given change.
    input: z.object({
      submit: z.enum(SUBMIT_MODES).optional(),
      consent: z.boolean().optional(),
      essays: z.enum(["required", "all", "none"]).optional(),
      aiPick: z.boolean().optional(),
      resume: z.enum(["match", "file", "generated"]).optional(),
      coverLetters: z.enum(["required", "always", "never"]).optional(),
      pauseSeconds: z.number().int().min(5).max(600).optional(),
      keepTabs: z.boolean().optional(),
      enabled: z.boolean().optional(),
    }),
    explain: async (a) =>
      `Change Auto apply settings: ${Object.entries(a).filter(([, v]) => v !== undefined).map(([k, v]) => `${k} → ${String(v)}`).join(", ")}`,
    status: () => "Changing Auto apply settings",
    run: (a) => saveAutoSettings(Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined))),
  }),
  action({
    name: "create_search",
    title: "Create a saved search",
    description: "Creates a saved search that scans company boards, Simplify lists and LinkedIn for these titles and places (daily at scheduleHour).",
    group: "settings",
    input: z.object({
      name: z.string().trim().min(1).max(120),
      titles: z.array(z.string().max(200)).min(1).max(40).describe("Job titles to look for."),
      locations: strings("Places, e.g. Chicago, IL or United States.", 30),
      keywords: strings("Keywords that raise the match score.", 80),
      levels: z.array(z.enum(["internship", "entry", "any"])).optional(),
      sources: z.array(z.enum(SEARCH_SOURCES)).optional(),
      includeRemote: z.boolean().optional(),
      minScore: z.number().int().min(0).max(100).optional(),
      scheduleHour: z.number().int().min(-1).max(23).optional().describe("Hour of the day to run it (-1 = never on its own)."),
    }),
    status: (a) => `Creating the search “${a.name}”`,
    run: async (a) => {
      const base = newSearchDefaults((await masterResumeId()) ?? "");
      const values = {
        ...base,
        name: a.name,
        titles: a.titles.join("\n"),
        locations: a.locations?.length ? a.locations.join("\n") : base.locations,
        keywords: a.keywords?.length ? a.keywords.join(", ") : base.keywords,
        levels: a.levels ?? base.levels,
        sources: a.sources ?? base.sources,
        includeRemote: a.includeRemote ?? base.includeRemote,
        minScore: a.minScore ?? base.minScore,
        scheduleHour: a.scheduleHour ?? base.scheduleHour,
      };
      return unwrap(await createSearch(values));
    },
  }),
];

const BY_NAME = new Map(ACTIONS.map((a) => [a.name, a]));

export function getAction(name: string): ActionDef | undefined {
  return BY_NAME.get(name);
}

export function groupOf(def: ActionDef, input: unknown): GroupId {
  return typeof def.group === "function" ? def.group(input as never) : def.group;
}

/** An action's input as JSON Schema, for tool definitions. */
export function inputJsonSchema(def: ActionDef): Json {
  const schema = z.toJSONSchema(def.input, { io: "input", unrepresentable: "any" }) as Json;
  delete schema.$schema;
  if (schema.type !== "object") return { type: "object", properties: {} };
  return schema;
}

/** The fixed group of an action, for listing (actions that pick their group by input show their usual one). */
export function listedGroup(def: ActionDef): GroupId {
  if (typeof def.group !== "function") return def.group;
  return def.name === "auto_apply_action" ? "queue" : "settings";
}

export type { Json };
