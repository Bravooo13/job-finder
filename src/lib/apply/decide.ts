// Should Auto apply press Submit? Pure logic, shared by the API and the tests.

import type { FilledField, SubmitMode } from "./auto-schema";

export interface Decision {
  /** submit: press Submit. hold: wait for your OK. needs_you: something only you can fill. */
  action: "submit" | "hold" | "needs_you";
  /** Required things that are still empty (or blockers like a CAPTCHA). */
  needs: string[];
  /** Answers to look at before it's sent: guessed, AI-written or AI-picked. */
  checks: string[];
  summary: string;
}

const short = (s: string, n = 90) => {
  const t = s.replace(/\s+/g, " ").replace(/[*✱]\s*$/, "").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

export function decideSubmit(
  mode: SubmitMode,
  fields: FilledField[],
  opts: { approved?: boolean; blockers?: string[] } = {},
): Decision {
  const needs = [...(opts.blockers ?? [])];
  for (const f of fields) {
    if (!f.required || f.filled) continue;
    const label = short(f.label) || "A required field";
    needs.push(f.consent ? `Tick: ${label}` : f.type === "file" ? `Attach: ${label}` : label);
  }
  const checks = fields
    .filter((f) => f.filled && (f.ai || (f.confidence && f.confidence !== "high")))
    .map((f) => `${short(f.label, 70)}: ${short(f.value ?? "", 60) || "(filled)"}${f.ai ? " (AI)" : ""}`);
  const filled = fields.filter((f) => f.filled).length;

  if (needs.length) {
    return { action: "needs_you", needs, checks, summary: `Needs you: ${needs.slice(0, 3).join("; ")}${needs.length > 3 ? ` and ${needs.length - 3} more` : ""}.` };
  }
  if (mode === "fill") return { action: "hold", needs, checks, summary: `Filled ${filled} fields. Review it and press Submit yourself.` };
  if (opts.approved) return { action: "submit", needs, checks, summary: `You approved it. Submitting ${filled} fields.` };
  if (mode === "review") return { action: "hold", needs, checks, summary: `Filled ${filled} fields. Waiting for your OK.` };
  if (mode === "sure" && checks.length) {
    return { action: "hold", needs, checks, summary: `Filled ${filled} fields; ${checks.length} answer${checks.length === 1 ? "" : "s"} to check before it's sent.` };
  }
  return { action: "submit", needs, checks, summary: `All ${filled} fields answered${checks.length ? ` (${checks.length} by the AI or guessed)` : " from your answers"}. Submitting.` };
}
