import { ArrowLeft, Inbox, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh, DeleteSearchButton, RunButton } from "@/components/searches/RunControls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PROVIDER_LABELS, type Provider } from "@/lib/boards/types";
import { getSearch } from "@/lib/search/queries";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const s = await getSearch((await params).id);
  return { title: s?.name ?? "Search" };
}

function duration(start: Date, end: Date | null): string {
  const s = Math.round(((end ?? new Date()).getTime() - start.getTime()) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

const STATUS: Record<string, string> = {
  running: "Running",
  done: "Finished",
  failed: "Failed",
  stopped: "Stopped",
};

export default async function SearchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const search = await getSearch(id);
  if (!search) notFound();
  const run = search.runs[0];
  const pct = run && run.boardsTotal ? Math.round((run.boardsDone / run.boardsTotal) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh active={search.running} />
      <Link href="/searches" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Searches
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{search.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Checks {search.boardCount.toLocaleString()} company boards on{" "}
            {search.sources.map((s) => PROVIDER_LABELS[s as Provider]).join(", ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RunButton searchId={search.id} running={search.running} />
          <Button variant="outline" asChild>
            <Link href={`/found?search=${search.id}`}>
              <Inbox /> Review finds
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/searches/${search.id}/edit`}>
              <Pencil /> Edit
            </Link>
          </Button>
          <DeleteSearchButton searchId={search.id} name={search.name} />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            {run ? (search.running ? "Running now" : "Last run") : "Not run yet"}
            {run ? <Badge variant={run.status === "failed" ? "destructive" : "secondary"}>{STATUS[run.status] ?? run.status}</Badge> : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {run ? (
            <div className="flex flex-col gap-4">
              {search.running ? (
                <div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {run.boardsDone.toLocaleString()} of {run.boardsTotal.toLocaleString()} companies checked · {duration(run.startedAt, null)}
                  </p>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Companies checked" value={run.boardsDone.toLocaleString()} />
                <Stat label="Postings read" value={run.postingsSeen.toLocaleString()} />
                <Stat label="Matched" value={run.matched.toLocaleString()} />
                <Stat label="New for you" value={run.newJobs.toLocaleString()} />
              </div>
              {run.message ? <p className="text-sm text-muted-foreground">{run.message}</p> : null}
              {run.errors.length ? (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">
                    {run.errors.length} {run.errors.length === 1 ? "board" : "boards"} couldn&apos;t be read (usually closed or moved boards)
                  </summary>
                  <ul className="mt-2 max-h-48 overflow-y-auto text-xs text-muted-foreground">
                    {run.errors.slice(0, 100).map((e, i) => (
                      <li key={i}>
                        {e.board}: {e.error}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Press Run now to check every company board. It takes a few minutes; you can leave this page.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Looking for</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap gap-1.5">
              {search.titles.map((t) => (
                <Badge key={t} variant="secondary">
                  {t}
                </Badge>
              ))}
            </div>
            <p>
              <span className="text-muted-foreground">Where: </span>
              {[...search.locations, search.includeRemote ? "Remote" : null].filter(Boolean).join(", ") || "Anywhere"}
            </p>
            <p>
              <span className="text-muted-foreground">Level: </span>
              {search.levels.map((l) => (l === "internship" ? "Internships" : l === "entry" ? "Entry level" : "Any")).join(", ")}
            </p>
            <p>
              <span className="text-muted-foreground">Minimum score: </span>
              {search.minScore}
            </p>
            {search.keywords.length ? (
              <p>
                <span className="text-muted-foreground">Skills: </span>
                {search.keywords.join(", ")}
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Run history</CardTitle>
          </CardHeader>
          <CardContent>
            {search.runs.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Companies</TableHead>
                    <TableHead className="text-right">Matched</TableHead>
                    <TableHead className="text-right">New</TableHead>
                    <TableHead className="text-right">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {search.runs.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(r.startedAt, "MMM d, h:mm a")}
                        {r.trigger === "schedule" ? <span className="ml-1 text-xs text-muted-foreground">(scheduled)</span> : null}
                      </TableCell>
                      <TableCell>{STATUS[r.status] ?? r.status}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.boardsDone.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.matched.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.newJobs.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{duration(r.startedAt, r.finishedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No runs yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
