import { NextResponse } from "next/server";
import { JOB_STATUS_VALUES } from "@/lib/constants";
import { addNote, updateJobStatus } from "@/lib/jobs/actions";
import { getJob } from "@/lib/jobs/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/jobs/:id: a tracked job with notes.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const job = await getJob((await params).id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(job);
}

// PATCH /api/jobs/:id { status?, note? }: change the status (applied, interview, …) and/or add a note.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { status?: string; note?: string };
  if (body.status) {
    if (!(JOB_STATUS_VALUES as readonly string[]).includes(body.status)) {
      return NextResponse.json({ error: `status must be one of ${JOB_STATUS_VALUES.join(", ")}` }, { status: 400 });
    }
    const r = await updateJobStatus(id, body.status as (typeof JOB_STATUS_VALUES)[number]);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  }
  if (body.note?.trim()) {
    const r = await addNote(id, body.note.trim());
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  }
  return NextResponse.json(await getJob(id));
}
