"use client";

import { BadgeCheck, Bookmark, Bot, ChevronDown, Columns3, ExternalLink, FileSignature, Loader2, RotateCcw, ShieldAlert, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { describeQueue, queueAutoApply } from "@/lib/apply/auto-client";
import { PROVIDER_LABELS, type Source } from "@/lib/boards/types";
import { industryLabel } from "@/lib/classify/industry";
import { roleTypeLabel } from "@/lib/classify/role";
import { getFoundDescription, saveFoundJob, setFoundStatus } from "@/lib/search/actions";
import type { FoundRow } from "@/lib/found/queries";
import { cn, timeAgo } from "@/lib/utils";

export function ScoreBadge({ score, className }: { score: number; className?: string }) {
  const tone =
    score >= 75
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
      : score >= 55
        ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200"
        : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
  return (
    <span
      className={cn("inline-flex h-9 w-11 shrink-0 flex-col items-center justify-center rounded-md text-sm font-semibold tabular-nums", tone, className)}
      title="Match score"
      aria-label={`Match score ${score}`}
    >
      {score}
    </span>
  );
}

/** Visa signal for F-1 students: what the posting says, plus the company's H-1B history. */
export function VisaBadge({
  visa,
  note,
  h1bApprovals,
  h1bYear,
}: {
  visa: string | null;
  note?: string | null;
  h1bApprovals?: number | null;
  h1bYear?: number | null;
}) {
  const warn = "gap-1 bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-200";
  const good = "gap-1 bg-emerald-100 text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-200";
  const h1b = h1bApprovals ? (
    <Badge variant="outline" className="gap-1 border-sky-300 text-sky-800 dark:border-sky-800 dark:text-sky-200" title="USCIS H-1B Employer Data Hub">
      <BadgeCheck className="size-3" /> H-1B sponsor · {h1bApprovals.toLocaleString()} approved{h1bYear ? ` (FY${h1bYear})` : ""}
    </Badge>
  ) : null;
  const main =
    visa === "sponsors" ? (
      <Badge className={good} title={note ?? undefined}>
        <BadgeCheck className="size-3" /> Sponsors visas
      </Badge>
    ) : visa === "opt_cpt" ? (
      <Badge className={good} title={note ?? undefined}>
        <BadgeCheck className="size-3" /> OPT/CPT OK
      </Badge>
    ) : visa === "no_sponsorship" ? (
      <Badge className={warn} title={note ?? undefined}>
        <ShieldAlert className="size-3" /> No visa sponsorship
      </Badge>
    ) : visa === "citizens_only" ? (
      <Badge className={warn} title={note ?? undefined}>
        <ShieldAlert className="size-3" /> US citizens / clearance
      </Badge>
    ) : null;
  return (
    <>
      {main}
      {h1b}
    </>
  );
}

function FoundCard({
  job,
  selected,
  onSelect,
}: {
  job: FoundRow;
  selected: boolean;
  onSelect: (on: boolean) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState<string | null | undefined>(undefined);
  const [pending, startTransition] = useTransition();

  function toggleDetails() {
    const next = !open;
    setOpen(next);
    if (next && description === undefined) {
      startTransition(async () => setDescription(await getFoundDescription(job.id)));
    }
  }

  function act(kind: "save" | "dismiss" | "restore") {
    startTransition(async () => {
      if (kind === "save") {
        const result = await saveFoundJob(job.id);
        if (!result.ok) return void toast.error(result.error);
        toast.success("Saved to My jobs", {
          action: { label: "Open", onClick: () => router.push(`/jobs/${result.data.jobId}`) },
        });
      } else {
        const result = await setFoundStatus([job.id], kind === "dismiss" ? "dismissed" : "new");
        if (!result.ok) return void toast.error(result.error);
      }
      router.refresh();
    });
  }

  const meta = [job.company, job.place || job.location, job.postedAt ? `posted ${timeAgo(job.postedAt)}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className={cn("rounded-lg border bg-card p-4 transition-opacity", pending && "opacity-60")}>
      <div className="flex gap-3">
        <input
          type="checkbox"
          aria-label={`Select ${job.title}`}
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          className="mt-2.5 size-4 shrink-0 accent-[hsl(var(--primary))]"
        />
        <ScoreBadge score={job.score} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <a href={job.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                {job.title}
              </a>
              <p className="truncate text-sm text-muted-foreground">{meta}</p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              {job.status === "saved" && job.jobId ? (
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/jobs/${job.jobId}`}>Open in My jobs</Link>
                </Button>
              ) : job.status === "dismissed" ? (
                <Button size="sm" variant="outline" onClick={() => act("restore")} disabled={pending}>
                  <RotateCcw /> Restore
                </Button>
              ) : (
                <>
                  <Button size="sm" onClick={() => act("save")} disabled={pending}>
                    <Bookmark /> Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => act("dismiss")} disabled={pending} aria-label={`Dismiss ${job.title}`}>
                    <X />
                  </Button>
                </>
              )}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {job.reasons.level ? <Badge variant="secondary">{job.reasons.level}</Badge> : null}
            {job.remote ? <Badge variant="secondary">Remote</Badge> : null}
            {job.salary ? <Badge variant="outline">{job.salary}</Badge> : null}
            {job.reasons.keywords.slice(0, 6).map((k) => (
              <Badge key={k} variant="outline" className="border-primary/30 text-primary">
                {k}
              </Badge>
            ))}
            {job.reasons.experienceYears ? (
              <Badge variant="outline">{job.reasons.experienceYears}+ yrs asked</Badge>
            ) : null}
            <VisaBadge visa={job.visa ?? (job.flags.includes("citizenship") ? "citizens_only" : job.flags.includes("no_sponsorship") ? "no_sponsorship" : null)} note={job.visaNote} h1bApprovals={job.h1bApprovals} h1bYear={job.h1bYear} />
            <span className="text-xs text-muted-foreground">
              {[job.industry && job.industry !== "other" ? industryLabel(job.industry) : job.sourceIndustry, job.roleType && job.roleType !== "other" ? roleTypeLabel(job.roleType) : null, `via ${PROVIDER_LABELS[job.provider as Source] ?? job.provider}`]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <button type="button" onClick={toggleDetails} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" aria-expanded={open}>
              <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
              {open ? "Hide description" : "Show description"}
            </button>
            <a href={job.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ExternalLink className="size-3.5" /> Posting
            </a>
            <Link
              href={`/cover-letters/new?foundId=${job.id}`}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <FileSignature className="size-3.5" /> Cover letter
            </Link>
          </div>
          {open ? (
            <div className="mt-2 max-h-80 overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm leading-relaxed whitespace-pre-wrap">
              {description === undefined ? <Loader2 className="size-4 animate-spin" /> : description || "No description in the listing."}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function FoundList({ jobs, total }: { jobs: FoundRow[]; total: number }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const allSelected = jobs.length > 0 && jobs.every((j) => selected.has(j.id));

  function bulk(kind: "save" | "dismiss" | "auto") {
    const ids = Array.from(selected);
    startTransition(async () => {
      if (kind === "auto") {
        const r = await queueAutoApply({ foundIds: ids });
        if (!r.ok) return void toast.error(r.error);
        toast.success(describeQueue(r.data), { action: { label: "Watch", onClick: () => router.push("/apply?tab=auto") }, duration: 8000 });
      } else if (kind === "dismiss") {
        await setFoundStatus(ids, "dismissed");
        toast.success(`Dismissed ${ids.length} jobs`);
      } else {
        for (const id of ids) await saveFoundJob(id);
        toast.success(`Saved ${ids.length} jobs to My jobs`);
      }
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => setSelected(e.target.checked ? new Set(jobs.map((j) => j.id)) : new Set())}
            className="size-4 accent-[hsl(var(--primary))]"
            aria-label="Select all shown"
          />
          Showing {jobs.length.toLocaleString()} of {total.toLocaleString()}
        </label>
        {selected.size ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => bulk("save")} disabled={pending}>
              <Bookmark /> Save {selected.size}
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulk("auto")} disabled={pending} title="Fill and send the applications from your answers (Apply → Auto apply)">
              <Bot /> Auto apply {selected.size}
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulk("dismiss")} disabled={pending}>
              <X /> Dismiss {selected.size}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={selected.size < 2 || selected.size > 6}
              title="Pick 2 to 6 jobs"
              onClick={() => router.push(`/compare?found=${Array.from(selected).join(",")}`)}
            >
              <Columns3 /> Compare
            </Button>
          </div>
        ) : null}
      </div>
      <ul className="flex flex-col gap-3">
        {jobs.map((job) => (
          <FoundCard
            key={job.id}
            job={job}
            selected={selected.has(job.id)}
            onSelect={(on) =>
              setSelected((s) => {
                const next = new Set(s);
                if (on) next.add(job.id);
                else next.delete(job.id);
                return next;
              })
            }
          />
        ))}
      </ul>
    </div>
  );
}
