import "server-only";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, discoveredJobs, jobs } from "@/lib/db/schema";
import { stateOf } from "@/lib/classify";
import { geocodeTrackedJobs } from "@/lib/search/actions";

export interface MapJob {
  id: string;
  kind: "tracked" | "found";
  title: string;
  company: string;
  place: string;
  state: string | null; // postal code, e.g. "NY"
  lat: number;
  lng: number;
  score: number | null;
  status: string;
  href: string; // link inside the app or to the posting
  external: boolean;
}

export async function getMapData() {
  await geocodeTrackedJobs();
  const [tracked, found, remoteTracked, remoteFound] = await Promise.all([
    db
      .select({
        id: jobs.id,
        title: jobs.title,
        company: companies.name,
        place: jobs.place,
        location: jobs.location,
        lat: jobs.lat,
        lng: jobs.lng,
        status: jobs.status,
        score: jobs.matchScore,
      })
      .from(jobs)
      .innerJoin(companies, eq(jobs.companyId, companies.id))
      .where(and(isNotNull(jobs.lat), isNotNull(jobs.lng))),
    db
      .select({
        id: discoveredJobs.id,
        title: discoveredJobs.title,
        company: discoveredJobs.company,
        place: discoveredJobs.place,
        state: discoveredJobs.state,
        location: discoveredJobs.location,
        lat: discoveredJobs.lat,
        lng: discoveredJobs.lng,
        status: discoveredJobs.status,
        score: discoveredJobs.score,
        url: discoveredJobs.url,
      })
      .from(discoveredJobs)
      .where(and(isNotNull(discoveredJobs.lat), isNotNull(discoveredJobs.lng), eq(discoveredJobs.status, "new"))),
    db.select({ n: sql<number>`count(*)` }).from(jobs).where(and(eq(jobs.remote, true), sql`${jobs.lat} is null`)),
    db
      .select({ n: sql<number>`count(*)` })
      .from(discoveredJobs)
      .where(and(eq(discoveredJobs.remote, true), sql`${discoveredJobs.lat} is null`, inArray(discoveredJobs.status, ["new"]))),
  ]);

  const points: MapJob[] = [
    ...tracked.map((j) => ({
      id: j.id,
      kind: "tracked" as const,
      title: j.title,
      company: j.company,
      place: j.place ?? "",
      state: stateOf(j.place, j.location),
      lat: j.lat!,
      lng: j.lng!,
      score: j.score,
      status: j.status,
      href: `/jobs/${j.id}`,
      external: false,
    })),
    ...found.map((j) => ({
      id: j.id,
      kind: "found" as const,
      title: j.title,
      company: j.company,
      place: j.place ?? "",
      state: j.state && j.state.length === 2 ? j.state : stateOf(j.place, j.location),
      lat: j.lat!,
      lng: j.lng!,
      score: j.score,
      status: j.status,
      href: j.url,
      external: true,
    })),
  ];
  return { points, remote: { tracked: remoteTracked[0]?.n ?? 0, found: remoteFound[0]?.n ?? 0 } };
}
