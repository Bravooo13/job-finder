import { z } from "zod";

// Auto apply settings and statuses. Shared by the server, the Apply page and the agent tools.

/** The browser helper version this Job Finder expects (keep in step with extension/manifest.json). */
export const HELPER_VERSION = "0.2.7";

/** "0.2.5" < "0.2.7". */
export function olderVersion(a: string, b: string): boolean {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
  return false;
}

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
  /**
   * Resume to attach. match: tailored for the job, else your version for the job's field, else your uploaded PDF.
   * file: tailored for the job, else your uploaded PDF. generated: tailored, else your field's version, else your master LaTeX resume.
   */
  resume: z.enum(["match", "file", "generated"]).default("match"),
  /** Cover letters: write one with the Cover letter writer when a form requires one, whenever a form has a place for one, or never. */
  coverLetters: z.enum(["required", "always", "never"]).default("required"),
  /** Seconds to wait between applications. */
  pauseSeconds: z.number().int().min(5).max(600).default(20),
  /** Leave held and needs-you applications open in a tab. */
  keepTabs: z.boolean().default(true),
  /** Check questions first: new applications are filled without Submit, and wait as "Ready to send" or with the questions to answer. */
  checkFirst: z.boolean().default(false),
  /** Run queued applications at all (the browser helper checks this). */
  enabled: z.boolean().default(true),
});

export type AutoApplySettings = z.infer<typeof autoApplySettingsSchema>;
export const DEFAULT_AUTO_SETTINGS: AutoApplySettings = autoApplySettingsSchema.parse({});

export const TASK_STATUSES = ["queued", "running", "submitting", "ready", "held", "needs_you", "unsure", "submitted", "failed", "canceled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Statuses of an application that isn't finished. */
export const OPEN_STATUSES: TaskStatus[] = ["queued", "running", "submitting", "ready", "held", "needs_you", "unsure"];

/** Statuses that wait for the owner (Activity → Waiting for you, the sidebar badge). */
export const WAITING_STATUSES: TaskStatus[] = ["ready", "held", "needs_you", "unsure"];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  queued: "Waiting",
  running: "Filling",
  submitting: "Submitting",
  ready: "Ready to send",
  held: "Waiting for your OK",
  needs_you: "Needs you",
  unsure: "Sent? Check",
  submitted: "Submitted",
  failed: "Didn't work",
  canceled: "Canceled",
};

/** One-line explanations for the status badges. */
export const TASK_STATUS_HINTS: Record<TaskStatus, string> = {
  queued: "In line for the browser helper.",
  running: "The browser helper is filling the form now.",
  submitting: "Submit was pressed; watching the page.",
  ready: "Checked: every required question has an answer. Send it when you want.",
  held: "Filled and waiting for your OK before it's sent.",
  needs_you: "Something only you can answer or do.",
  unsure: "Submit was pressed but no thank-you page showed. Check your email or the tab. It is never sent again on its own.",
  submitted: "Sent and marked applied.",
  failed: "It didn't work; try again.",
  canceled: "Canceled.",
};

export const TASK_ACTIONS = ["approve", "retry", "cancel", "remove", "submitted", "send", "reopen"] as const;
export type TaskAction = (typeof TASK_ACTIONS)[number];

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
