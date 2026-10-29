"use client";

import "leaflet/dist/leaflet.css";
import type { CircleMarker, LayerGroup, Map as LeafletMap, TileLayer } from "leaflet";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import type { PlaceGroup } from "./groups";

/** Street map (OpenStreetMap data through CARTO's free tiles; no key needed). */
export function StreetMap({
  groups,
  focus,
  onCity,
}: {
  groups: PlaceGroup[];
  focus: { lat: number; lng: number } | null;
  onCity: (g: PlaceGroup) => void;
}) {
  const { resolvedTheme } = useTheme();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const tiles = useRef<TileLayer | null>(null);
  const [ready, setReady] = useState(false);
  const onCityRef = useRef(onCity);
  onCityRef.current = onCity;

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

  useEffect(() => {
    if (!ready || !map.current) return;
    void import("leaflet").then((L) => {
      tiles.current?.remove();
      const style = resolvedTheme === "dark" ? "dark_all" : "light_all";
      tiles.current = L.tileLayer(`https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`, {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map.current!);
    });
  }, [ready, resolvedTheme]);

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
        marker.on("click", () => onCityRef.current(g));
        marker.addTo(layer.current!);
      }
    });
  }, [ready, groups]);

  useEffect(() => {
    if (focus && map.current) map.current.flyTo([focus.lat, focus.lng], Math.max(map.current.getZoom(), 9), { duration: 0.8 });
  }, [focus]);

  return (
    <div
      ref={container}
      className="h-[62vh] min-h-[420px] w-full overflow-hidden rounded-lg border bg-muted"
      role="application"
      aria-label="Street map of jobs"
    />
  );
}
