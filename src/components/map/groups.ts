import type { MapJob } from "@/lib/map/queries";

export interface PlaceGroup {
  key: string;
  label: string;
  state: string | null;
  lat: number;
  lng: number;
  jobs: MapJob[];
}

/** One group per place (rounded coordinates), biggest first. */
export function groupByPlace(points: MapJob[]): PlaceGroup[] {
  const groups = new Map<string, PlaceGroup>();
  for (const p of points) {
    const key = `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
    const g = groups.get(key);
    if (g) g.jobs.push(p);
    else groups.set(key, { key, label: p.place, state: p.state, lat: p.lat, lng: p.lng, jobs: [p] });
  }
  return Array.from(groups.values()).sort((a, b) => b.jobs.length - a.jobs.length);
}

export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}
