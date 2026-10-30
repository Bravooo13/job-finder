import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Actor } from "@/lib/db/schema";

// Who is doing the current work. Set where work starts (an action run by an AI,
// a request from the browser helper, a scheduled search) and read where it's
// logged (activity log, AI usage). Without one, it's you.

export interface ActorContext {
  actor: Actor;
  via?: string;
  /** AI cost since the last activity-log line, so each line carries what it cost. */
  unloggedCost: number;
  totalCost: number;
  /** Activity-log lines written in this piece of work. */
  logged: number;
}

const g = globalThis as unknown as { jobFinderActor?: AsyncLocalStorage<ActorContext> };
const store = (g.jobFinderActor ??= new AsyncLocalStorage<ActorContext>());

export function withActor<T>(actor: Actor, via: string | undefined, fn: () => Promise<T>): Promise<T> {
  return store.run({ actor, via, unloggedCost: 0, totalCost: 0, logged: 0 }, fn);
}

export function currentActor(): ActorContext | undefined {
  return store.getStore();
}

/** Who sent an API request: an outside AI over MCP, the browser helper, or you (a Job Finder page). */
export function actorFromRequest(request: Request): { actor: Actor; via?: string } {
  return actorFromHeaders(request.headers);
}

function actorFromHeaders(h: Headers): { actor: Actor; via?: string } {
  const client = h.get("x-job-finder-client")?.replace(/[^\w .@/-]/g, "").slice(0, 60) || undefined;
  if (h.get("x-job-finder-actor") === "outside") return { actor: "outside", via: client ?? "MCP" };
  const origin = h.get("origin") ?? "";
  if (origin.startsWith("chrome-extension://")) return { actor: "extension", via: "Job Finder Helper" };
  if (origin || h.get("sec-fetch-site") === "same-origin") return { actor: "you" };
  // No browser headers: a script or an agent calling the API directly.
  return { actor: "outside", via: client ?? (h.get("user-agent") ?? "").split(/[ /]/)[0]?.slice(0, 40) ?? "API" };
}

/**
 * Who is doing the current work: the actor set with withActor, else whoever sent
 * the request being handled (a button on a Job Finder page, the browser helper,
 * an outside AI), else you.
 */
export async function resolveActor(): Promise<{ actor: Actor; via?: string; ctx?: ActorContext }> {
  const ctx = store.getStore();
  if (ctx) return { actor: ctx.actor, via: ctx.via, ctx };
  try {
    const { headers } = await import("next/headers");
    return actorFromHeaders(new Headers(await headers()));
  } catch {
    return { actor: "you" }; // not in a request (a background job)
  }
}

/** Runs a route handler as whoever sent the request. */
export function asRequester<T>(request: Request, fn: () => Promise<T>): Promise<T> {
  const { actor, via } = actorFromRequest(request);
  return withActor(actor, via, fn);
}
