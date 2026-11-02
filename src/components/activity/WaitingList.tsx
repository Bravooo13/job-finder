"use client";

import { Check, ChevronDown, ExternalLink, Loader2, MailCheck, RotateCcw, Send, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { TASK_STATUS_HINTS, type TaskAction } from "@/lib/apply/auto-schema";
import { actOnApplication, answerAndRetry, decideAiRequest } from "@/lib/control/server-actions";
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
  status: "ready" | "held" | "needs_you" | "unsure";
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

/** Things only you can do on the page itself (not a question to answer once). */
const ON_THE_PAGE = /^(tick|attach|sign in|find the|the company's application link)|robot|captcha|verify|upload/i;

/** Questions the application stopped on: answer each once, saved in My info for every form that asks it. */
function AnswerOnce({ t, onDone }: { t: WaitingTask; onDone: () => void }) {
  const questions = t.needs.filter((n) => !ON_THE_PAGE.test(n));
  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  if (!questions.length) return null;
  const given = questions.filter((q) => values[q]?.trim());
  return (
    <div className="grid gap-2 rounded-md bg-muted/50 p-3">
      <p className="text-xs font-medium">Answer once. Saved in My info and used for every application that asks the same thing.</p>
      {questions.map((q) => (
        <label key={q} className="grid gap-1 text-xs">
          <span>{q}</span>
          <Input value={values[q] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [q]: e.target.value }))} placeholder="Your answer" className="h-8 text-sm" />
        </label>
      ))}
      <div>
        <Button
          size="sm"
          disabled={pending || !given.length}
          onClick={() =>
            start(async () => {
              const r = await answerAndRetry(
                t.id,
                given.map((q) => ({ question: q, answer: values[q] })),
              );
              if (!r.ok) return void toast.error(r.error);
              toast.success(`Saved ${r.data} answer${r.data === 1 ? "" : "s"}. Trying the application again.`);
              onDone();
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Check />} Save and try again
        </Button>
      </div>
    </div>
  );
}

const TASK_BUTTONS: Record<WaitingTask["status"], { action: TaskAction; label: string; icon: typeof Check; variant?: "outline"; done: string }[]> = {
  ready: [{ action: "send", label: "Send it", icon: Send, done: "Sent: the browser helper submits it next" }],
  held: [{ action: "approve", label: "Approve", icon: Check, done: "Approved: the browser helper submits it next" }],
  needs_you: [],
  unsure: [
    { action: "submitted", label: "I submitted it", icon: MailCheck, done: "Marked submitted and applied" },
    { action: "reopen", label: "It didn't go through", icon: RotateCcw, variant: "outline", done: "It will be filled and submitted again" },
  ],
};

function TaskItem({ t, onDone }: { t: WaitingTask; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<TaskAction | null>(null);
  const act = (b: (typeof TASK_BUTTONS)[WaitingTask["status"]][number]) => {
    setWhich(b.action);
    start(async () => {
      const r = await actOnApplication(t.id, b.action);
      if (!r.ok) return void toast.error(r.error);
      toast.success(b.done);
      onDone();
    });
  };
  return (
    <li className="grid gap-2 rounded-lg border p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {t.title} <span className="font-normal text-muted-foreground">at {t.company}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t.summary || TASK_STATUS_HINTS[t.status]}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {TASK_BUTTONS[t.status].map((b) => (
            <Button key={b.action} size="sm" variant={b.variant} disabled={pending} aria-label={`${b.label}: ${t.company}`} onClick={() => act(b)}>
              {pending && which === b.action ? <Loader2 className="animate-spin" /> : <b.icon />} {b.label}
            </Button>
          ))}
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
      {t.status === "needs_you" ? <AnswerOnce t={t} onDone={onDone} /> : null}
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
              <TaskItem key={t.id} t={t} onDone={() => setTasks((all) => all.filter((x) => x.id !== t.id))} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
