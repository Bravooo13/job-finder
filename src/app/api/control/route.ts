import { NextResponse } from "next/server";
import { spendStatus, waitingCounts } from "@/lib/control/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/control: how many things wait for you and today's AI spending (for the sidebar badge).
export async function GET() {
  const [waiting, spend] = await Promise.all([waitingCounts(), spendStatus()]);
  return NextResponse.json({ waiting, spend });
}
