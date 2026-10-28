"use client";

import { Briefcase, Download, ExternalLink, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { JOB_STATUSES, WORKPLACES, workplaceLabel } from "@/lib/constants";
import type { JobListItem } from "@/lib/jobs/queries";
import { formatDate } from "@/lib/utils";
import { JobStatusMenu } from "./JobStatus";

const CLOSED = ["rejected", "withdrawn", "expired", "archived", "offer_declined"];

const SORTS = {
  added: { label: "Newest added", fn: (a: JobListItem, b: JobListItem) => +b.createdAt - +a.createdAt },
  applied: {
    label: "Recently applied",
    fn: (a: JobListItem, b: JobListItem) =>
      (b.dateApplied ? +b.dateApplied : 0) - (a.dateApplied ? +a.dateApplied : 0),
  },
  due: {
    label: "Apply-by date",
    fn: (a: JobListItem, b: JobListItem) =>
      (a.dueDate ? +a.dueDate : Infinity) - (b.dueDate ? +b.dueDate : Infinity),
  },
  company: { label: "Company A–Z", fn: (a: JobListItem, b: JobListItem) => a.company.localeCompare(b.company) },
  title: { label: "Title A–Z", fn: (a: JobListItem, b: JobListItem) => a.title.localeCompare(b.title) },
} as const;

type SortKey = keyof typeof SORTS;

export function JobsTable({ jobs, toolbar }: { jobs: JobListItem[]; toolbar?: React.ReactNode }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("active");
  const [workplace, setWorkplace] = useState("all");
  const [sort, setSort] = useState<SortKey>("added");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs
      .filter((j) => {
        if (status === "active" && CLOSED.includes(j.status)) return false;
        if (status !== "active" && status !== "all" && j.status !== status) return false;
        if (workplace !== "all" && j.workplace !== workplace) return false;
        if (!q) return true;
        return [j.title, j.company, j.location, j.source]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q));
      })
      .sort(SORTS[sort].fn);
  }, [jobs, query, status, workplace, sort]);

  if (jobs.length === 0) {
    return (
      <EmptyState
        icon={<Briefcase className="size-8" />}
        title="No jobs yet"
        description="Add a job by pasting its link, or type in the details yourself."
        action={toolbar}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search jobs"
            placeholder="Search title, company, location or source"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[170px]" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active jobs</SelectItem>
              <SelectItem value="all">All jobs</SelectItem>
              <SelectSeparator />
              {JOB_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={workplace} onValueChange={setWorkplace}>
            <SelectTrigger className="w-[150px]" aria-label="Filter by workplace">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any workplace</SelectItem>
              {WORKPLACES.map((w) => (
                <SelectItem key={w.value} value={w.value}>
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="w-[170px]" aria-label="Sort jobs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SORTS).map(([key, s]) => (
                <SelectItem key={key} value={key}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" asChild>
            <a href="/api/jobs/export" download>
              <Download /> CSV
            </a>
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {filtered.length} of {jobs.length} jobs
      </p>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>Job</TableHead>
              <TableHead className="hidden md:table-cell">Location</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">Applied</TableHead>
              <TableHead className="hidden lg:table-cell">Source</TableHead>
              <TableHead className="hidden lg:table-cell">Added</TableHead>
              <TableHead className="w-10"><span className="sr-only">Link</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((job) => (
              <TableRow
                key={job.id}
                className="cursor-pointer"
                onClick={() => router.push(`/jobs/${job.id}`)}
              >
                <TableCell className="max-w-[320px]">
                  <a
                    href={`/jobs/${job.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      router.push(`/jobs/${job.id}`);
                    }}
                    className="block truncate font-medium hover:underline"
                  >
                    {job.title}
                  </a>
                  <div className="truncate text-sm text-muted-foreground">{job.company}</div>
                </TableCell>
                <TableCell className="hidden max-w-[220px] md:table-cell">
                  <div className="truncate text-sm">{job.location || "—"}</div>
                  {job.workplace ? (
                    <div className="text-xs text-muted-foreground">{workplaceLabel(job.workplace)}</div>
                  ) : null}
                </TableCell>
                <TableCell>
                  <JobStatusMenu jobId={job.id} status={job.status} />
                </TableCell>
                <TableCell className="hidden text-sm whitespace-nowrap sm:table-cell">
                  {formatDate(job.dateApplied) || <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="hidden text-sm lg:table-cell">{job.source || "—"}</TableCell>
                <TableCell className="hidden text-sm whitespace-nowrap text-muted-foreground lg:table-cell">
                  {formatDate(job.createdAt)}
                </TableCell>
                <TableCell>
                  {job.url ? (
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Open posting for ${job.title}`}
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  No jobs match these filters.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
