"use client";

import { geoAlbersUsa, geoPath } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import { Loader2, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { Button } from "@/components/ui/button";
import { STATE_NAMES } from "@/lib/geo/states";
import type { PlaceGroup } from "./groups";

// The atlas file is already drawn in Albers USA at 975×610; this projection puts
// cities in the same place (the one us-atlas uses).
const W = 975;
const H = 610;
const projection = geoAlbersUsa().scale(1300).translate([487.5, 305]);
const path = geoPath();

const CODE_BY_NAME: Record<string, string> = Object.fromEntries(Object.entries(STATE_NAMES).map(([code, name]) => [name, code]));
CODE_BY_NAME["District of Columbia"] = "DC";

interface StateShape {
  code: string;
  name: string;
  d: string;
  bounds: [[number, number], [number, number]];
}
interface Shapes {
  states: StateShape[];
  borders: string;
}

let shapesPromise: Promise<Shapes> | null = null;
function loadShapes() {
  shapesPromise ??= import("us-atlas/states-albers-10m.json").then((m) => {
    const topo = ((m as { default?: unknown }).default ?? m) as Topology<{ states: GeometryCollection<{ name: string }> }>;
    const fc = feature(topo, topo.objects.states) as FeatureCollection<Geometry, { name: string }>;
    return {
      states: fc.features.map((f) => ({
        code: CODE_BY_NAME[f.properties.name] ?? f.properties.name,
        name: f.properties.name,
        d: path(f) ?? "",
        bounds: path.bounds(f),
      })),
      borders: path(mesh(topo, topo.objects.states, (a, b) => a !== b)) ?? "",
    };
  });
  return shapesPromise;
}

/** A drawn map of the US: states shaded by how many jobs they have, a bubble per city. */
export function UsMap({
  groups,
  counts,
  selected,
  focusKey,
  onState,
  onCity,
}: {
  groups: PlaceGroup[];
  counts: Record<string, number>;
  selected: string | null;
  focusKey: string | null;
  onState: (code: string | null) => void;
  onCity: (g: PlaceGroup) => void;
}) {
  const [shapes, setShapes] = useState<Shapes | null>(null);
  const [hover, setHover] = useState<{ label: string; n: number } | null>(null);

  useEffect(() => {
    let live = true;
    void loadShapes().then((s) => live && setShapes(s));
    return () => {
      live = false;
    };
  }, []);

  const max = Math.max(1, ...Object.values(counts));
  const fill = (n: number) =>
    n ? `hsl(var(--primary) / ${(0.14 + (0.66 * Math.log1p(n)) / Math.log1p(max)).toFixed(3)})` : "hsl(var(--muted))";

  const bubbles = useMemo(
    () =>
      groups.flatMap((g) => {
        const p = projection([g.lng, g.lat]);
        return p ? [{ g, x: p[0], y: p[1] }] : [];
      }),
    [groups],
  );

  // Zoom to the selected state.
  const t = useMemo(() => {
    const s = selected ? shapes?.states.find((x) => x.code === selected) : null;
    if (!s) return { k: 1, x: 0, y: 0 };
    const [[x0, y0], [x1, y1]] = s.bounds;
    const k = Math.min(8, 0.85 / Math.max((x1 - x0) / W, (y1 - y0) / H));
    return { k, x: W / 2 - (k * (x0 + x1)) / 2, y: H / 2 - (k * (y0 + y1)) / 2 };
  }, [selected, shapes]);
  const move = "transform 600ms cubic-bezier(.2,.7,.2,1)";

  return (
    <div className="relative w-full overflow-hidden rounded-lg border bg-card">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="group" aria-label="Map of the United States with jobs by state">
        <rect width={W} height={H} fill="transparent" onClick={() => onState(null)} />
        {shapes ? (
          <g style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.k})`, transition: move }}>
            {shapes.states.map((s) => {
              const n = counts[s.code] ?? 0;
              const isSel = selected === s.code;
              return (
                <path
                  key={s.code}
                  d={s.d}
                  fill={fill(n)}
                  stroke={isSel ? "hsl(var(--primary))" : "none"}
                  strokeWidth={isSel ? 2 : 0}
                  vectorEffect="non-scaling-stroke"
                  className="cursor-pointer outline-none transition-[fill] hover:brightness-95 focus-visible:stroke-[hsl(var(--ring))] dark:hover:brightness-125"
                  role="button"
                  tabIndex={n ? 0 : -1}
                  aria-label={`${s.name}: ${n} ${n === 1 ? "job" : "jobs"}`}
                  aria-pressed={isSel}
                  onMouseEnter={() => setHover({ label: s.name, n })}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => onState(isSel ? null : s.code)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onState(isSel ? null : s.code);
                    }
                  }}
                />
              );
            })}
            <path d={shapes.borders} fill="none" stroke="hsl(var(--background))" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
          </g>
        ) : null}
        {shapes
          ? bubbles.map(({ g, x, y }) => {
              const n = g.jobs.length;
              const tracked = g.jobs.some((j) => j.kind === "tracked");
              const r = Math.min(20, 2.5 + Math.sqrt(n) * 2.1);
              const focused = focusKey === g.key;
              return (
                <g key={g.key} style={{ transform: `translate(${t.k * x + t.x}px, ${t.k * y + t.y}px)`, transition: move }}>
                  <circle
                    r={r}
                    fill={tracked ? "#10b981" : "#6366f1"}
                    fillOpacity={0.55}
                    stroke={focused ? "hsl(var(--foreground))" : tracked ? "#047857" : "#4338ca"}
                    strokeWidth={focused ? 2 : 1}
                    className="cursor-pointer"
                    onMouseEnter={() => setHover({ label: g.label, n })}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => onCity(g)}
                  >
                    <title>{`${g.label}: ${n} ${n === 1 ? "job" : "jobs"}`}</title>
                  </circle>
                </g>
              );
            })
          : null}
      </svg>

      {!shapes ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> Drawing the map…
        </div>
      ) : null}

      <div className="pointer-events-none absolute top-2 left-2 rounded-md bg-background/85 px-2 py-1 text-xs shadow-sm backdrop-blur sm:top-3 sm:left-3 sm:px-2.5 sm:py-1.5 sm:text-sm">
        {hover ? (
          <>
            <b>{hover.label}</b> · {hover.n} {hover.n === 1 ? "job" : "jobs"}
          </>
        ) : selected ? (
          <b>{STATE_NAMES[selected] ?? selected}</b>
        ) : (
          <span className="text-muted-foreground">Point at a state or city</span>
        )}
      </div>

      {selected ? (
        <Button size="sm" variant="secondary" className="absolute top-2 right-2 shadow-sm sm:top-3 sm:right-3" onClick={() => onState(null)}>
          <ZoomOut /> Whole US
        </Button>
      ) : null}

      <div className="pointer-events-none absolute bottom-3 left-3 hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
        <span>Fewer</span>
        <span
          className="h-2 w-24 rounded-full"
          style={{ background: "linear-gradient(to right, hsl(var(--primary) / .14), hsl(var(--primary) / .8))" }}
        />
        <span>More jobs</span>
      </div>
    </div>
  );
}
