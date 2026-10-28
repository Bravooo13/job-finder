export const APP_NAME = "Job Finder";

export const JOB_STATUSES = [
  { value: "new", label: "New" },
  { value: "draft", label: "Draft" },
  { value: "applied", label: "Applied" },
  { value: "interview", label: "Interview" },
  { value: "offer", label: "Offer" },
  { value: "offer_accepted", label: "Offer Accepted" },
  { value: "offer_declined", label: "Offer Declined" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "expired", label: "Expired" },
  { value: "archived", label: "Archived" },
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number]["value"];

export const JOB_STATUS_VALUES = JOB_STATUSES.map((s) => s.value) as [
  JobStatus,
  ...JobStatus[],
];

/** Statuses that mean an application went out. */
export const APPLIED_STATUSES: JobStatus[] = [
  "applied",
  "interview",
  "offer",
  "offer_accepted",
  "offer_declined",
];

/** Tailwind classes for each status badge, light and dark. */
export const STATUS_STYLES: Record<JobStatus, string> = {
  new: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  applied: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
  interview: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  offer: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  offer_accepted:
    "bg-green-200 text-green-900 dark:bg-green-900 dark:text-green-100",
  offer_declined:
    "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
  rejected: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  withdrawn: "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200",
  expired: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  archived: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};

/** Chart colors per status (hex so the charts can use them directly). */
export const STATUS_COLORS: Record<JobStatus, string> = {
  new: "#0ea5e9",
  draft: "#94a3b8",
  applied: "#6366f1",
  interview: "#f59e0b",
  offer: "#10b981",
  offer_accepted: "#16a34a",
  offer_declined: "#14b8a6",
  rejected: "#f43f5e",
  withdrawn: "#a8a29e",
  expired: "#a1a1aa",
  archived: "#71717a",
};

export const JOB_TYPES = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "internship", label: "Internship" },
  { value: "contract", label: "Contract" },
  { value: "temporary", label: "Temporary" },
] as const;

export const WORKPLACES = [
  { value: "onsite", label: "Onsite" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
] as const;

export const JOB_SOURCES = [
  "LinkedIn",
  "Handshake",
  "Company website",
  "Greenhouse",
  "Lever",
  "Ashby",
  "Workday",
  "Indeed",
  "Referral",
  "Recruiter",
  "Career fair",
  "Other",
];

export const RESUME_SECTIONS = [
  {
    value: "experience",
    label: "Experience",
    titleLabel: "Role",
    orgLabel: "Company",
    hasDates: true,
  },
  {
    value: "education",
    label: "Education",
    titleLabel: "Degree / program",
    orgLabel: "School",
    hasDates: true,
  },
  {
    value: "project",
    label: "Projects",
    titleLabel: "Project name",
    orgLabel: "Context (course, team, company)",
    hasDates: true,
  },
  {
    value: "certification",
    label: "Certifications",
    titleLabel: "Certification",
    orgLabel: "Issuer",
    hasDates: true,
  },
  {
    value: "volunteer",
    label: "Volunteering & leadership",
    titleLabel: "Role",
    orgLabel: "Organization",
    hasDates: true,
  },
  {
    value: "award",
    label: "Awards",
    titleLabel: "Award",
    orgLabel: "Awarded by",
    hasDates: true,
  },
] as const;

export type ResumeSection = (typeof RESUME_SECTIONS)[number]["value"];

export function statusLabel(value: string | null | undefined): string {
  return JOB_STATUSES.find((s) => s.value === value)?.label ?? value ?? "";
}

export function jobTypeLabel(value: string | null | undefined): string {
  return JOB_TYPES.find((t) => t.value === value)?.label ?? value ?? "";
}

export function workplaceLabel(value: string | null | undefined): string {
  return WORKPLACES.find((w) => w.value === value)?.label ?? value ?? "";
}
