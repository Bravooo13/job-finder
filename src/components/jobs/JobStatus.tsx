"use client";

import { Check, ChevronDown } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { JOB_STATUSES, STATUS_STYLES, statusLabel, type JobStatus } from "@/lib/constants";
import { updateJobStatus } from "@/lib/jobs/actions";
import { cn } from "@/lib/utils";

export function JobStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        STATUS_STYLES[status as JobStatus] ?? STATUS_STYLES.new,
        className,
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

/** A status badge that opens a menu to change the status. */
export function JobStatusMenu({ jobId, status }: { jobId: string; status: string }) {
  const [pending, startTransition] = useTransition();

  function change(next: string) {
    if (next === status) return;
    startTransition(async () => {
      const result = await updateJobStatus(jobId, next);
      if (result.ok) toast.success(`Moved to ${statusLabel(next)}`);
      else toast.error(result.error);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex items-center gap-1 rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          pending && "opacity-60",
        )}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Status: ${statusLabel(status)}. Change status`}
      >
        <JobStatusBadge status={status} />
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        {JOB_STATUSES.map((s) => (
          <DropdownMenuItem key={s.value} onSelect={() => change(s.value)}>
            <Check className={cn("size-4", s.value === status ? "opacity-100" : "opacity-0")} />
            {s.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
