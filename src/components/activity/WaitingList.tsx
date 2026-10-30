"use client";

import { Check, ChevronDown, ExternalLink, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { approveHeldApplication, decideAiRequest } from "@/lib/control/server-actions";
import type { Actor } from "@/lib/control/shared";
import { timeAgo } from "@/lib/utils";
import { ActorBadge } from "./ActorBadge";

export interface WaitingRequest {
  id: string;
  actor: Actor;
  via: string | null;
  action: string;
  title: string;
  input: unknown;
  createdAt: string;
}

export interface WaitingTask {
  id: string;
  title: string;
  company: string;
  status: "held" | "needs_you";
  summary: string | null;
  needs: string[];
  checks: string[];
  url: string;
  updatedAt: string;
}

function RequestItem({ r, onDone }: { r: WaitingRequest; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<"approve" | "decline" | null>(null);
  const decide = (d: "approve" | "decline") => {
    setWhich(d);
    start(async () => {
      const res = await decideAiRequest(r.id, d);
      if (!res.ok) toast.error(res.error);
      else toast.success(d === "approve" ? "Approved and done" : "Declined");
      onDone();
    });
  };
  return (
    <li className="grid gap-2 rounded-lg border p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{r.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <ActorBadge actor={r.actor} via={r.via} />
            <span suppressHydrationWarning>asked {timeAgo(new Date(r.createdAt))}</span>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" disabled={pending} onClick={() => decide("approve")} aria-label={`Approve: ${r.title}`}>
            {pending && which === "approve" ? <Loader2 className="animate-spin" /> : <Check />} Approve
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => decide("decline")} aria-label={`Decline: ${r.title}`}>
            {pending && which === "decline" ? <Loader2 className="animate-spin" /> : <X />} Decline
          </Button>
        </div>
      </div>
      <Collapsible>
        <CollapsibleTrigger className="group flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          Details <span className="font-mono">({r.action})</span>
          <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-2 text-xs">{JSON.stringify(r.input, null, 2)}</pre>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function TaskItem({ t, onDone }: { t: WaitingTask; onDone: () => void }) {
  const [pending, start] = useTransition();
  return (
    <li className="grid gap-2 rounded-lg border p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {t.title} <span className="font-normal text-muted-foreground">at {t.company}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t.status === "held" ? "Auto apply filled it and holds it for your OK" : "Auto apply needs you"}
            {t.summary ? `: ${t.summary}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {t.status === "held" ? (
            <Button
              size="sm"
              disabled={pending}
              aria-label={`Approve the application to ${t.company}`}
              onClick={() =>
                start(async () => {
                  const r = await approveHeldApplication(t.id);
                  if (!r.ok) toast.error(r.error);
                  else toast.success("Approved: the browser helper submits it next");
                  onDone();
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : <Check />} Approve
            </Button>
          ) : null}
          {/^https?:/.test(t.url) ? (
            <Button size="sm" variant="outline" asChild>
              <a href={t.url} target="_blank" rel="noreferrer">
                <ExternalLink /> Open the form
              </a>
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" asChild>
            <Link href="/apply?tab=auto">Auto apply</Link>
          </Button>
        </div>
      </div>
      {t.needs.length || t.checks.length ? (
        <ul className="grid gap-1 text-xs">
          {t.needs.map((n) => (
            <li key={`n-${n}`} className="text-destructive-foreground">
              Needs you: {n}
            </li>
          ))}
          {t.checks.slice(0, 6).map((c) => (
            <li key={`c-${c}`} className="text-muted-foreground">
              Check: {c}
            </li>
          ))}
          {t.checks.length > 6 ? <li className="text-muted-foreground">…and {t.checks.length - 6} more on the Auto apply tab</li> : null}
        </ul>
      ) : null}
    </li>
  );
}

export function WaitingList({ requests: initialRequests, tasks: initialTasks }: { requests: WaitingRequest[]; tasks: WaitingTask[] }) {
  const [requests, setRequests] = useState(initialRequests);
  const [tasks, setTasks] = useState(initialTasks);
  if (!requests.length && !tasks.length) return <p className="text-sm text-muted-foreground">Nothing waits for you.</p>;
  return (
    <div className="grid gap-4">
      {requests.length ? (
        <section aria-label="AI requests" className="grid gap-2">
          <h3 className="text-sm font-medium">AIs asked to do ({requests.length})</h3>
          <ul className="grid gap-2">
            {requests.map((r) => (
              <RequestItem key={r.id} r={r} onDone={() => setRequests((all) => all.filter((x) => x.id !== r.id))} />
            ))}
          </ul>
        </section>
      ) : null}
      {tasks.length ? (
        <section aria-label="Applications" className="grid gap-2">
          <h3 className="text-sm font-medium">Applications ({tasks.length})</h3>
          <ul className="grid gap-2">
            {tasks.map((t) => (
              <TaskItem key={t.id} t={t} onDone={() => setTasks((all) => all.filter((x) => x.id !== t.id || x.status !== "held"))} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
