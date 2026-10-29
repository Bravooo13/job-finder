import { NextResponse } from "next/server";
import { saveFoundJob } from "@/lib/search/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/found/:id/save: adds a found job to My jobs. Returns { jobId }.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await saveFoundJob(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json(result.data);
}
