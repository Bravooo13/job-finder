"use client";

import { Bot, Check, CheckCircle2, ExternalLink, FileUp, Loader2, Play, RotateCcw, Send, Trash2, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CLAUDE_MODELS } from "@/lib/ai/models";
import { helperInstalled, startHelperNow } from "@/lib/apply/auto-client";
import { SUBMIT_MODES, SUBMIT_MODE_LABELS, TASK_STATUS_LABELS, type AutoApplySettings, type TaskStatus } from "@/lib/apply/auto-schema";
import type { ApplyTaskAnswer } from "@/lib/db/schema";
import { cn, timeAgo } from "@/lib/utils";

export interface AutoTask {
  id: string;
  title: string;
  company: string;
  url: string;
  status: TaskStatus;
  approved: boolean;
  summary: string | null;
  needs: string[];
  checks: string[];
  answers: ApplyTaskAnswer[];
  jobId: string | null;
  updatedAt: Date | string | number;
}

export interface AutoState {
  tasks: AutoTask[];
  counts: Partial<Record<TaskStatus, number>>;
  settings: AutoApplySettings;
  resumeFile: { name: string; size: number; uploadedAt: string } | null;
  ai: { ready: boolean; label: string; applyModel: string };
  helper: { lastSeen: string | null; running: boolean; version: string | null };
}

const VIEWS: { id: string; label: string; statuses: TaskStatus[] }[] = [
  { id: "you", label: "Needs you", statuses: ["needs_you", "held"] },
  { id: "active", label: "In progress", statuses: ["queued", "running", "submitting"] },
  { id: "done", label: "Submitted", statuses: ["submitted"] },
  { id: "all", label: "All", statuses: [] },
];

const STATUS_STYLE: Record<TaskStatus, string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  submitting: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  held: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  needs_you: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  submitted: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  failed: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  canceled: "bg-muted text-muted-foreground",
};

function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function AutoApply({ initial }: { initial: AutoState }) {
  const [state, setState] = useState<AutoState>(initial);
  const [view, setView] = useState(initial.counts.needs_you || initial.counts.held ? "you" : initial.counts.queued || initial.counts.running ? "active" : "all");
  const [busy, setBusy] = useState<string | null>(null);
  const [installed, setInstalled] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/apply/auto?limit=200").catch(() => null);
    if (res?.ok) setState(await res.json());
  }, []);

  useEffect(() => {
    setInstalled(helperInstalled());
    const active = (state.counts.queued ?? 0) + (state.counts.running ?? 0) + (state.counts.submitting ?? 0) > 0;
    const t = setInterval(refresh, active ? 4000 : 20000);
    return () => clearInterval(t);
  }, [refresh, state.counts.queued, state.counts.running, state.counts.submitting]);

  async function saveSettings(patch: Partial<AutoApplySettings>) {
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
    const res = await fetch("/api/apply/auto/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    if (!res.ok) toast.error((await res.json()).error ?? "Couldn't save");
  }

  async function act(id: string, action: "approve" | "retry" | "cancel" | "remove" | "submitted") {
    setBusy(id);
    const res = await fetch(`/api/apply/auto/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
    setBusy(null);
    if (!res.ok) return void toast.error((await res.json()).error ?? "Couldn't do that");
    if (action === "approve" || action === "retry") startHelperNow();
    toast.success(
      { approve: "Approved: it will be submitted", retry: "Queued again", cancel: "Canceled", remove: "Removed", submitted: "Marked as submitted and applied" }[action],
    );
    refresh();
  }

  async function upload(file: File) {
    const form = new FormData();
    form.append("file", file);
    setBusy("resume");
    const res = await fetch("/api/apply/resume-file", { method: "POST", body: form });
    setBusy(null);
    const data = await res.json();
    if (!res.ok) return void toast.error(data.error ?? "Upload failed");
    toast.success(`Auto apply will attach ${data.file.name}`);
    setState((s) => ({ ...s, resumeFile: data.file }));
    if (state.settings.resume === "generated") saveSettings({ resume: "match" });
  }

  const s = state.settings;
  const shown = state.tasks.filter((t) => {
    const v = VIEWS.find((x) => x.id === view)!;
    return !v.statuses.length || v.statuses.includes(t.status);
  });

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Auto apply</CardTitle>
          <CardDescription>
            Pick jobs in <b>To apply</b> or <b>Found jobs</b> and press Auto apply. The browser helper opens each application in a background tab of
            your Chrome, fills it from <Link href="/apply?tab=answers" className="text-primary hover:underline">My answers</Link>, attaches your resume,
            and submits it or leaves it here for you, as set below. It never creates accounts, types passwords or solves CAPTCHAs: those wait for you.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <p className="flex items-center gap-2">
            {state.helper.running ? <CheckCircle2 className="size-4 text-emerald-600" /> : <TriangleAlert className="size-4 text-amber-600" />}
            {state.helper.running ? (
              <span suppressHydrationWarning>Browser helper is running (checked in {timeAgo(new Date(state.helper.lastSeen!))}).</span>
            ) : installed
                ? "The browser helper is installed but hasn't checked in. Reload it on chrome://extensions (version 0.2.0 or newer), and keep Auto apply on in its popup."
                : "The browser helper isn't running. Load the extension (Browser helper tab), and keep Chrome open while it works."}
          </p>
          <p className="flex items-center gap-2">
            {state.ai.ready ? <CheckCircle2 className="size-4 text-emerald-600" /> : <TriangleAlert className="size-4 text-amber-600" />}
            {state.ai.ready ? (
              `AI is set up: written answers by ${CLAUDE_MODELS.find((m) => m.id === state.ai.applyModel)?.label ?? state.ai.applyModel} (${state.ai.label} for everything else).`
            ) : (
              <span>
                No AI yet: open questions are left for you.{" "}
                <Link href="/settings" className="text-primary hover:underline">
                  Paste a Claude API key in Settings
                </Link>
                .
              </span>
            )}
          </p>
          <p className="flex items-center gap-2">
            {state.resumeFile || s.resume === "generated" ? <CheckCircle2 className="size-4 text-emerald-600" /> : <TriangleAlert className="size-4 text-amber-600" />}
            {s.resume === "match"
              ? `Resume: the one tailored for the job, else your version for its field (Profile & resumes), else ${state.resumeFile ? state.resumeFile.name : "your master resume"}.`
              : s.resume === "file"
                ? state.resumeFile
                  ? `Resume: ${state.resumeFile.name} (unless you tailored one for the job).`
                  : "No resume PDF uploaded: Job Finder builds one from your LaTeX resume instead."
                : "Resume: built from your LaTeX resumes (tailored for the job, else your version for its field)."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Applications</CardTitle>
          <CardDescription>What Auto apply did with each job. Approve the ones waiting for your OK, or finish the ones that need you in their tab.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Show">
            {VIEWS.map((v) => {
              const n = v.statuses.length ? v.statuses.reduce((a, st) => a + (state.counts[st] ?? 0), 0) : state.tasks.length;
              return (
                <button
                  key={v.id}
                  role="tab"
                  aria-selected={view === v.id}
                  onClick={() => setView(v.id)}
                  className={cn("rounded-full border px-3 py-1 text-sm", view === v.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}
                >
                  {v.label} ({n})
                </button>
              );
            })}
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => (startHelperNow(), refresh())}>
              <Play /> Start now
            </Button>
          </div>
          {!shown.length ? (
            <p className="rounded-lg border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
              {state.tasks.length ? "Nothing here." : "No applications yet. Select jobs in To apply or Found jobs and press Auto apply."}
            </p>
          ) : (
            <ul className="grid gap-3">
              {shown.map((t) => (
                <li key={t.id} className="rounded-lg border bg-card p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {t.jobId ? (
                          <Link href={`/jobs/${t.jobId}`} className="font-medium hover:underline">
                            {t.title}
                          </Link>
                        ) : (
                          <span className="font-medium">{t.title}</span>
                        )}
                        <span className="text-sm text-muted-foreground">{t.company}</span>
                        <Badge className={cn("border-transparent", STATUS_STYLE[t.status])}>
                          {t.status === "running" || t.status === "submitting" ? <Loader2 className="animate-spin" /> : null}
                          {TASK_STATUS_LABELS[t.status]}
                        </Badge>
                        <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                          {timeAgo(new Date(t.updatedAt))}
                        </span>
                      </div>
                      {t.summary ? <p className="text-sm">{t.summary}</p> : null}
                      {t.needs.length && (t.status === "needs_you" || t.status === "held") ? (
                        <div className="text-sm">
                          <p className="font-medium text-red-700 dark:text-red-400">Only you can do:</p>
                          <ul className="ml-5 list-disc text-muted-foreground">
                            {t.needs.map((n, i) => (
                              <li key={i}>{n}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {t.checks.length && t.status !== "submitted" ? (
                        <div className="text-sm">
                          <p className="font-medium text-amber-700 dark:text-amber-400">Check these answers:</p>
                          <ul className="ml-5 list-disc text-muted-foreground">
                            {t.checks.map((c, i) => (
                              <li key={i}>{c}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {t.answers.length ? (
                        <details className="text-sm">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">All {t.answers.length} answers</summary>
                          <dl className="mt-2 grid gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                            {t.answers.map((a, i) => (
                              <div key={i} className="contents">
                                <dt className="truncate text-muted-foreground" title={a.label}>
                                  {a.label}
                                </dt>
                                <dd className={cn("truncate", a.confidence === "medium" && "text-amber-700 dark:text-amber-400", !a.value && a.required && "text-red-700 dark:text-red-400")} title={a.value}>
                                  {a.value || (a.required ? "(empty)" : "—")}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </details>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      {t.status === "held" ? (
                        <Button size="sm" onClick={() => act(t.id, "approve")} disabled={busy === t.id}>
                          {busy === t.id ? <Loader2 className="animate-spin" /> : <Check />} Approve and submit
                        </Button>
                      ) : null}
                      {t.url.startsWith("http") && t.status !== "submitted" ? (
                        <Button size="sm" variant="outline" asChild>
                          <a href={t.url} target="_blank" rel="noreferrer">
                            <ExternalLink /> Open form
                          </a>
                        </Button>
                      ) : null}
                      {["held", "needs_you", "failed"].includes(t.status) ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => act(t.id, "retry")} disabled={busy === t.id}>
                            <RotateCcw /> Try again
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => act(t.id, "submitted")} disabled={busy === t.id}>
                            <Send /> I submitted it
                          </Button>
                        </>
                      ) : null}
                      {t.status === "queued" ? (
                        <Button size="sm" variant="outline" onClick={() => act(t.id, "cancel")} disabled={busy === t.id}>
                          <X /> Cancel
                        </Button>
                      ) : null}
                      {!["running", "submitting"].includes(t.status) ? (
                        <Button size="icon" variant="ghost" aria-label="Remove from the list" onClick={() => act(t.id, "remove")} disabled={busy === t.id}>
                          <Trash2 />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="size-5" /> Settings
          </CardTitle>
          <CardDescription>Saved as you change them.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-2">
            <p className="text-sm font-medium">When a form is filled</p>
            <RadioGroup value={s.submit} onValueChange={(v) => saveSettings({ submit: v as AutoApplySettings["submit"] })} className="grid gap-2">
              {SUBMIT_MODES.map((m) => (
                <label key={m} htmlFor={`submit-${m}`} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3", s.submit === m && "border-primary bg-primary/5")}>
                  <RadioGroupItem value={m} id={`submit-${m}`} className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium">{SUBMIT_MODE_LABELS[m].label}</span>
                    <span className="block text-xs text-muted-foreground">{SUBMIT_MODE_LABELS[m].hint}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </div>

          <Toggle
            id="auto-consent"
            label="Tick consent and “I certify” boxes for me"
            hint="Off: applications with these boxes wait for you to tick them. On: you agree to each form's consent and certification text, so read a few first. Marketing and text-message opt-ins are always left off."
            checked={s.consent}
            onChange={(v) => saveSettings({ consent: v })}
          />

          <div className="grid gap-2 sm:grid-cols-2 sm:items-center">
            <div>
              <Label htmlFor="auto-essays" className="text-sm font-medium">
                Written answers by the AI
              </Label>
              <p className="text-xs text-muted-foreground">“Why do you want to work here?” and other open questions. Always shown to you before it&apos;s sent, when “Submit when sure” is on.</p>
            </div>
            <Select value={s.essays} onValueChange={(v) => saveSettings({ essays: v as AutoApplySettings["essays"] })}>
              <SelectTrigger id="auto-essays">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="required">Only required questions</SelectItem>
                <SelectItem value="all">All open questions</SelectItem>
                <SelectItem value="none">None (leave them for me)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 sm:items-center">
            <div>
              <Label htmlFor="auto-letters" className="text-sm font-medium">
                Cover letters
              </Label>
              <p className="text-xs text-muted-foreground">
                When the job has none, the Cover letter writer writes one from your resume and the job description, saves it on the{" "}
                <Link href="/cover-letters" className="text-primary hover:underline">
                  Cover letters
                </Link>{" "}
                page and attaches it. It waits for your OK before it&apos;s sent, when “Submit when sure” is on.
              </p>
            </div>
            <Select value={s.coverLetters} onValueChange={(v) => saveSettings({ coverLetters: v as AutoApplySettings["coverLetters"] })}>
              <SelectTrigger id="auto-letters">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="required">Write one when the form requires it</SelectItem>
                <SelectItem value="always">Write one whenever the form has a place for it</SelectItem>
                <SelectItem value="never">Never (attach only letters I wrote)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Toggle
            id="auto-pick"
            label="Let the AI answer questions Job Finder doesn't know"
            hint="Like “Do you have experience with Tableau?”, answered from your resume. Legal, visa and EEO questions never go to the AI."
            checked={s.aiPick}
            onChange={(v) => saveSettings({ aiPick: v })}
          />

          <div className="grid gap-2">
            <p className="text-sm font-medium">Resume to attach</p>
            <RadioGroup value={s.resume} onValueChange={(v) => saveSettings({ resume: v as AutoApplySettings["resume"] })} className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  ["match", "The version for the job's field", `Data engineering job → your Data engineering version. None fits → ${state.resumeFile ? state.resumeFile.name : "your master resume"}.`],
                  ["file", "Always my uploaded PDF", state.resumeFile ? state.resumeFile.name : "None uploaded yet"],
                  ["generated", "Always my LaTeX resumes", "Your field's version, else your master resume (Profile & resumes)"],
                ] as const
              ).map(([value, label, hint]) => (
                <label key={value} htmlFor={`resume-${value}`} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3", s.resume === value && "border-primary bg-primary/5")}>
                  <RadioGroupItem value={value} id={`resume-${value}`} className="mt-0.5" />
                  <span className="text-sm">
                    <span className="block font-medium">{label}</span>
                    <span className="block text-xs text-muted-foreground">{hint}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              A resume you tailored for one job always goes with that job. Make versions for a field in{" "}
              <Link href="/profile" className="text-primary hover:underline">
                Profile &amp; resumes
              </Link>{" "}
              (“New industry version”).
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy === "resume"}>
                {busy === "resume" ? <Loader2 className="animate-spin" /> : <FileUp />} {state.resumeFile ? "Replace the PDF" : "Upload a PDF"}
              </Button>
              {state.resumeFile ? (
                <a href="/api/apply/resume-file?download=1" target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
                  View {state.resumeFile.name}
                </a>
              ) : null}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 sm:items-center">
            <div>
              <Label htmlFor="auto-pause" className="text-sm font-medium">
                Seconds between applications
              </Label>
              <p className="text-xs text-muted-foreground">A pause keeps it at a human pace.</p>
            </div>
            <Input
              id="auto-pause"
              type="number"
              min={5}
              max={600}
              defaultValue={s.pauseSeconds}
              onBlur={(e) => {
                const n = Math.max(5, Math.min(600, Math.round(Number(e.target.value) || 20)));
                if (n !== s.pauseSeconds) saveSettings({ pauseSeconds: n });
              }}
            />
          </div>

          <Toggle
            id="auto-tabs"
            label="Leave forms that need me open in a tab"
            hint="So you can finish them where they are. Off: the tab closes and you open it from here."
            checked={s.keepTabs}
            onChange={(v) => saveSettings({ keepTabs: v })}
          />
          <Toggle
            id="auto-enabled"
            label="Run the queue"
            hint="Off pauses Auto apply; queued applications wait."
            checked={s.enabled}
            onChange={(v) => saveSettings({ enabled: v })}
          />
        </CardContent>
      </Card>
    </div>
  );
}
