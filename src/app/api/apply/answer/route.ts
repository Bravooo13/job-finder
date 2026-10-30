import { NextResponse } from "next/server";
import { AiError } from "@/lib/ai/providers";
import { writeApplicationAnswer, writeAnswerSchema } from "@/lib/apply/write-answer";
import { asRequester } from "@/lib/control/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/apply/answer: the AI writes an answer to one open application question.
// Body: { question, maxLength?, url? | jobId? | foundId?, jobDescription? } → { answer, jobId }
export async function POST(request: Request) {
  const parsed = writeAnswerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  try {
    return NextResponse.json(await asRequester(request, () => writeApplicationAnswer(parsed.data)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof AiError ? error.message : String(error) }, { status: 502 });
  }
}
