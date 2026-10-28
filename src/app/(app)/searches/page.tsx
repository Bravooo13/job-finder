import { CalendarClock, Plus, Radar } from "lucide-react";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/layout/PageHeader";
import { AutoRefresh, RunButton } from "@/components/searches/RunControls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listSearches } from "@/lib/search/queries";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Searches" };
export const dynamic = "force-dynamic";

function hourLabel(h: number) {
  return new Date(2000, 0, 1, h).toLocaleTimeString("en-US", { hour: "numeric" });
}

export default async function SearchesPage() {
  const searches = await listSearches();
  const anyRunning = searches.some((s) => s.running);

  const newButton = (
    <Button asChild>
      <Link href="/searches/new">
        <Plus /> New search
      </Link>
    </Button>
  );

  return (
    <>
      <AutoRefresh active={anyRunning} />
      <PageHeader
        title="Searches"
        description="Saved searches check thousands of company job boards and collect the jobs that fit you."
        actions={searches.length ? newButton : undefined}
      />
      {searches.length === 0 ? (
        <EmptyState
          icon={<Radar className="size-8" />}
          title="No searches yet"
          description="Tell Job Finder what roles and places you want. It checks every company board it knows and scores each job against your resume."
          action={newButton}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {searches.map((s) => {
            const run = s.lastRun;
            return (
              <Card key={s.id} className="relative">
                <CardContent className="flex h-full flex-col gap-3 pt-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/searches/${s.id}`} className="font-semibold after:absolute after:inset-0 hover:underline">
                        {s.name}
                      </Link>
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{s.titles.join(", ")}</p>
                    </div>
                    <div className="relative z-10 shrink-0">
                      <RunButton searchId={s.id} running={s.running} size="sm" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {s.levels.map((l) => (
                      <Badge key={l} variant="secondary">
                        {l === "internship" ? "Internships" : l === "entry" ? "Entry level" : "Any level"}
                      </Badge>
                    ))}
                    {s.locations.slice(0, 3).map((l) => (
                      <Badge key={l} variant="outline">
                        {l}
                      </Badge>
                    ))}
                    {s.includeRemote ? <Badge variant="outline">Remote</Badge> : null}
                  </div>
                  <div className="mt-auto grid grid-cols-3 gap-2 border-t pt-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">To review</p>
                      <p className="font-semibold tabular-nums">{s.found.new}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Saved</p>
                      <p className="font-semibold tabular-nums">{s.found.saved}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Last run</p>
                      <p className="truncate font-medium">
                        {s.running
                          ? `Running… ${run?.boardsDone ?? 0}/${run?.boardsTotal ?? 0}`
                          : run
                            ? timeAgo(run.startedAt)
                            : "Never"}
                      </p>
                    </div>
                  </div>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarClock className="size-3.5" />
                    {s.scheduleHour != null ? `Runs daily at ${hourLabel(s.scheduleHour)}` : "Runs when you press Run"}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
