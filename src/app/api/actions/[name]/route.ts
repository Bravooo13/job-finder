import { NextResponse } from "next/server";
import { actorFromRequest } from "@/lib/control/context";
import { runAction } from "@/lib/control/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const STATUS = { done: 200, waiting: 202, blocked: 403, invalid: 400, error: 500 } as const;

// POST /api/actions/:name with the action's input as the JSON body. Runs it as the caller:
// an outside AI (header x-job-finder-actor: outside, as the MCP server sends) follows the
// permissions in Settings → What AI may do. Replies { status: done, result } |
// { status: waiting, requestId, message } (it's in Waiting for you) | { status: blocked, error } | { error }.
export async function POST(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const input = await request.json().catch(() => ({}));
  const { actor, via } = actorFromRequest(request);
  const out = await runAction(name, input, { actor, via });
  const body = out.status === "done" || out.status === "waiting" ? out : { ...out, error: out.message };
  return NextResponse.json(body, { status: STATUS[out.status] });
}
