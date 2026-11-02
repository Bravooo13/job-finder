import { NextResponse } from "next/server";
import { z } from "zod";
import { actOnTask, getTask, reportTask, TaskActionError } from "@/lib/apply/auto";
import { TASK_ACTIONS, TASK_STATUSES } from "@/lib/apply/auto-schema";
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
  pageNote: z.string().max(2000).optional(),
});

// PATCH /api/apply/auto/:id { status, summary?, needs?, checks?, answers?, url? }: the browser helper's report.
export async function PATCH(request: Request, { params }: Params) {
  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  const task = await reportTask((await params).id, parsed.data);
  return task ? NextResponse.json(task) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

const actionSchema = z.object({ action: z.enum(TASK_ACTIONS) });

// POST /api/apply/auto/:id { action: approve | retry | cancel | remove | submitted | send | reopen }
// approve: submit a held one; send: submit a checked (ready) one; retry: try again; submitted: you sent it
// yourself; reopen: Submit was pressed but it didn't go through, so fill and submit it again (yours to decide).
export async function POST(request: Request, { params }: Params) {
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: `action must be one of ${TASK_ACTIONS.join(", ")}` }, { status: 400 });
  const id = (await params).id;
  // An AI calling this follows What AI may do (approving asks you first by default).
  const asAi = await runAsActionForAi(request, "auto_apply_action", { id, action: parsed.data.action });
  if (asAi) return asAi;
  try {
    const task = await actOnTask(id, parsed.data.action);
    return task ? NextResponse.json(task) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    if (e instanceof TaskActionError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}

// DELETE /api/apply/auto/:id: remove it from the list.
export async function DELETE(_request: Request, { params }: Params) {
  const task = await actOnTask((await params).id, "remove");
  return task ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
