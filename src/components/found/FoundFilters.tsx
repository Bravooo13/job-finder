"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROVIDER_LABELS, type Source } from "@/lib/boards/types";
import { INDUSTRIES } from "@/lib/classify/industry";
import { ROLE_TYPES } from "@/lib/classify/role";
import {
  FILTER_PARAMS,
  JOB_TYPE_FILTERS,
  LEVEL_FILTERS,
  POSTED_FILTERS,
  VISA_FILTERS,
  WORKPLACE_FILTERS,
} from "@/lib/found/filters";
import { STATE_NAMES } from "@/lib/geo/states";
import { cn } from "@/lib/utils";
import { FilterMenu, type FilterOption } from "./FilterMenu";

const STATUS_TABS = [
  { value: "new", label: "To review" },
  { value: "saved", label: "Saved" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All" },
];

export interface FacetCounts {
  industries: Record<string, number>;
  roles: Record<string, number>;
  states: Record<string, number>;
  sources: Record<string, number>;
  visa: Record<string, number>;
}

export function FoundFilters({
  searches,
  counts,
  facets,
}: {
  searches: { id: string; name: string }[];
  counts: Record<string, number>;
  facets: FacetCounts;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  function setParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    next.delete("sponsor");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }
  const update = (key: string, value: string | null) => setParams({ [key]: value });
  const listParam = (key: string) => (params.get(key) ?? "").split(",").filter(Boolean);
  const setList = (key: string) => (v: string[]) => update(key, v.length ? v.join(",") : null);

  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) update("q", q || null);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const status = params.get("status") ?? "new";
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const anyFilter = FILTER_PARAMS.some((k) => params.has(k));

  const industryOptions: FilterOption[] = INDUSTRIES.map((i) => ({ id: i.id, label: i.label, count: facets.industries[i.id] ?? 0 }));
  const roleOptions: FilterOption[] = ROLE_TYPES.map((r) => ({ id: r.id, label: r.label, count: facets.roles[r.id] ?? 0 }));
  const stateOptions: FilterOption[] = Object.entries(facets.states)
    .filter(([k]) => k)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => ({ id: k, label: STATE_NAMES[k] ? `${STATE_NAMES[k]} (${k})` : k, count: n }));
  const sourceOptions: FilterOption[] = Object.entries(facets.sources)
    .filter(([k]) => k)
    .map(([k, n]) => ({ id: k, label: PROVIDER_LABELS[k as Source] ?? k, count: n }));
  const visaCount = (ids: string[]) => ids.reduce((s, id) => s + (facets.visa[id] ?? 0), 0);
  const visaOptions: FilterOption[] = VISA_FILTERS.map((v) => ({
    id: v.id,
    label: v.label,
    hint: v.hint,
    count:
      v.id === "sponsors"
        ? visaCount(["sponsors"])
        : v.id === "red"
          ? visaCount(["no_sponsorship", "citizens_only"])
          : v.id === "nored"
            ? visaCount(["sponsors", "opt_cpt", "unknown", ""])
            : undefined,
  }));

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

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
        <Select value={params.get("sort") ?? "score"} onValueChange={(v) => update("sort", v === "score" ? null : v)}>
          <SelectTrigger className="sm:w-[170px]" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="score">Best match</SelectItem>
            <SelectItem value="posted">Recently posted</SelectItem>
            <SelectItem value="newest">Newest found</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" aria-label="Filters">
        <FilterMenu label="Visa" options={visaOptions} value={listParam("visa")} onChange={(v) => update("visa", v[0] ?? null)} multiple={false} />
        <FilterMenu label="Industry" options={industryOptions} value={listParam("industry")} onChange={setList("industry")} hideEmpty />
        <FilterMenu label="Role" options={roleOptions} value={listParam("role")} onChange={setList("role")} hideEmpty />
        <FilterMenu label="Level" options={[...LEVEL_FILTERS]} value={listParam("level")} onChange={setList("level")} />
        <FilterMenu label="Job type" options={[...JOB_TYPE_FILTERS]} value={listParam("type")} onChange={setList("type")} />
        <FilterMenu label="Workplace" options={[...WORKPLACE_FILTERS]} value={listParam("work")} onChange={setList("work")} />
        <FilterMenu label="State" options={stateOptions} value={listParam("state")} onChange={setList("state")} searchable />
        <FilterMenu label="Posted" options={[...POSTED_FILTERS]} value={listParam("posted")} onChange={(v) => update("posted", v[0] ?? null)} multiple={false} />
        <FilterMenu label="Source" options={sourceOptions} value={listParam("source")} onChange={setList("source")} />
        <FilterMenu
          label="Experience"
          options={[
            { id: "0", label: "No years asked" },
            { id: "1", label: "Up to 1 year" },
            { id: "2", label: "Up to 2 years" },
            { id: "3", label: "Up to 3 years" },
          ]}
          value={listParam("years")}
          onChange={(v) => update("years", v[0] ?? null)}
          multiple={false}
        />
        <FilterMenu
          label="Score"
          options={[50, 60, 70, 80].map((n) => ({ id: String(n), label: `${n} or higher` }))}
          value={listParam("min")}
          onChange={(v) => update("min", v[0] ?? null)}
          multiple={false}
        />
        {searches.length > 1 ? (
          <FilterMenu
            label="Search"
            options={searches.map((s) => ({ id: s.id, label: s.name }))}
            value={listParam("search")}
            onChange={(v) => update("search", v[0] ?? null)}
            multiple={false}
          />
        ) : null}
        <label className="ml-1 flex cursor-pointer items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={params.get("pay") === "1"}
            onChange={(e) => update("pay", e.target.checked ? "1" : null)}
            className="size-4 accent-[hsl(var(--primary))]"
          />
          Shows pay
        </label>
        {anyFilter ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-muted-foreground"
            onClick={() => {
              setQ("");
              setParams(Object.fromEntries(FILTER_PARAMS.map((k) => [k, null])));
            }}
          >
            <X /> Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}
