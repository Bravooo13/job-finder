import { NextResponse } from "next/server";
import { z } from "zod";
import { actOnTask, getTask, reportTask } from "@/lib/apply/auto";
import { TASK_STATUSES } from "@/lib/apply/auto-schema";
import { runAsActionForAi } from "@/lib/control/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// GET /api/apply/auto/:id: one application with its answers, what it needs and what to check.
export async function GET(_request: Request, { params }: Params) {
  const task = await getTask((await params).id);
  return task ? NextResponse.json(task) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

const reportSchema = z.object({
  status: z.enum(TASK_STATUSES),
  summary: z.string().max(2000).optional(),
  needs: z.array(z.string().max(300)).max(50).optional(),
  checks: z.array(z.string().max(300)).max(80).optional(),
  answers: z
    .array(
      z.object({
        label: z.string().max(500),
        value: z.string().max(1000),
        confidence: z.enum(["high", "medium", "low"]),
        rule: z.string().max(80).optional(),
        required: z.boolean().optional(),
      }),
    )
    .max(300)
    .optional(),
  url: z.string().max(2000).optional(),
});

// PATCH /api/apply/auto/:id { status, summary?, needs?, checks?, answers?, url? }: the browser helper's report.
export async function PATCH(request: Request, { params }: Params) {
  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  const task = await reportTask((await params).id, parsed.data);
  return task ? NextResponse.json(task) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

const actionSchema = z.object({ action: z.enum(["approve", "retry", "cancel", "remove", "submitted"]) });

// POST /api/apply/auto/:id { action: "approve" | "retry" | "cancel" | "remove" | "submitted" }
// approve: submit a held application; retry: try again; submitted: you sent it yourself.
export async function POST(request: Request, { params }: Params) {
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "action must be approve, retry, cancel, remove or submitted" }, { status: 400 });
  const id = (await params).id;
  // An AI calling this follows What AI may do (approving asks you first by default).
  const asAi = await runAsActionForAi(request, "auto_apply_action", { id, action: parsed.data.action });
  if (asAi) return asAi;
  const task = await actOnTask(id, parsed.data.action);
  return task ? NextResponse.json(task) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

// DELETE /api/apply/auto/:id: remove it from the list.
export async function DELETE(_request: Request, { params }: Params) {
  const task = await actOnTask((await params).id, "remove");
  return task ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
