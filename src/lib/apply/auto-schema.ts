import { z } from "zod";

// Auto apply settings and statuses. Shared by the server, the Apply page and the agent tools.

export const SUBMIT_MODES = ["sure", "review", "fill", "always"] as const;
export type SubmitMode = (typeof SUBMIT_MODES)[number];

export const SUBMIT_MODE_LABELS: Record<SubmitMode, { label: string; hint: string }> = {
  sure: {
    label: "Submit when sure, hold the rest",
    hint: "Sends forms where every answer came from My answers. Anything guessed or written by the AI waits for your OK.",
  },
  review: { label: "Always wait for my OK", hint: "Fills every form, then waits until you approve it here." },
  fill: { label: "Fill only", hint: "Fills the form and leaves the tab open. You press Submit." },
  always: { label: "Always submit", hint: "Sends every form whose required fields all have an answer, AI-written ones included." },
};

export const autoApplySettingsSchema = z.object({
  submit: z.enum(SUBMIT_MODES).default("sure"),
  /** Tick consent, acknowledgment and "I certify" boxes for you. */
  consent: z.boolean().default(false),
  /** Which open questions the AI writes: required ones, all of them, or none. */
  essays: z.enum(["required", "all", "none"]).default("required"),
  /** Let the AI answer choice questions the answer engine doesn't know (always held for your OK). */
  aiPick: z.boolean().default(true),
  /** Resume to attach: the PDF you uploaded here, or the one Job Finder builds from your LaTeX resume. */
  resume: z.enum(["file", "generated"]).default("file"),
  /** Seconds to wait between applications. */
  pauseSeconds: z.number().int().min(5).max(600).default(20),
  /** Leave held and needs-you applications open in a tab. */
  keepTabs: z.boolean().default(true),
  /** Run queued applications at all (the browser helper checks this). */
  enabled: z.boolean().default(true),
});

export type AutoApplySettings = z.infer<typeof autoApplySettingsSchema>;
export const DEFAULT_AUTO_SETTINGS: AutoApplySettings = autoApplySettingsSchema.parse({});

export const TASK_STATUSES = ["queued", "running", "submitting", "held", "needs_you", "submitted", "failed", "canceled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Statuses of an application that isn't finished. */
export const OPEN_STATUSES: TaskStatus[] = ["queued", "running", "submitting", "held", "needs_you"];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  queued: "Waiting",
  running: "Filling",
  submitting: "Submitting",
  held: "Waiting for your OK",
  needs_you: "Needs you",
  submitted: "Submitted",
  failed: "Didn't work",
  canceled: "Canceled",
};

/** What the browser helper reports for each field once it has filled the form. */
export const filledFieldSchema = z.object({
  label: z.string().max(2000),
  type: z.string().max(40).optional(),
  required: z.boolean().optional(),
  filled: z.boolean(),
  value: z.string().max(2000).optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  rule: z.string().max(80).optional(),
  /** Written or picked by the AI. */
  ai: z.boolean().optional(),
  /** A consent, acknowledgment or "I certify" question. */
  consent: z.boolean().optional(),
});
export type FilledField = z.infer<typeof filledFieldSchema>;
