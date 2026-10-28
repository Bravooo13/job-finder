import { Inbox, Radar } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { FoundFilters } from "@/components/found/FoundFilters";
import { FoundList } from "@/components/found/FoundList";
import { EmptyState, PageHeader } from "@/components/layout/PageHeader";
import { AutoRefresh } from "@/components/searches/RunControls";
import { Button } from "@/components/ui/button";
import { foundCounts, listFound, listSearchOptions, listSearches } from "@/lib/search/queries";

export const metadata = { title: "Found jobs" };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

export default async function FoundPage({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  const get = (k: string) => (Array.isArray(p[k]) ? p[k]![0] : p[k]) as string | undefined;
  const [{ rows, total }, counts, searchOptions, searches] = await Promise.all([
    listFound({
      status: get("status") ?? "new",
      searchId: get("search"),
      minScore: get("min") ? Number(get("min")) : undefined,
      hideNoSponsorship: get("sponsor") === "1",
      q: get("q"),
      sort: (get("sort") as "score" | "newest" | "posted") ?? "score",
    }),
    foundCounts(),
    listSearchOptions(),
    listSearches(),
  ]);
  const running = searches.some((s) => s.running);
  const anyFound = Object.values(counts).some((n) => n > 0);

  return (
    <>
      <AutoRefresh active={running} everyMs={5000} />
      <PageHeader
        title="Found jobs"
        description={
          running
            ? "A search is running. New matches show up here as companies are checked."
            : "Jobs your searches found, best matches first. Save the ones you like to My jobs."
        }
        actions={
          <Button variant="outline" asChild>
            <Link href="/searches">
              <Radar /> Searches
            </Link>
          </Button>
        }
      />
      {!anyFound ? (
        <EmptyState
          icon={<Inbox className="size-8" />}
          title={searches.length ? "Nothing found yet" : "Set up a search first"}
          description={
            searches.length
              ? "Run one of your searches and matching jobs will collect here."
              : "A search checks thousands of company job boards for roles that fit your resume."
          }
          action={
            <Button asChild>
              <Link href={searches.length ? "/searches" : "/searches/new"}>{searches.length ? "Go to searches" : "New search"}</Link>
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          <Suspense>
            <FoundFilters searches={searchOptions} counts={counts} />
          </Suspense>
          {rows.length ? (
            <FoundList key={JSON.stringify(p)} jobs={rows} total={total} />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">No jobs match these filters.</p>
          )}
        </div>
      )}
    </>
  );
}
