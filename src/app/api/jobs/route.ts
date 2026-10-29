import { NextResponse } from "next/server";
import { listJobs } from "@/lib/jobs/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/jobs?status=applied: the jobs you track (My jobs).
export async function GET(request: Request) {
  const status = new URL(request.url).searchParams.get("status");
  const rows = await listJobs();
  const jobs = status ? rows.filter((j) => status.split(",").includes(j.status)) : rows;
  return NextResponse.json({ count: jobs.length, jobs });
}
