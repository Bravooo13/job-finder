import { NextResponse } from "next/server";
import { runSearch } from "@/lib/search/actions";

export const dynamic = "force-dynamic";

// POST /api/searches/:id/run: start a run in the background.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await runSearch(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ runId: result.data.runId });
}
