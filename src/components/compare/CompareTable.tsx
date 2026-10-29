import { ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { JobStatusBadge } from "@/components/jobs/JobStatus";
import { ScoreBadge, VisaBadge } from "@/components/found/FoundList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PROVIDER_LABELS, type Source } from "@/lib/boards/types";
import { industryLabel } from "@/lib/classify/industry";
import { roleTypeLabel } from "@/lib/classify/role";
import type { CompareItem } from "@/lib/compare/queries";
import { STATE_NAMES } from "@/lib/geo/states";
import { formatDate, timeAgo } from "@/lib/utils";
import { SaveFoundButton } from "./SaveFoundButton";

const LEVELS: Record<string, string> = { internship: "Internship", entry: "Entry level / new grad", senior: "Senior", other: "Not stated" };
const NOT_STATED = <span className="text-muted-foreground">Not stated</span>;

function compareUrl(items: CompareItem[], without?: CompareItem) {
  const rest = items.filter((i) => i !== without);
  const found = rest.filter((i) => i.kind === "found").map((i) => i.id);
  const mine = rest.filter((i) => i.kind === "job").map((i) => i.id);
  const q = new URLSearchParams();
  if (found.length) q.set("found", found.join(","));
  if (mine.length) q.set("jobs", mine.join(","));
  return `/compare${q.size ? `?${q}` : ""}`;
}
export { compareUrl };

const ROWS: { label: string; cell: (j: CompareItem, all: CompareItem[]) => React.ReactNode }[] = [
  {
    label: "Match",
    cell: (j, all) => {
      if (j.score == null) return NOT_STATED;
      const best = Math.max(...all.map((x) => x.score ?? 0));
      return (
        <span className="inline-flex items-center gap-2">
          <ScoreBadge score={j.score} />
          {all.length > 1 && j.score === best ? <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Best fit</span> : null}
        </span>
      );
    },
  },
  {
    label: "Visa",
    cell: (j) =>
      (j.visa && j.visa !== "unknown") || j.h1bApprovals ? (
        <div className="grid gap-1.5">
          <div className="flex flex-wrap gap-1">
            <VisaBadge visa={j.visa} note={j.visaNote} h1bApprovals={j.h1bApprovals} h1bYear={j.h1bYear} />
          </div>
          {j.visaNote ? <p className="text-xs text-muted-foreground">“{j.visaNote}”</p> : null}
        </div>
      ) : (
        <span className="text-muted-foreground">The posting doesn&apos;t say</span>
      ),
  },
  {
    label: "Industry and role",
    cell: (j) =>
      [j.industry && j.industry !== "other" ? industryLabel(j.industry) : null, j.roleType && j.roleType !== "other" ? roleTypeLabel(j.roleType) : null]
        .filter(Boolean)
        .join(" · ") || NOT_STATED,
  },
  {
    label: "Level",
    cell: (j) => (
      <>
        {LEVELS[j.level] ?? j.level}
        {j.years ? <span className="block text-xs text-amber-700 dark:text-amber-400">Asks {j.years}+ years</span> : null}
      </>
    ),
  },
  {
    label: "Location",
    cell: (j) =>
      j.location || j.state ? (
        <>
          {j.location ?? STATE_NAMES[j.state!] ?? j.state}
          {j.workplace ? <span className="block text-xs capitalize text-muted-foreground">{j.workplace}</span> : null}
        </>
      ) : (
        NOT_STATED
      ),
  },
  { label: "Job type", cell: (j) => (j.jobType ? <span className="capitalize">{j.jobType.replace(/_/g, " ")}</span> : NOT_STATED) },
  { label: "Pay", cell: (j) => j.salary || NOT_STATED },
  { label: "Posted", cell: (j) => (j.postedAt ? <span title={formatDate(j.postedAt)}>{timeAgo(j.postedAt)}</span> : NOT_STATED) },
  { label: "Apply by", cell: (j) => (j.deadline ? formatDate(j.deadline) : NOT_STATED) },
  {
    label: "Your skills it mentions",
    cell: (j) =>
      j.keywords.length ? (
        <div className="flex flex-wrap gap-1">
          {j.keywords.slice(0, 10).map((k) => (
            <Badge key={k} variant="secondary" className="font-normal">
              {k}
            </Badge>
          ))}
        </div>
      ) : (
        NOT_STATED
      ),
  },
  {
    label: "Status",
    cell: (j) => (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {j.kind === "job" ? <JobStatusBadge status={j.status} /> : <Badge variant="outline">{j.savedJobId ? "Saved" : "Found"}</Badge>}
        <span className="text-xs text-muted-foreground">via {PROVIDER_LABELS[j.source as Source] ?? j.source}</span>
      </span>
    ),
  },
];

export function CompareTable({ items }: { items: CompareItem[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/40 align-top">
            <th scope="col" className="sticky left-0 z-10 w-36 bg-muted/90 p-3 text-left font-medium text-muted-foreground backdrop-blur">
              <span className="sr-only">Detail</span>
            </th>
            {items.map((j) => (
              <th key={`${j.kind}-${j.id}`} scope="col" className="min-w-52 p-3 text-left font-normal">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {j.external ? (
                      <a href={j.href} target="_blank" rel="noreferrer" className="font-semibold hover:underline">
                        {j.title}
                      </a>
                    ) : (
                      <Link href={j.href} className="font-semibold hover:underline">
                        {j.title}
                      </Link>
                    )}
                    <p className="text-muted-foreground">{j.company}</p>
                  </div>
                  <Button size="icon" variant="ghost" className="-mt-1 -mr-1 size-7 shrink-0" asChild>
                    <Link href={compareUrl(items, j)} aria-label={`Remove ${j.title} from the comparison`}>
                      <X />
                    </Link>
                  </Button>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.label} className="border-b align-top last:border-0">
              <th scope="row" className="sticky left-0 z-10 bg-background/95 p-3 text-left font-medium text-muted-foreground backdrop-blur">
                {row.label}
              </th>
              {items.map((j) => (
                <td key={`${j.kind}-${j.id}`} className="p-3">
                  {row.cell(j, items)}
                </td>
              ))}
            </tr>
          ))}
          <tr className="align-top">
            <th scope="row" className="sticky left-0 z-10 bg-background/95 p-3 text-left font-medium text-muted-foreground backdrop-blur">
              Next
            </th>
            {items.map((j) => (
              <td key={`${j.kind}-${j.id}`} className="p-3">
                <div className="flex flex-wrap gap-1.5">
                  {j.applyUrl ? (
                    <Button size="sm" asChild>
                      <a href={j.applyUrl} target="_blank" rel="noreferrer">
                        <ExternalLink /> Apply
                      </a>
                    </Button>
                  ) : null}
                  {j.kind === "found" && !j.savedJobId ? <SaveFoundButton id={j.id} /> : null}
                  {j.savedJobId ? (
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/jobs/${j.savedJobId}`}>Open in My jobs</Link>
                    </Button>
                  ) : null}
                </div>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
