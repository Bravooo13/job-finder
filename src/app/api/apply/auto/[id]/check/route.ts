import { NextResponse } from "next/server";
import { z } from "zod";
import { getAutoSettings, getTask } from "@/lib/apply/auto";
import { filledFieldSchema } from "@/lib/apply/auto-schema";
import { decideSubmit } from "@/lib/apply/decide";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  fields: z.array(filledFieldSchema).max(400),
  blockers: z.array(z.string().max(300)).max(20).optional(),
});

// POST /api/apply/auto/:id/check { fields: [{ label, required, filled, value, confidence, ai, consent }], blockers? }
// → { action: "submit" | "hold" | "needs_you", needs, checks, summary }: whether to press Submit, by your Auto apply settings.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  const task = await getTask((await params).id);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const settings = await getAutoSettings();
  return NextResponse.json(decideSubmit(settings.submit, parsed.data.fields, { approved: task.approved, blockers: parsed.data.blockers }));
}
