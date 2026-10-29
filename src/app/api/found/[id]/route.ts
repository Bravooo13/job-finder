import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { discoveredJobs } from "@/lib/db/schema";
import { getFoundMany } from "@/lib/found/queries";
import { setFoundStatus } from "@/lib/search/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/found/:id: one found job with its full description.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await getFoundMany([id]);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ...row.found, h1bApprovals: row.h1bApprovals, h1bYear: row.h1bYear });
}

// PATCH /api/found/:id { status: "new" | "dismissed" }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { status?: string };
  if (body.status !== "new" && body.status !== "dismissed") {
    return NextResponse.json({ error: 'status must be "new" or "dismissed"' }, { status: 400 });
  }
  const exists = await db.select({ id: discoveredJobs.id }).from(discoveredJobs).where(eq(discoveredJobs.id, id)).limit(1);
  if (!exists[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await setFoundStatus([id], body.status);
  return NextResponse.json({ ok: true });
}
