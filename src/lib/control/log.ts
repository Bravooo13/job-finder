import "server-only";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { actionRequests, activityLog, aiUsage, applyTasks, type ActionRequest, type Actor } from "@/lib/db/schema";
import { resolveActor } from "./context";
import { costOf, startOfToday, type Usage } from "./pricing";
import { getControlSettings } from "./settings";

// ------------------------------------------------------------ activity log

export interface ActivityInput {
  action: string;
  title: string;
  status?: "done" | "error" | "waiting" | "blocked" | "declined";
  detail?: Record<string, unknown> | null;
  /** Defaults to the AI cost spent since the last line in this piece of work. */
  costUsd?: number;
  requestId?: string;
  actor?: Actor;
  via?: string;
}

/** Writes one line to the activity log. Never throws: logging must not break the work. */
export async function noteActivity(e: ActivityInput): Promise<void> {
  const who = await resolveActor();
  const ctx = who.ctx;
  const cost = e.costUsd ?? ctx?.unloggedCost ?? 0;
  if (ctx && e.costUsd === undefined) ctx.unloggedCost = 0;
  if (ctx) ctx.logged++;
  try {
    await db.insert(activityLog).values({
      actor: e.actor ?? who.actor,
      via: e.via ?? (e.actor ? null : who.via) ?? null,
      action: e.action,
      title: e.title.slice(0, 500),
      status: e.status ?? "done",
      detail: e.detail ?? null,
      costUsd: cost,
      requestId: e.requestId ?? null,
    });
  } catch (error) {
    console.error("Couldn't write the activity log", error);
  }
}

export async function listActivity(o: { limit?: number; actor?: Actor; before?: Date } = {}) {
  const conds = [];
  if (o.actor) conds.push(eq(activityLog.actor, o.actor));
  if (o.before) conds.push(sql`${activityLog.createdAt} < ${o.before.getTime()}`);
  return db
    .select()
    .from(activityLog)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(activityLog.createdAt))
    .limit(Math.min(500, o.limit ?? 100));
}

// --------------------------------------------------------- Waiting for you

export async function createRequest(r: { actor: Actor; via?: string; action: string; title: string; input: unknown }): Promise<ActionRequest> {
  const [row] = await db
    .insert(actionRequests)
    .values({ actor: r.actor, via: r.via ?? null, action: r.action, title: r.title.slice(0, 500), input: r.input ?? {} })
    .returning();
  return row;
}

export async function getRequest(id: string): Promise<ActionRequest | null> {
  return (await db.query.actionRequests.findFirst({ where: eq(actionRequests.id, id) })) ?? null;
}

export async function listRequests(o: { status?: ActionRequest["status"][]; limit?: number } = {}) {
  return db
    .select()
    .from(actionRequests)
    .where(o.status?.length ? inArray(actionRequests.status, o.status) : undefined)
    .orderBy(desc(actionRequests.createdAt))
    .limit(Math.min(200, o.limit ?? 50));
}

export async function finishRequest(id: string, set: { status: "done" | "failed" | "declined"; result?: unknown; error?: string | null }) {
  const [row] = await db
    .update(actionRequests)
    .set({ status: set.status, result: set.result ?? null, error: set.error ?? null, decidedAt: new Date() })
    .where(and(eq(actionRequests.id, id), eq(actionRequests.status, "waiting")))
    .returning();
  return row ?? null;
}

/** How many things wait for you: AI requests plus applications Auto apply held or needs you for. */
export async function waitingCounts(): Promise<{ requests: number; held: number; needsYou: number; total: number }> {
  const [[r], tasks] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(actionRequests).where(eq(actionRequests.status, "waiting")),
    db
      .select({ status: applyTasks.status, n: sql<number>`count(*)` })
      .from(applyTasks)
      .where(inArray(applyTasks.status, ["held", "needs_you"]))
      .groupBy(applyTasks.status),
  ]);
  const held = Number(tasks.find((t) => t.status === "held")?.n ?? 0);
  const needsYou = Number(tasks.find((t) => t.status === "needs_you")?.n ?? 0);
  const requests = Number(r?.n ?? 0);
  return { requests, held, needsYou, total: requests + held + needsYou };
}

// ------------------------------------------------------------ AI spending

export async function recordAiUsage(u: Usage & { provider: "claude" | "ollama"; model: string; feature?: string }): Promise<number> {
  const who = await resolveActor();
  const ctx = who.ctx;
  const cost = u.provider === "claude" ? costOf(u.model, u) : 0;
  if (ctx) {
    ctx.unloggedCost += cost;
    ctx.totalCost += cost;
  }
  try {
    await db.insert(aiUsage).values({
      actor: who.actor,
      via: who.via ?? null,
      feature: u.feature ?? "ai",
      provider: u.provider,
      model: u.model,
      inputTokens: u.input,
      outputTokens: u.output,
      cacheWriteTokens: u.cacheWrite ?? 0,
      cacheReadTokens: u.cacheRead ?? 0,
      webSearches: u.webSearches ?? 0,
      costUsd: cost,
    });
  } catch (error) {
    console.error("Couldn't record AI usage", error);
  }
  return cost;
}

export async function spentToday(): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${aiUsage.costUsd}), 0)` })
    .from(aiUsage)
    .where(gte(aiUsage.createdAt, startOfToday()));
  return Number(row?.total ?? 0);
}

/** Today's AI spending against the cap. */
export async function spendStatus(): Promise<{ spent: number; cap: number | null; over: boolean }> {
  const [spent, s] = await Promise.all([spentToday(), getControlSettings()]);
  return { spent, cap: s.dailyCapUsd, over: s.dailyCapUsd !== null && spent >= s.dailyCapUsd };
}

/** Today's spending by who and what, for the Activity page. */
export async function spendBreakdown() {
  const rows = await db
    .select({
      actor: aiUsage.actor,
      via: aiUsage.via,
      feature: aiUsage.feature,
      calls: sql<number>`count(*)`,
      cost: sql<number>`coalesce(sum(${aiUsage.costUsd}), 0)`,
    })
    .from(aiUsage)
    .where(gte(aiUsage.createdAt, startOfToday()))
    .groupBy(aiUsage.actor, aiUsage.via, aiUsage.feature)
    .orderBy(desc(sql`sum(${aiUsage.costUsd})`));
  return rows.map((r) => ({ ...r, calls: Number(r.calls), cost: Number(r.cost) }));
}
