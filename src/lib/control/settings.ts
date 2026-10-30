import "server-only";
import { z } from "zod";
import { getSetting, setSetting } from "@/lib/settings-store";
import { controlSettingsSchema, LEVELS, type ControlSettings } from "./shared";

const KEY = "control";

export async function getControlSettings(): Promise<ControlSettings> {
  const parsed = controlSettingsSchema.safeParse((await getSetting(KEY)) ?? {});
  return parsed.success ? parsed.data : controlSettingsSchema.parse({});
}

const updateSchema = z.object({
  groups: z.record(z.string(), z.enum(LEVELS)).optional(),
  /** null removes an action's override (it follows its group again). */
  actions: z.record(z.string(), z.enum(LEVELS).nullable()).optional(),
  dailyCapUsd: z.number().min(0).max(1000).nullable().optional(),
});

/** Saves only what's given: group levels and overrides are merged into what's there. */
export async function saveControlSettings(input: unknown): Promise<ControlSettings> {
  const u = updateSchema.parse(input);
  const cur = await getControlSettings();
  const actions = { ...cur.actions };
  for (const [k, v] of Object.entries(u.actions ?? {})) {
    if (v === null) delete actions[k];
    else actions[k] = v;
  }
  const next: ControlSettings = {
    groups: { ...cur.groups, ...(u.groups ?? {}) },
    actions,
    dailyCapUsd: u.dailyCapUsd !== undefined ? u.dailyCapUsd : cur.dailyCapUsd,
  };
  delete next.groups.read; // reading is always allowed
  await setSetting(KEY, next);
  return next;
}
