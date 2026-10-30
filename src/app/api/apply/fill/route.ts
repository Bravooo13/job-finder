import { NextResponse } from "next/server";
import { fillAnswers, fillSchema } from "@/lib/apply/fill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/apply/fill: answers for the fields of an application form.
// Body: { url, pageTitle?, fields: [{ key, label, type, options?, required?, maxLength?, hint?, multiple? }], jobId?, foundId?, auto? }
export async function POST(request: Request) {
  const parsed = fillSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  return NextResponse.json(await fillAnswers(parsed.data));
}
