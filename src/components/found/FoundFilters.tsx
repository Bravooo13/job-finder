"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const STATUS_TABS = [
  { value: "new", label: "To review" },
  { value: "saved", label: "Saved" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All" },
];

export function FoundFilters({
  searches,
  counts,
}: {
  searches: { id: string; name: string }[];
  counts: Record<string, number>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [hideNoSponsor, setHideNoSponsor] = useState(params.get("sponsor") === "1");
  useEffect(() => setHideNoSponsor(params.get("sponsor") === "1"), [params]);

  function update(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) update("q", q || null);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const status = params.get("status") ?? "new";
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1" role="tablist" aria-label="Status">
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={status === t.value}
            onClick={() => update("status", t.value === "new" ? null : t.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              status === t.value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
              {t.value === "all" ? total : (counts[t.value] ?? 0)}
            </span>
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search found jobs"
            placeholder="Search title, company or location"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={params.get("search") ?? "all"} onValueChange={(v) => update("search", v === "all" ? null : v)}>
            <SelectTrigger className="w-[190px]" aria-label="Filter by search">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All searches</SelectItem>
              {searches.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={params.get("min") ?? "0"} onValueChange={(v) => update("min", v === "0" ? null : v)}>
            <SelectTrigger className="w-[150px]" aria-label="Minimum score">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Any score</SelectItem>
              {[50, 60, 70, 80].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  Score {n}+
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={params.get("sort") ?? "score"} onValueChange={(v) => update("sort", v === "score" ? null : v)}>
            <SelectTrigger className="w-[160px]" aria-label="Sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="score">Best match</SelectItem>
              <SelectItem value="newest">Newest found</SelectItem>
              <SelectItem value="posted">Recently posted</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hideNoSponsor}
              onChange={(e) => {
                setHideNoSponsor(e.target.checked);
                update("sponsor", e.target.checked ? "1" : null);
              }}
              className="size-4 accent-[hsl(var(--primary))]"
            />
            Hide “no visa sponsorship”
          </label>
        </div>
      </div>
    </div>
  );
}
