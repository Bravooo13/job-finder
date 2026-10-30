import "server-only";
import { ZodError } from "zod";
import { AiError } from "@/lib/ai/providers";
import type { LoopTool } from "@/lib/ai/tool-loop";
import { ACTIONS, getAction, groupOf, inputJsonSchema, listedGroup, type ActionDef, type Json } from "./actions";
import { currentActor, withActor } from "./context";
import { createRequest, finishRequest, getRequest, noteActivity } from "./log";
import { getControlSettings } from "./settings";
import { AI_ACTORS, ACTOR_LABELS, GROUPS, LEVEL_LABELS, resolveLevel, type ActionInfo, type Actor } from "./shared";

// Runs an action for whoever asked: checks what AIs may do, puts "Ask me first"
// steps in Waiting for you, and writes the activity log.

export type ActionOutcome =
  | { status: "done"; result: unknown }
  | { status: "waiting"; requestId: string; message: string }
  | { status: "blocked"; message: string }
  | { status: "invalid"; message: string }
  | { status: "error"; message: string };

export interface RunOptions {
  actor: Actor;
  via?: string;
  /** Set when you approved this request in Waiting for you. */
  approvedRequestId?: string;
}

function errorMessage(e: unknown): string {
  if (e instanceof ZodError) return e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
  if (e instanceof AiError || e instanceof Error) return e.message;
  return String(e);
}

function compact(input: unknown): Record<string, unknown> {
  const text = JSON.stringify(input ?? {});
  if (text.length <= 4000) return { input };
  return { input: `${text.slice(0, 4000)}…` };
}

export async function runAction(name: string, rawInput: unknown, opts: RunOptions): Promise<ActionOutcome> {
  const def = getAction(name);
  if (!def) return { status: "invalid", message: `Unknown action: ${name}` };
  const parsed = def.input.safeParse(rawInput ?? {});
  if (!parsed.success) return { status: "invalid", message: errorMessage(parsed.error) };
  const input = parsed.data;
  const group = groupOf(def, input);
  const isAi = AI_ACTORS.includes(opts.actor);

  if (isAi && !opts.approvedRequestId) {
    const level = resolveLevel(await getControlSettings(), def.name, group);
    if (level === "never") {
      const message = `The owner doesn't let AIs do this (“${def.title}” is set to Never in Settings → What AI may do).`;
      await noteActivity({ actor: opts.actor, via: opts.via, action: def.name, title: `Not allowed: ${def.title}`, status: "blocked", costUsd: 0, detail: compact(input) });
      return { status: "blocked", message };
    }
    if (level === "ask") {
      const title = await explain(def, input);
      const req = await createRequest({ actor: opts.actor, via: opts.via, action: def.name, title, input });
      await noteActivity({ actor: opts.actor, via: opts.via, action: def.name, title: `Asked you: ${title}`, status: "waiting", costUsd: 0, requestId: req.id, detail: compact(input) });
      return {
        status: "waiting",
        requestId: req.id,
        message: `This needs the owner's OK, so it's in his Waiting for you list (request ${req.id}). Don't retry it: tell him what's waiting. list_waiting shows the result once he decides.`,
      };
    }
  }

  const quiet = group === "read";
  const via = opts.via ?? currentActor()?.via;
  // An approved request runs as the AI that asked; the log says you approved it.
  const runVia = opts.approvedRequestId ? `${via ?? ACTOR_LABELS[opts.actor]}, approved by you` : via;
  return withActor(opts.actor, runVia, async () => {
    const ctx = currentActor()!;
    try {
      const result = await def.run(input);
      // Log a line unless the work wrote its own (saving a job, queuing applications…).
      if (!quiet && ctx.logged === 0) {
        await noteActivity({
          action: def.name,
          title: safeDescribe(def, input, result),
          requestId: opts.approvedRequestId,
          detail: compact(input),
        });
      } else if (quiet && ctx.unloggedCost > 0) {
        await noteActivity({ action: def.name, title: safeDescribe(def, input, result), detail: compact(input) });
      }
      return { status: "done", result };
    } catch (e) {
      const message = errorMessage(e);
      if (!quiet) await noteActivity({ action: def.name, title: `Failed: ${def.title}: ${message.slice(0, 200)}`, status: "error", requestId: opts.approvedRequestId, detail: compact(input) });
      return { status: "error", message };
    }
  });
}

/** What a waiting request would do, in words: "Submit the held application to Acme (Data Analyst Intern)". */
async function explain(def: ActionDef, input: unknown): Promise<string> {
  try {
    if (def.explain) return (await def.explain(input as never)).slice(0, 500);
  } catch {
    // fall back to the plain title
  }
  return def.describe ? safeDescribe(def, input, null) : def.title;
}

function safeDescribe(def: ActionDef, input: unknown, result: unknown): string {
  try {
    return def.describe?.(input as never, result) ?? def.title;
  } catch {
    return def.title;
  }
}

/** You approved or declined a request from Waiting for you. */
export async function decideRequest(id: string, decision: "approve" | "decline"): Promise<{ ok: boolean; message: string }> {
  const req = await getRequest(id);
  if (!req || req.status !== "waiting") return { ok: false, message: "That request was already handled." };
  if (decision === "decline") {
    await finishRequest(id, { status: "declined" });
    await noteActivity({ actor: "you", action: req.action, title: `Declined: ${req.title} (asked by ${req.via ?? ACTOR_LABELS[req.actor]})`, status: "declined", requestId: id });
    return { ok: true, message: "Declined." };
  }
  const out = await runAction(req.action, req.input, { actor: req.actor, via: req.via ?? undefined, approvedRequestId: id });
  if (out.status === "done") {
    await finishRequest(id, { status: "done", result: out.result });
    return { ok: true, message: "Done." };
  }
  const message = "message" in out ? out.message : "It didn't work.";
  await finishRequest(id, { status: "failed", error: message });
  return { ok: false, message };
}

// ------------------------------------------------------------- listings

/** Every action with the level an AI gets for it now. */
export async function listActions(): Promise<(ActionInfo & { inputSchema: Json })[]> {
  const s = await getControlSettings();
  return ACTIONS.map((def) => {
    const group = listedGroup(def);
    return {
      name: def.name,
      title: def.title,
      description: def.description,
      group,
      level: resolveLevel(s, def.name, group),
      groupLevel: resolveLevel({ ...s, actions: {} }, def.name, group),
      inputSchema: inputJsonSchema(def),
    };
  });
}

/** The actions as tools for an AI inside Job Finder, run as that AI. */
export function toolsFor(o: { set: "all" | "find"; via: string }): LoopTool[] {
  const defs = o.set === "find" ? ACTIONS.filter((d) => d.find) : ACTIONS;
  return defs.map((def) => ({
    name: def.name,
    description: def.description,
    input_schema: inputJsonSchema(def),
    status: (a: Json) => {
      try {
        return def.status?.(a as never) ?? def.title;
      } catch {
        return def.title;
      }
    },
    run: async (a: Json) => {
      const out = await runAction(def.name, a, { actor: "assistant", via: o.via });
      if (out.status === "done") return out.result;
      if (out.status === "waiting") return { status: "waiting", requestId: out.requestId, message: out.message };
      throw new Error(out.status === "blocked" ? `blocked: ${out.message}` : out.message);
    },
  }));
}

/** The groups with their levels and actions, for the permissions page. */
export async function permissionsView() {
  const actions = await listActions();
  return GROUPS.map((g) => ({
    ...g,
    level: actions.find((a) => a.group === g.id)?.groupLevel ?? "allow",
    levelLabel: LEVEL_LABELS[actions.find((a) => a.group === g.id)?.groupLevel ?? "allow"],
    actions: actions.filter((a) => a.group === g.id).map((a) => ({ name: a.name, title: a.title, description: a.description, group: a.group, level: a.level, groupLevel: a.groupLevel })),
  }));
}
