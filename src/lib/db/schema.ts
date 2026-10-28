import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
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

export type Company = typeof companies.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type JobNote = typeof jobNotes.$inferSelect;
export type Resume = typeof resumes.$inferSelect;
export type ResumeEntry = typeof resumeEntries.$inferSelect;
export type ResumeSkillGroup = typeof resumeSkillGroups.$inferSelect;
