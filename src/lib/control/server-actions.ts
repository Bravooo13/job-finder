"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { actOnTask } from "@/lib/apply/auto";
import { noteActivity } from "./log";
import { decideRequest } from "./run";
import { saveControlSettings } from "./settings";
import { GROUPS, LEVEL_LABELS, type ControlSettings, type Level } from "./shared";

function refresh() {
  revalidatePath("/activity");
  revalidatePath("/settings");
  revalidatePath("/apply");
}

/** Your changes on Settings → What AI may do. */
export async function saveAiPermissions(input: {
  groups?: Record<string, Level>;
  actions?: Record<string, Level | null>;
  dailyCapUsd?: number | null;
}): Promise<ActionResult<ControlSettings>> {
  try {
    const next = await saveControlSettings(input);
    const parts: string[] = [];
    for (const [g, l] of Object.entries(input.groups ?? {})) parts.push(`${GROUPS.find((x) => x.id === g)?.label ?? g}: ${LEVEL_LABELS[l]}`);
    for (const [a, l] of Object.entries(input.actions ?? {})) parts.push(`${a}: ${l ? LEVEL_LABELS[l] : "same as its group"}`);
    if (input.dailyCapUsd !== undefined) parts.push(input.dailyCapUsd === null ? "no daily AI limit" : `daily AI limit $${input.dailyCapUsd}`);
    if (parts.length) await noteActivity({ actor: "you", action: "update_permissions", title: `Changed what AI may do: ${parts.join(", ")}` });
    refresh();
    return { ok: true, data: next };
  } catch (error) {
    return { ok: false, error: error instanceof ZodError ? (error.issues[0]?.message ?? "Invalid settings") : String(error) };
  }
}

/** Approve or decline something an AI asked to do. */
export async function decideAiRequest(id: string, decision: "approve" | "decline"): Promise<ActionResult<string>> {
  const r = await decideRequest(id, decision);
  refresh();
  return r.ok ? { ok: true, data: r.message } : { ok: false, error: r.message };
}

/** Your OK for an application Auto apply held (same as Approve on Apply → Auto apply). */
export async function approveHeldApplication(id: string): Promise<ActionResult> {
  const task = await actOnTask(id, "approve");
  refresh();
  return task ? { ok: true, data: null } : { ok: false, error: "That application is gone" };
}
