import { NextResponse } from "next/server";
import { listActions } from "@/lib/control/run";
import { GROUPS, LEVEL_LABELS } from "@/lib/control/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/actions: everything an AI can do in Job Finder, with its input (JSON Schema)
// and whether AIs may do it now (allow / ask / never). The MCP server lists these as tools.
export async function GET() {
  return NextResponse.json({ actions: await listActions(), groups: GROUPS, levels: LEVEL_LABELS });
}
