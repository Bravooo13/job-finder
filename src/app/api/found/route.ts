import { NextResponse } from "next/server";
import { filtersFromParams } from "@/lib/found/filters";
import { foundFacets, listFound } from "@/lib/found/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/found: found jobs with the same filters as the Found jobs page
// (status, q, industry, role, visa, level, type, work, state, posted, source, years, pay, min, search, sort, limit, offset).
// Add facets=1 for counts per filter option.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const filters = filtersFromParams(params);
  const { rows, total } = await listFound({ ...filters, limit: filters.limit ?? 100 });
  const facets = params.get("facets") === "1" ? await foundFacets(filters) : undefined;
  return NextResponse.json({ total, count: rows.length, jobs: rows, facets });
}
