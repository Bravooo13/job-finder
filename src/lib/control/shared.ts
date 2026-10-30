// Who may do what in Job Finder. Shared between server and client.
//
// Every capability is an action (src/lib/control/actions.ts). You run them with
// the website's buttons; AIs run the same actions as tools: the Job Finder
// assistant and the other in-app agents, and outside AIs over MCP. Your
// settings say, per group of actions, whether an AI may do it right away, must
// ask you first, or may never do it.

import { z } from "zod";
import type { Actor } from "@/lib/db/schema";

export type { Actor };

export const ACTOR_LABELS: Record<Actor, string> = {
  you: "You",
  assistant: "AI in Job Finder",
  outside: "Outside AI",
  extension: "Browser helper",
  scheduler: "Schedule",
};

/** AIs follow the permission settings; you, the browser helper and schedules follow your other settings. */
export const AI_ACTORS: Actor[] = ["assistant", "outside"];

export const LEVELS = ["allow", "ask", "never"] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_LABELS: Record<Level, string> = { allow: "Do it", ask: "Ask me first", never: "Never" };

const GROUP_LIST = [
  { id: "read", label: "Look things up", description: "Read jobs, searches, resumes, My answers, settings and the activity log. Always allowed.", fixed: true },
  { id: "find", label: "Find, save and dismiss jobs", description: "Search LinkedIn, company boards and careers pages, add company boards, run saved searches, save jobs to My jobs or hide them." },
  { id: "agents", label: "Ask the specialist agents", description: "Resume tailor, Cover letter writer, Job fit reviewer, Interview coach and the rest. They only write text; this uses AI credits." },
  { id: "write", label: "Write resumes and cover letters", description: "Make industry resume versions, write cover letters and answers to application questions." },
  { id: "queue", label: "Queue jobs for Auto apply", description: "Add applications to Auto apply, try again, cancel or remove them. Submitting still follows your Auto apply settings." },
  { id: "track", label: "Update My jobs", description: "Change a job's status (applied, interview…), add notes, mark a job applied." },
  { id: "settings", label: "Change My answers and settings", description: "Edit My answers, saved searches and Auto apply settings." },
  { id: "approve", label: "Approve held applications", description: "Tell Auto apply to submit an application it held for your OK." },
] as const;
export type GroupId = (typeof GROUP_LIST)[number]["id"];

export interface GroupDef {
  id: GroupId;
  label: string;
  description: string;
  /** Can't be changed (reading is always allowed). */
  fixed?: boolean;
}
export const GROUPS: GroupDef[] = [...GROUP_LIST];

export const DEFAULT_LEVELS: Record<GroupId, Level> = {
  read: "allow",
  find: "allow",
  agents: "allow",
  write: "allow",
  queue: "allow",
  track: "allow",
  settings: "allow",
  approve: "ask",
};

const levelSchema = z.enum(LEVELS);

export const controlSettingsSchema = z.object({
  groups: z.record(z.string(), levelSchema).default({}),
  /** Per-action overrides of the group's level. */
  actions: z.record(z.string(), levelSchema).default({}),
  /** Stop all AI use for the day at this many US dollars. null = no limit. */
  dailyCapUsd: z.number().min(0).max(1000).nullable().default(5),
});
export type ControlSettings = z.infer<typeof controlSettingsSchema>;

/** The level an AI gets for an action: its own override, else its group's level. Reading is always allowed. */
export function resolveLevel(s: Pick<ControlSettings, "groups" | "actions">, action: string, group: GroupId): Level {
  if (group === "read") return "allow";
  return s.actions[action] ?? (s.groups[group] as Level | undefined) ?? DEFAULT_LEVELS[group];
}

/** What the browser is told about an action. */
export interface ActionInfo {
  name: string;
  title: string;
  description: string;
  group: GroupId;
  level: Level;
  /** The group's level before this action's override. */
  groupLevel: Level;
}

export function formatUsd(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}
