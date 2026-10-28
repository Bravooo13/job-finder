"use client";

import "leaflet/dist/leaflet.css";
import type { CircleMarker, LayerGroup, Map as LeafletMap } from "leaflet";
import { ExternalLink, Loader2, MapPin, Search, X } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { JobStatusBadge } from "@/components/jobs/JobStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Place } from "@/lib/geo";
import type { MapJob } from "@/lib/map/queries";
import { lookUpCity } from "@/lib/search/actions";
import { cn } from "@/lib/utils";

const RADIUS_MILES = 25;

function miles(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

interface Group {
  key: string;
  label: string;
  lat: number;
  lng: number;
  jobs: MapJob[];
}

function groupByPlace(points: MapJob[]): Group[] {
  const groups = new Map<string, Group>();
  for (const p of points) {
    const key = `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
    const g = groups.get(key);
    if (g) g.jobs.push(p);
    else groups.set(key, { key, label: p.place, lat: p.lat, lng: p.lng, jobs: [p] });
  }
  return Array.from(groups.values()).sort((a, b) => b.jobs.length - a.jobs.length);
}

export function JobsMap({ points, remote }: { points: MapJob[]; remote: { tracked: number; found: number } }) {
  const { resolvedTheme } = useTheme();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const tiles = useRef<L.TileLayer | null>(null);
  const [ready, setReady] = useState(false);
  const [showFound, setShowFound] = useState(true);
  const [showTracked, setShowTracked] = useState(true);
  const [minScore, setMinScore] = useState(0);
  const [focus, setFocus] = useState<{ label: string; lat: number; lng: number } | null>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [looking, startLook] = useTransition();

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

  const focusJobs = useMemo(() => {
    if (!focus) return [];
    return visible
      .map((p) => ({ p, d: miles(focus, p) }))
      .filter((x) => x.d <= RADIUS_MILES)
      .sort((a, b) => (b.p.kind === "tracked" ? 1 : 0) - (a.p.kind === "tracked" ? 1 : 0) || (b.p.score ?? 0) - (a.p.score ?? 0))
      .map((x) => x.p);
  }, [focus, visible]);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !container.current || map.current) return;
      const m = L.map(container.current, { zoomControl: true, worldCopyJump: true }).setView([39.5, -96], 4);
      map.current = m;
      layer.current = L.layerGroup().addTo(m);
      setReady(true);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Light or dark map tiles.
  useEffect(() => {
    if (!ready || !map.current) return;
    void import("leaflet").then((L) => {
      tiles.current?.remove();
      const style = resolvedTheme === "dark" ? "dark_all" : "light_all";
      tiles.current = L.tileLayer(`https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map.current!);
    });
  }, [ready, resolvedTheme]);

  // Draw one bubble per place.
  useEffect(() => {
    if (!ready || !layer.current) return;
    void import("leaflet").then((L) => {
      layer.current!.clearLayers();
      for (const g of groups) {
        const tracked = g.jobs.some((j) => j.kind === "tracked");
        const n = g.jobs.length;
        const marker: CircleMarker = L.circleMarker([g.lat, g.lng], {
          radius: Math.min(34, 6 + Math.sqrt(n) * 3.2),
          color: tracked ? "#059669" : "#4f46e5",
          weight: 1.5,
          fillColor: tracked ? "#10b981" : "#6366f1",
          fillOpacity: 0.45,
        });
        marker.bindTooltip(`${g.label}: ${n} ${n === 1 ? "job" : "jobs"}`, { direction: "top" });
        marker.on("click", () => setFocus({ label: g.label, lat: g.lat, lng: g.lng }));
        marker.addTo(layer.current!);
      }
    });
  }, [ready, groups]);

  // Zoom to the selected city.
  useEffect(() => {
    if (focus && map.current) map.current.flyTo([focus.lat, focus.lng], Math.max(map.current.getZoom(), 9), { duration: 0.8 });
  }, [focus]);

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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
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
                  setFocus({ label: suggestions[0].label, lat: suggestions[0].lat, lng: suggestions[0].lng });
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
                        setFocus({ label: s.label, lat: s.lat, lng: s.lng });
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
        <div
          ref={container}
          className="h-[62vh] min-h-[420px] w-full overflow-hidden rounded-lg border bg-muted"
          role="application"
          aria-label="Map of jobs"
        />
        <p className="text-xs text-muted-foreground">
          {visible.length.toLocaleString()} {visible.length === 1 ? "job" : "jobs"} in {groups.length.toLocaleString()}{" "}
          {groups.length === 1 ? "place" : "places"}
          {remote.found + remote.tracked > 0
            ? ` · ${remote.found + remote.tracked} remote ${remote.found + remote.tracked === 1 ? "job" : "jobs"} without a city aren't on the map`
            : ""}
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
                  {focusJobs.length} jobs within {RADIUS_MILES} miles
                </p>
              </div>
              <Button variant="ghost" size="icon" aria-label="Clear city" onClick={() => setFocus(null)}>
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
            <h2 className="font-semibold">Top places</h2>
            {topCities.length ? (
              <ul className="flex flex-col gap-1">
                {topCities.map((g) => (
                  <li key={g.key}>
                    <button
                      type="button"
                      onClick={() => setFocus({ label: g.label, lat: g.lat, lng: g.lng })}
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
            <p className="mt-auto text-xs text-muted-foreground">Click a bubble or search a city to list its jobs.</p>
          </>
        )}
      </aside>
    </div>
  );
}
