import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getAutoSettings, saveAutoSettings } from "@/lib/apply/auto";
import { runAsActionForAi } from "@/lib/control/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/apply/auto/settings: how Auto apply submits, ticks consent boxes, writes answers and picks the resume.
export async function GET() {
  return NextResponse.json(await getAutoSettings());
}

// PUT /api/apply/auto/settings { submit?, consent?, essays?, aiPick?, resume?, pauseSeconds?, keepTabs?, enabled? }
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    // An AI calling this follows What AI may do (changing submit or consent asks you first by default).
    const asAi = await runAsActionForAi(request, "update_auto_apply_settings", body);
    if (asAi) return asAi;
    return NextResponse.json(await saveAutoSettings(body));
  } catch (e) {
    return NextResponse.json({ error: e instanceof ZodError ? (e.issues[0]?.message ?? "Bad settings") : String(e) }, { status: 400 });
  }
}
