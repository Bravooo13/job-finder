import "server-only";
import { NextResponse } from "next/server";
import { actorFromRequest } from "./context";
import { runAction } from "./run";
import { AI_ACTORS } from "./shared";

/**
 * For the older JSON endpoints: when an AI (not a Job Finder page or the browser
 * helper) calls one that does something sensitive, run it as the matching action
 * so the permissions apply. Returns null for everyone else (carry on as usual).
 */
export async function runAsActionForAi(request: Request, name: string, input: unknown): Promise<NextResponse | null> {
  const who = actorFromRequest(request);
  if (!AI_ACTORS.includes(who.actor)) return null;
  const out = await runAction(name, input, who);
  if (out.status === "done") return NextResponse.json(out.result);
  if (out.status === "waiting") return NextResponse.json(out, { status: 202 });
  return NextResponse.json({ ...out, error: out.message }, { status: out.status === "blocked" ? 403 : out.status === "invalid" ? 400 : 500 });
}
