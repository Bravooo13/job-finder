"use client";

import { ExternalLink, Globe2, Loader2, Map as MapIcon, MapPin, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { JobStatusBadge } from "@/components/jobs/JobStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Place } from "@/lib/geo";
import { STATE_NAMES } from "@/lib/geo/states";
import type { MapJob } from "@/lib/map/queries";
import { lookUpCity } from "@/lib/search/actions";
import { cn } from "@/lib/utils";
import { groupByPlace, milesBetween, type PlaceGroup } from "./groups";
import { StreetMap } from "./StreetMap";
import { UsMap } from "./UsMap";

const RADIUS_MILES = 25;
const VIEW_KEY = "jf.map.view";

type Focus = { kind: "city"; key: string | null; label: string; lat: number; lng: number; state: string | null } | { kind: "state"; code: string; label: string };

function cityFocus(g: { key?: string; label: string; lat: number; lng: number; state?: string | null }): Focus {
  return { kind: "city", key: g.key ?? null, label: g.label, lat: g.lat, lng: g.lng, state: g.state ?? null };
}

export function JobsMap({ points, remote }: { points: MapJob[]; remote: { tracked: number; found: number } }) {
  const [view, setView] = useState<"us" | "street">("us");
  const [showFound, setShowFound] = useState(true);
  const [showTracked, setShowTracked] = useState(true);
  const [minScore, setMinScore] = useState(0);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [looking, startLook] = useTransition();

  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "street") setView("street");
    } catch {}
  }, []);
  function pickView(v: "us" | "street") {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  }

  const visible = useMemo(
    () =>
      points.filter(
        (p) =>
          ((p.kind === "found" && showFound) || (p.kind === "tracked" && showTracked)) &&
          (p.kind === "tracked" || (p.score ?? 0) >= minScore),
      ),
    [points, showFound, showTracked, minScore],
  );
  const groups = useMemo(() => groupByPlace(visible), [visible]);
  const stateCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of visible) if (p.state) out[p.state] = (out[p.state] ?? 0) + 1;
    return out;
  }, [visible]);
  const topStates = useMemo(
    () =>
      Object.entries(stateCounts)
        .filter(([code]) => code.length === 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6),
    [stateCounts],
  );

  const focusJobs = useMemo(() => {
    if (!focus) return [];
    const rank = (a: MapJob, b: MapJob) =>
      (b.kind === "tracked" ? 1 : 0) - (a.kind === "tracked" ? 1 : 0) || (b.score ?? 0) - (a.score ?? 0);
    if (focus.kind === "state") return visible.filter((p) => p.state === focus.code).sort(rank);
    return visible.filter((p) => milesBetween(focus, p) <= RADIUS_MILES).sort(rank);
  }, [focus, visible]);

  const selectedState = focus?.kind === "state" ? focus.code : focus?.kind === "city" ? focus.state : null;
  const pickCity = (g: PlaceGroup) => setFocus(cityFocus(g));
  const pickState = (code: string | null) => setFocus(code ? { kind: "state", code, label: STATE_NAMES[code] ?? code } : null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(() => startLook(async () => setSuggestions(await lookUpCity(query))), 250);
    return () => clearTimeout(t);
  }, [query]);

  const topCities = groups.slice(0, 8);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Find a city"
              placeholder="Find a city, e.g. Chicago"
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onBlur={() => setTimeout(() => setSuggestions([]), 150)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setSuggestions([]);
                if (e.key === "Enter" && suggestions[0]) {
                  setFocus(cityFocus({ ...suggestions[0], state: suggestions[0].country === "US" ? suggestions[0].admin : null }));
                  setQuery("");
                }
              }}
            />
            {looking ? <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" /> : null}
            {suggestions.length && query ? (
              <ul className="absolute z-[1200] mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md" role="listbox">
                {suggestions.map((s) => (
                  <li key={s.label}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => {
                        setFocus(cityFocus({ ...s, state: s.country === "US" ? s.admin : null }));
                        setQuery("");
                      }}
                    >
                      {s.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className="flex rounded-md border p-0.5" role="radiogroup" aria-label="Map style">
              {(
                [
                  ["us", "US map", MapIcon],
                  ["street", "Street map", Globe2],
                ] as const
              ).map(([v, label, Icon]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={view === v}
                  onClick={() => pickView(v)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded px-2 py-1",
                    view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  <Icon className="size-3.5" /> {label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={showFound} onChange={(e) => setShowFound(e.target.checked)} className="size-4 accent-[#6366f1]" />
              <span className="size-2.5 rounded-full bg-[#6366f1]" /> Found
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={showTracked} onChange={(e) => setShowTracked(e.target.checked)} className="size-4 accent-[#10b981]" />
              <span className="size-2.5 rounded-full bg-[#10b981]" /> My jobs
            </label>
            <label className="flex items-center gap-1.5">
              Score
              <select
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                className="rounded-md border bg-background px-2 py-1 text-sm"
                aria-label="Minimum score"
              >
                {[0, 50, 60, 70, 80].map((n) => (
                  <option key={n} value={n}>
                    {n ? `${n}+` : "Any"}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {view === "us" ? (
          <UsMap
            groups={groups}
            counts={stateCounts}
            selected={selectedState}
            focusKey={focus?.kind === "city" ? focus.key : null}
            onState={pickState}
            onCity={pickCity}
          />
        ) : (
          <StreetMap groups={groups} focus={focus?.kind === "city" ? focus : null} onCity={pickCity} />
        )}
        <p className="text-xs text-muted-foreground">
          {visible.length.toLocaleString()} {visible.length === 1 ? "job" : "jobs"} in {groups.length.toLocaleString()}{" "}
          {groups.length === 1 ? "place" : "places"}
          {remote.found + remote.tracked > 0
            ? ` · ${remote.found + remote.tracked} remote ${remote.found + remote.tracked === 1 ? "job" : "jobs"} without a city aren't on the map`
            : ""}
          {view === "us" ? " · Only US places are drawn" : ""}
        </p>
      </div>

      <aside className="flex min-h-0 flex-col gap-3 rounded-lg border bg-card p-4 lg:max-h-[calc(62vh+52px)]">
        {focus ? (
          <>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-1.5 font-semibold">
                  <MapPin className="size-4 text-primary" /> {focus.label}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {focus.kind === "state"
                    ? `${focusJobs.length} ${focusJobs.length === 1 ? "job" : "jobs"} in this state`
                    : `${focusJobs.length} ${focusJobs.length === 1 ? "job" : "jobs"} within ${RADIUS_MILES} miles`}
                </p>
              </div>
              <Button variant="ghost" size="icon" aria-label="Clear selection" onClick={() => setFocus(null)}>
                <X />
              </Button>
            </div>
            <ul className="-mx-1 flex min-h-0 flex-col divide-y overflow-y-auto px-1">
              {focusJobs.map((j) => (
                <li key={`${j.kind}-${j.id}`} className="py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {j.external ? (
                        <a href={j.href} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 text-sm font-medium hover:underline">
                          {j.title} <ExternalLink className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                        </a>
                      ) : (
                        <Link href={j.href} className="text-sm font-medium hover:underline">
                          {j.title}
                        </Link>
                      )}
                      <p className="truncate text-xs text-muted-foreground">
                        {j.company} · {j.place}
                      </p>
                    </div>
                    {j.kind === "tracked" ? (
                      <JobStatusBadge status={j.status} />
                    ) : (
                      <Badge variant="secondary" className="tabular-nums">
                        {j.score}
                      </Badge>
                    )}
                  </div>
                </li>
              ))}
              {focusJobs.length === 0 ? <li className="py-6 text-center text-sm text-muted-foreground">No jobs here yet.</li> : null}
            </ul>
          </>
        ) : (
          <>
            {topStates.length ? (
              <>
                <h2 className="font-semibold">Top states</h2>
                <ul className="flex flex-col gap-1">
                  {topStates.map(([code, n]) => (
                    <li key={code}>
                      <button
                        type="button"
                        onClick={() => pickState(code)}
                        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                      >
                        <span className="truncate">{STATE_NAMES[code] ?? code}</span>
                        <span className="tabular-nums text-muted-foreground">{n}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <h2 className="font-semibold">Top cities</h2>
            {topCities.length ? (
              <ul className="flex flex-col gap-1">
                {topCities.map((g) => (
                  <li key={g.key}>
                    <button
                      type="button"
                      onClick={() => pickCity(g)}
                      className={cn("flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent")}
                    >
                      <span className="truncate">{g.label}</span>
                      <span className="tabular-nums text-muted-foreground">{g.jobs.length}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Run a search or add jobs with a location to see them here.</p>
            )}
            <p className="mt-auto text-xs text-muted-foreground">Click a state, a bubble or search a city to list its jobs.</p>
          </>
        )}
      </aside>
    </div>
  );
}
