"use client";

import { CheckCircle2, ExternalLink, FileSignature, FileText, Loader2, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { VisaBadge } from "@/components/found/FoundList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { markJobApplied } from "@/lib/apply/actions";
import type { QueueItem } from "@/lib/apply/queue";
import { formatDate } from "@/lib/utils";

function Ready({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${ok ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}>
      {ok ? <CheckCircle2 className="size-3.5" /> : <span className="inline-block size-3.5 rounded-full border" />}
      {children}
    </span>
  );
}

export function ApplyQueue({ items }: { items: QueueItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (!items.length) {
    return (
      <p className="rounded-lg border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
        Nothing waiting. Save jobs from{" "}
        <Link href="/found" className="font-medium text-primary hover:underline">
          Found jobs
        </Link>{" "}
        and they line up here, ready to apply.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((j) => {
        const link = j.applyUrl || j.url;
        return (
          <li key={j.id} className="rounded-lg border bg-card p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <Link href={`/jobs/${j.id}`} className="font-medium hover:underline">
                  {j.title}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {[j.company, j.location, j.dueDate ? `apply by ${formatDate(j.dueDate)}` : null].filter(Boolean).join(" · ")}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {j.matchScore ? <Badge variant="secondary">Score {j.matchScore}</Badge> : null}
                  <VisaBadge visa={j.visa} note={j.visaNote} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  <Ready ok={Boolean(j.resumeId)}>{j.resumeId ? `Resume: ${j.resumeTitle}` : "Master resume"}</Ready>
                  <Ready ok={j.resumeHasLatex}>PDF ready</Ready>
                  <Ready ok={j.letters > 0}>Cover letter</Ready>
                  <Ready ok={j.answers > 0}>{j.answers ? `${j.answers} written answers` : "Written answers"}</Ready>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {link ? (
                  <Button size="sm" asChild>
                    <a href={link} target="_blank" rel="noreferrer">
                      <ExternalLink /> Open application
                    </a>
                  </Button>
                ) : null}
                {j.letters === 0 ? (
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/cover-letters/new?jobId=${j.id}`}>
                      <FileSignature /> Cover letter
                    </Link>
                  </Button>
                ) : null}
                {!j.resumeId ? (
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/jobs/${j.id}`}>
                      <FileText /> Tailor resume
                    </Link>
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await markJobApplied(j.id);
                      if (!r.ok) return void toast.error(r.error);
                      toast.success(`Marked “${j.title}” as applied`);
                      router.refresh();
                    })
                  }
                >
                  {pending ? <Loader2 className="animate-spin" /> : <Send />} Mark applied
                </Button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
