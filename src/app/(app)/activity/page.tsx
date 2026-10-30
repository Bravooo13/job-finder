import Link from "next/link";
import { ActorBadge } from "@/components/activity/ActorBadge";
import { WaitingList } from "@/components/activity/WaitingList";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getAgent } from "@/lib/ai/agents";
import { listTasks } from "@/lib/apply/auto";
import { listActivity, listRequests, spendBreakdown, spendStatus } from "@/lib/control/log";
import { permissionsView } from "@/lib/control/run";
import { ACTOR_LABELS, formatUsd, LEVEL_LABELS, type Actor } from "@/lib/control/shared";
import { cn, formatDate, timeAgo } from "@/lib/utils";

export const metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

const ACTORS = Object.keys(ACTOR_LABELS) as Actor[];
const STATUS_LABEL: Record<string, string> = { error: "Failed", waiting: "Asked you", blocked: "Not allowed", declined: "Declined" };

function featureLabel(f: string): string {
  return getAgent(f)?.name ?? { "apply-pick": "Auto apply choices", "grab-page": "Reading careers pages", test: "Connection test", ai: "Other" }[f] ?? f;
}

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ actor?: string; limit?: string }> }) {
  const q = await searchParams;
  const actor = ACTORS.includes(q.actor as Actor) ? (q.actor as Actor) : undefined;
  const limit = Math.min(500, Number(q.limit) || 100);
  const [requests, tasks, activity, spend, breakdown, permissions] = await Promise.all([
    listRequests({ status: ["waiting"] }),
    listTasks({ status: ["held", "needs_you"], limit: 50 }),
    listActivity({ limit, actor }),
    spendStatus(),
    spendBreakdown(),
    permissionsView(),
  ]);
  const waitingTotal = requests.length + tasks.tasks.length;
  const pct = spend.cap ? Math.min(100, (spend.spent / spend.cap) * 100) : 0;

  return (
    <>
      <PageHeader title="Activity" description="What waits for you, and who did what: you, the AIs, the browser helper and schedules." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid min-w-0 content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Waiting for you{waitingTotal ? ` (${waitingTotal})` : ""}</CardTitle>
              <CardDescription>Steps an AI asked to do (set to &ldquo;Ask me first&rdquo;) and applications Auto apply held for your OK or needs you for.</CardDescription>
            </CardHeader>
            <CardContent>
              <WaitingList
                requests={requests.map((r) => ({ id: r.id, actor: r.actor, via: r.via, action: r.action, title: r.title, input: r.input, createdAt: r.createdAt.toISOString() }))}
                tasks={tasks.tasks.map((t) => ({
                  id: t.id,
                  title: t.title,
                  company: t.company,
                  status: t.status as "held" | "needs_you",
                  summary: t.summary,
                  needs: t.needs,
                  checks: t.checks,
                  url: t.url,
                  updatedAt: t.updatedAt.toISOString(),
                }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="gap-3">
              <div>
                <CardTitle className="text-base">Activity log</CardTitle>
                <CardDescription>Everything that changed something, newest first, with what the AI part cost.</CardDescription>
              </div>
              <nav aria-label="Who" className="flex flex-wrap gap-1.5">
                {[undefined, ...ACTORS].map((a) => (
                  <Link
                    key={a ?? "all"}
                    href={a ? `/activity?actor=${a}` : "/activity"}
                    aria-current={a === actor ? "page" : undefined}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      a === actor ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {a ? ACTOR_LABELS[a] : "Everyone"}
                  </Link>
                ))}
              </nav>
            </CardHeader>
            <CardContent>
              {activity.length ? (
                <ul className="divide-y">
                  {activity.map((e) => (
                    <li key={e.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-start sm:gap-3">
                      <time
                        dateTime={e.createdAt.toISOString()}
                        title={formatDate(e.createdAt, "MMM d, yyyy h:mm a")}
                        className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums sm:pt-0.5"
                      >
                        {timeAgo(e.createdAt)}
                      </time>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm break-words">{e.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <ActorBadge actor={e.actor} via={e.via} />
                          {e.status !== "done" ? (
                            <Badge variant={e.status === "error" || e.status === "blocked" ? "destructive" : "secondary"}>{STATUS_LABEL[e.status] ?? e.status}</Badge>
                          ) : null}
                        </div>
                      </div>
                      {e.costUsd > 0 ? <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatUsd(e.costUsd)}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing yet{actor ? ` from ${ACTOR_LABELS[actor]}` : ""}.</p>
              )}
              {activity.length === limit ? (
                <Link href={`/activity?${actor ? `actor=${actor}&` : ""}limit=${limit + 200}`} className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
                  Show more
                </Link>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">AI spending today</CardTitle>
              <CardDescription>
                {formatUsd(spend.spent)}
                {spend.cap !== null ? ` of your ${formatUsd(spend.cap)} daily limit` : " (no daily limit)"}
                {spend.over ? ". The limit is reached: AI is paused until tomorrow." : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {spend.cap !== null ? <Progress value={pct} aria-label="Share of the daily AI limit used" className="h-2" /> : null}
              {breakdown.length ? (
                <ul className="grid gap-1.5 text-sm">
                  {breakdown.map((b) => (
                    <li key={`${b.actor}-${b.via}-${b.feature}`} className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        {featureLabel(b.feature)}
                        <span className="block text-xs text-muted-foreground">
                          {ACTOR_LABELS[b.actor]}
                          {b.via && b.via !== getAgent(b.feature)?.name ? ` · ${b.via}` : ""} · {b.calls} call{b.calls === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums">{formatUsd(b.cost)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No AI used today.</p>
              )}
              <Link href="/settings#ai-permissions" className="text-sm font-medium text-primary hover:underline">
                Change the limit
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">What AI may do</CardTitle>
              <CardDescription>For the Job Finder assistant, the Job scout and outside AIs.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <ul className="grid gap-1.5 text-sm">
                {permissions.map((g) => (
                  <li key={g.id} className="flex items-start justify-between gap-2">
                    <span className="min-w-0">{g.label}</span>
                    <span className={cn("shrink-0 text-xs font-medium", g.level === "allow" ? "text-muted-foreground" : g.level === "ask" ? "text-primary" : "text-destructive-foreground")}>
                      {g.fixed ? "Always" : LEVEL_LABELS[g.level]}
                    </span>
                  </li>
                ))}
              </ul>
              <Link href="/settings#ai-permissions" className="text-sm font-medium text-primary hover:underline">
                Change in Settings
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
