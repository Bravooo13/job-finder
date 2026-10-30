import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date());

// ---------------------------------------------------------------- companies

export const companies = sqliteTable(
  "companies",
  {
    id: id(),
    name: text("name").notNull(),
    website: text("website"),
    careersUrl: text("careers_url"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("companies_name_idx").on(sql`lower(${t.name})`)],
);

// --------------------------------------------------------------------- jobs

export const jobs = sqliteTable(
  "jobs",
  {
    id: id(),
    title: text("title").notNull(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    location: text("location"),
    workplace: text("workplace"), // onsite | hybrid | remote
    jobType: text("job_type"), // full_time | part_time | contract | internship | temporary
    status: text("status").notNull().default("new"),
    source: text("source"),
    url: text("url"),
    description: text("description"),
    salary: text("salary"),
    skills: text("skills", { mode: "json" }).$type<string[]>(),
    matchScore: integer("match_score"),
    resumeId: text("resume_id").references(() => resumes.id, {
      onDelete: "set null",
    }),
    postedAt: integer("posted_at", { mode: "timestamp_ms" }),
    dateApplied: integer("date_applied", { mode: "timestamp_ms" }),
    dueDate: integer("due_date", { mode: "timestamp_ms" }),
    // Where the job is, for the map. Filled from `location` when saved.
    lat: real("lat"),
    lng: real("lng"),
    place: text("place"),
    remote: integer("remote", { mode: "boolean" }).notNull().default(false),
    industry: text("industry"),
    roleType: text("role_type"),
    visa: text("visa"),
    visaNote: text("visa_note"),
    // The company's own application page, when the posting came from a job site.
    applyUrl: text("apply_url"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("jobs_status_idx").on(t.status),
    index("jobs_company_idx").on(t.companyId),
    index("jobs_created_idx").on(t.createdAt),
    index("jobs_url_idx").on(t.url),
  ],
);

export const jobNotes = sqliteTable("job_notes", {
  id: id(),
  jobId: text("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ------------------------------------------------------------------ resumes

// A resume is a full, self-contained profile. One is marked as the master
// (your complete profile); tailored resumes are copies made from it and can
// point at the job they were tailored for.
export const resumes = sqliteTable("resumes", {
  id: id(),
  title: text("title").notNull(),
  isMaster: integer("is_master", { mode: "boolean" }).notNull().default(false),
  basedOnId: text("based_on_id"),
  targetJobId: text("target_job_id"),
  fullName: text("full_name"),
  headline: text("headline"),
  email: text("email"),
  phone: text("phone"),
  location: text("location"),
  website: text("website"),
  linkedin: text("linkedin"),
  github: text("github"),
  summary: text("summary"),
  // Full text of an imported resume file, used as extra matching keywords.
  sourceText: text("source_text"),
  // Field this version is aimed at, like "Quant & trading" (optional).
  industry: text("industry"),
  // LaTeX source for this version; compiled to PDF with Tectonic.
  latex: text("latex"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// Experience, education, projects, certifications, volunteering and awards
// share one shape; `section` says which list an entry belongs to.
export const resumeEntries = sqliteTable(
  "resume_entries",
  {
    id: id(),
    resumeId: text("resume_id")
      .notNull()
      .references(() => resumes.id, { onDelete: "cascade" }),
    section: text("section").notNull(),
    title: text("title").notNull(), // role, degree, project or certificate
    organization: text("organization"), // company, school, issuer
    location: text("location"),
    startDate: text("start_date"), // YYYY-MM
    endDate: text("end_date"), // YYYY-MM
    current: integer("current", { mode: "boolean" }).notNull().default(false),
    url: text("url"),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("resume_entries_resume_idx").on(t.resumeId, t.section)],
);

export const resumeSkillGroups = sqliteTable("resume_skill_groups", {
  id: id(),
  resumeId: text("resume_id")
    .notNull()
    .references(() => resumes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  skills: text("skills", { mode: "json" }).$type<string[]>().notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------- searches

// A saved search runs across company job boards and collects matching jobs.
export const searches = sqliteTable("searches", {
  id: id(),
  name: text("name").notNull(),
  titles: text("titles", { mode: "json" }).$type<string[]>().notNull(),
  keywords: text("keywords", { mode: "json" }).$type<string[]>().notNull(),
  excludeWords: text("exclude_words", { mode: "json" }).$type<string[]>().notNull(),
  locations: text("locations", { mode: "json" }).$type<string[]>().notNull(),
  includeRemote: integer("include_remote", { mode: "boolean" }).notNull().default(true),
  levels: text("levels", { mode: "json" }).$type<string[]>().notNull(), // internship | entry | any
  sources: text("sources", { mode: "json" }).$type<string[]>().notNull(), // greenhouse | lever | ashby | workday
  companyScope: text("company_scope").notNull().default("all"), // all | mine
  resumeId: text("resume_id").references(() => resumes.id, { onDelete: "set null" }),
  minScore: integer("min_score").notNull().default(45),
  scheduleHour: integer("schedule_hour"), // local hour 0-23, null = only when you press Run
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastRunAt: integer("last_run_at", { mode: "timestamp_ms" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const searchRuns = sqliteTable(
  "search_runs",
  {
    id: id(),
    searchId: text("search_id")
      .notNull()
      .references(() => searches.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("running"), // running | done | failed | stopped
    trigger: text("trigger").notNull().default("manual"), // manual | schedule
    boardsTotal: integer("boards_total").notNull().default(0),
    boardsDone: integer("boards_done").notNull().default(0),
    postingsSeen: integer("postings_seen").notNull().default(0),
    matched: integer("matched").notNull().default(0),
    newJobs: integer("new_jobs").notNull().default(0),
    errors: text("errors", { mode: "json" }).$type<{ board: string; error: string }[]>().notNull(),
    message: text("message"),
    startedAt: integer("started_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("search_runs_search_idx").on(t.searchId, t.startedAt)],
);

export interface MatchReasons {
  title?: string; // which target title matched
  level?: string; // "Internship", "Entry level"
  keywords: string[]; // your skills the posting mentions
  location?: string; // "Chicago area", "Remote (US)", "United States"
  experienceYears?: number; // "3+ years" found in the posting
}

// Jobs found by searches, waiting for you to save or dismiss them.
export const discoveredJobs = sqliteTable(
  "discovered_jobs",
  {
    id: id(),
    searchId: text("search_id").references(() => searches.id, { onDelete: "set null" }),
    url: text("url").notNull(),
    provider: text("provider").notNull(),
    boardToken: text("board_token").notNull(),
    company: text("company").notNull(),
    title: text("title").notNull(),
    location: text("location"),
    workplace: text("workplace"),
    jobType: text("job_type"),
    salary: text("salary"),
    description: text("description"),
    postedAt: integer("posted_at", { mode: "timestamp_ms" }),
    score: integer("score").notNull().default(0),
    reasons: text("reasons", { mode: "json" }).$type<MatchReasons>().notNull(),
    flags: text("flags", { mode: "json" }).$type<string[]>().notNull(), // no_sponsorship | citizenship | senior
    status: text("status").notNull().default("new"), // new | saved | dismissed
    jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
    lat: real("lat"),
    lng: real("lng"),
    place: text("place"),
    remote: integer("remote", { mode: "boolean" }).notNull().default(false),
    // Filled by src/lib/classify for the filters.
    industry: text("industry"),
    roleType: text("role_type"),
    visa: text("visa"), // sponsors | opt_cpt | unknown | no_sponsorship | citizens_only
    visaNote: text("visa_note"),
    level: text("level"), // internship | entry | senior | other
    state: text("state"), // US state code, "Remote" or a country
    companyKey: text("company_key"),
    classVersion: integer("class_version").notNull().default(0),
    // From job sites you browse (LinkedIn, Handshake): their industry and the company's own apply link.
    sourceIndustry: text("source_industry"),
    applyUrl: text("apply_url"),
    grabbed: integer("grabbed", { mode: "boolean" }).notNull().default(false),
    firstSeenAt: integer("first_seen_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("discovered_url_idx").on(t.url),
    index("discovered_status_idx").on(t.status, t.score),
    index("discovered_search_idx").on(t.searchId),
    index("discovered_company_key_idx").on(t.companyKey),
  ],
);

// Company job boards you added yourself (the built-in directory lives in
// src/lib/boards/directory/*.json).
export const companyBoards = sqliteTable(
  "company_boards",
  {
    id: id(),
    provider: text("provider").notNull(), // greenhouse | lever | ashby | workday
    token: text("token").notNull(), // board slug, or Workday tenant
    name: text("name").notNull(),
    host: text("host"), // Lever "eu", or Workday host like acme.wd5.myworkdayjobs.com
    site: text("site").notNull().default(""), // Workday career site name ("" for other boards)
    careersUrl: text("careers_url"),
    jobCount: integer("job_count"),
    // Who added it: you | simplify | linkedin | handshake | web | agent
    origin: text("origin").notNull().default("you"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("company_boards_key_idx").on(t.provider, t.token, t.site)],
);

// Each time jobs are grabbed from a site you browse (extension or agent).
export const grabRuns = sqliteTable("grab_runs", {
  id: id(),
  source: text("source").notNull(), // linkedin | handshake | web | ...
  pageUrl: text("page_url"),
  by: text("by").notNull().default("extension"), // extension | agent | you
  received: integer("received").notNull().default(0),
  added: integer("added").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  boardsLearned: integer("boards_learned").notNull().default(0),
  createdAt: createdAt(),
});

// --------------------------------------------------------------- auto apply

/** One field of an application as Auto apply filled it, for your review. */
export interface ApplyTaskAnswer {
  label: string;
  value: string;
  confidence: "high" | "medium" | "low";
  rule?: string;
  required?: boolean;
}

// One application for Auto apply: the browser helper opens the form, fills it
// from My answers, and submits it or holds it for you.
export const applyTasks = sqliteTable(
  "apply_tasks",
  {
    id: id(),
    batchId: text("batch_id").notNull(),
    jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
    foundId: text("found_id").references(() => discoveredJobs.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    company: text("company").notNull(),
    url: text("url").notNull(), // the application form
    status: text("status")
      .$type<"queued" | "running" | "submitting" | "held" | "needs_you" | "submitted" | "failed" | "canceled">()
      .notNull()
      .default("queued"),
    // You looked at a held application and said submit it.
    approved: integer("approved", { mode: "boolean" }).notNull().default(false),
    summary: text("summary"),
    needs: text("needs", { mode: "json" }).$type<string[]>().notNull(), // what only you can do
    checks: text("checks", { mode: "json" }).$type<string[]>().notNull(), // answers to look at before it's sent
    answers: text("answers", { mode: "json" }).$type<ApplyTaskAnswer[]>().notNull(),
    by: text("by").notNull().default("you"), // you | agent
    attempts: integer("attempts").notNull().default(0),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("apply_tasks_status_idx").on(t.status, t.createdAt), index("apply_tasks_batch_idx").on(t.batchId), index("apply_tasks_job_idx").on(t.jobId)],
);

// ---------------------------------------------------------- AI and letters

// App settings as JSON values (AI provider, agent prompts, notes about you).
// The Claude API key is stored encrypted.
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>().notNull(),
  updatedAt: updatedAt(),
});

export const coverLetters = sqliteTable(
  "cover_letters",
  {
    id: id(),
    title: text("title").notNull(),
    company: text("company"),
    role: text("role"),
    jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
    resumeId: text("resume_id").references(() => resumes.id, { onDelete: "set null" }),
    jobDescription: text("job_description"),
    instructions: text("instructions"), // what you asked it to emphasize
    content: text("content").notNull().default(""),
    notes: text("notes"), // the writer's notes on its choices
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("cover_letters_job_idx").on(t.jobId), index("cover_letters_updated_idx").on(t.updatedAt)],
);

// A conversation with one of the AI agents, optionally about a resume, job or letter.
export const aiThreads = sqliteTable(
  "ai_threads",
  {
    id: id(),
    agent: text("agent").notNull(),
    title: text("title").notNull(),
    resumeId: text("resume_id").references(() => resumes.id, { onDelete: "cascade" }),
    jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
    coverLetterId: text("cover_letter_id").references(() => coverLetters.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("ai_threads_updated_idx").on(t.updatedAt),
    index("ai_threads_resume_idx").on(t.resumeId),
    index("ai_threads_letter_idx").on(t.coverLetterId),
  ],
);

export const aiMessages = sqliteTable(
  "ai_messages",
  {
    id: id(),
    threadId: text("thread_id")
      .notNull()
      .references(() => aiThreads.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant
    content: text("content").notNull(),
    model: text("model"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_messages_thread_idx").on(t.threadId, t.createdAt)],
);

// --------------------------------------------------------------- applying

// Employers that sponsored H-1B visas, from USCIS's H-1B Employer Data Hub.
export const h1bEmployers = sqliteTable("h1b_employers", {
  nameKey: text("name_key").primaryKey(), // companyKey() form
  name: text("name").notNull(),
  fiscalYear: integer("fiscal_year").notNull(),
  initialApprovals: integer("initial_approvals").notNull().default(0),
  totalApprovals: integer("total_approvals").notNull().default(0),
  denials: integer("denials").notNull().default(0),
  naics: text("naics"),
  state: text("state"),
  city: text("city"),
});

// Answers to application questions, saved so they can be reused or reviewed.
export const applyAnswers = sqliteTable(
  "apply_answers",
  {
    id: id(),
    jobId: text("job_id").references(() => jobs.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    source: text("source").notNull().default("ai"), // ai | profile | you
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("apply_answers_job_idx").on(t.jobId)],
);

// ------------------------------------------------------- who did what (control)

/** Who did something: you, an AI inside Job Finder, an outside AI over MCP, the browser helper, or a schedule. */
export type Actor = "you" | "assistant" | "outside" | "extension" | "scheduler";

// Everything that changed something, by whom, with its AI cost.
export const activityLog = sqliteTable(
  "activity_log",
  {
    id: id(),
    actor: text("actor").$type<Actor>().notNull(),
    via: text("via"), // which agent or client: "Job Finder assistant", "claude-code"…
    action: text("action").notNull(), // action name, e.g. save_found_job
    title: text("title").notNull(), // one line for people
    status: text("status").$type<"done" | "error" | "waiting" | "blocked" | "declined">().notNull().default("done"),
    detail: text("detail", { mode: "json" }).$type<Record<string, unknown> | null>(),
    costUsd: real("cost_usd").notNull().default(0),
    requestId: text("request_id"),
    createdAt: createdAt(),
  },
  (t) => [index("activity_log_created_idx").on(t.createdAt), index("activity_log_actor_idx").on(t.actor, t.createdAt)],
);

// Things an AI asked to do that wait for your OK ("Ask me first").
export const actionRequests = sqliteTable(
  "action_requests",
  {
    id: id(),
    actor: text("actor").$type<Actor>().notNull(),
    via: text("via"),
    action: text("action").notNull(),
    title: text("title").notNull(),
    input: text("input", { mode: "json" }).$type<unknown>().notNull(),
    status: text("status").$type<"waiting" | "done" | "failed" | "declined">().notNull().default("waiting"),
    result: text("result", { mode: "json" }).$type<unknown>(),
    error: text("error"),
    decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("action_requests_status_idx").on(t.status, t.createdAt)],
);

// Every AI call: tokens and what it cost, for the daily spend cap.
export const aiUsage = sqliteTable(
  "ai_usage",
  {
    id: id(),
    actor: text("actor").$type<Actor>().notNull(),
    via: text("via"),
    feature: text("feature").notNull(), // agent id or what it was for
    provider: text("provider").notNull(), // claude | ollama
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    webSearches: integer("web_searches").notNull().default(0),
    costUsd: real("cost_usd").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("ai_usage_created_idx").on(t.createdAt)],
);

// ---------------------------------------------------------------- relations

export const companiesRelations = relations(companies, ({ many }) => ({
  jobs: many(jobs),
}));

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  company: one(companies, {
    fields: [jobs.companyId],
    references: [companies.id],
  }),
  resume: one(resumes, { fields: [jobs.resumeId], references: [resumes.id] }),
  notes: many(jobNotes),
}));

export const jobNotesRelations = relations(jobNotes, ({ one }) => ({
  job: one(jobs, { fields: [jobNotes.jobId], references: [jobs.id] }),
}));

export const resumesRelations = relations(resumes, ({ many }) => ({
  entries: many(resumeEntries),
  skillGroups: many(resumeSkillGroups),
}));

export const resumeEntriesRelations = relations(resumeEntries, ({ one }) => ({
  resume: one(resumes, {
    fields: [resumeEntries.resumeId],
    references: [resumes.id],
  }),
}));

export const resumeSkillGroupsRelations = relations(
  resumeSkillGroups,
  ({ one }) => ({
    resume: one(resumes, {
      fields: [resumeSkillGroups.resumeId],
      references: [resumes.id],
    }),
  }),
);

export const searchesRelations = relations(searches, ({ many }) => ({
  runs: many(searchRuns),
}));

export const searchRunsRelations = relations(searchRuns, ({ one }) => ({
  search: one(searches, { fields: [searchRuns.searchId], references: [searches.id] }),
}));

export type Company = typeof companies.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type JobNote = typeof jobNotes.$inferSelect;
export type Resume = typeof resumes.$inferSelect;
export type ResumeEntry = typeof resumeEntries.$inferSelect;
export type ResumeSkillGroup = typeof resumeSkillGroups.$inferSelect;
export type Search = typeof searches.$inferSelect;
export type SearchRun = typeof searchRuns.$inferSelect;
export type DiscoveredJob = typeof discoveredJobs.$inferSelect;
export type CompanyBoard = typeof companyBoards.$inferSelect;
export type CoverLetter = typeof coverLetters.$inferSelect;
export type AiThread = typeof aiThreads.$inferSelect;
export type AiMessage = typeof aiMessages.$inferSelect;
export type H1bEmployer = typeof h1bEmployers.$inferSelect;
export type ApplyAnswer = typeof applyAnswers.$inferSelect;
export type GrabRun = typeof grabRuns.$inferSelect;
export type ActivityEntry = typeof activityLog.$inferSelect;
export type ActionRequest = typeof actionRequests.$inferSelect;
export type AiUsageRow = typeof aiUsage.$inferSelect;
