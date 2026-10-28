import { NextResponse } from "next/server";
import { createSearch } from "@/lib/search/actions";
import { newSearchDefaults } from "@/lib/search/defaults";
import { listSearches } from "@/lib/search/queries";
import type { SearchFormValues } from "@/lib/search/schema";

export const dynamic = "force-dynamic";

// GET /api/searches: your searches with their latest run.
export async function GET() {
  return NextResponse.json({ searches: await listSearches() });
}

// POST /api/searches: create a search. Lists may be arrays or comma/newline text.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  const text = (v: unknown) => (Array.isArray(v) ? v.join("\n") : typeof v === "string" ? v : undefined);
  const base = newSearchDefaults(typeof body.resumeId === "string" ? body.resumeId : "");
  const values: SearchFormValues = {
    ...base,
    ...(body as Partial<SearchFormValues>),
    titles: text(body.titles) ?? base.titles,
    keywords: text(body.keywords) ?? base.keywords,
    excludeWords: text(body.excludeWords) ?? base.excludeWords,
    locations: text(body.locations) ?? base.locations,
  };
  const result = await createSearch(values);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ id: result.data.id });
}
