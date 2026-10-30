import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getApplyProfile, saveApplyProfile } from "@/lib/apply/profile";
import { runAsActionForAi } from "@/lib/control/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/apply/profile: your standard application answers (filled in from your resume where you haven't set them).
export async function GET() {
  return NextResponse.json(await getApplyProfile());
}

// PUT /api/apply/profile: change any of them.
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const asAi = await runAsActionForAi(request, "update_apply_profile", { changes: body });
    if (asAi) return asAi;
    return NextResponse.json(await saveApplyProfile(body));
  } catch (error) {
    const message = error instanceof ZodError ? error.issues[0]?.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
