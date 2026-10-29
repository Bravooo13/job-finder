import { NextResponse } from "next/server";
import { z } from "zod";
import { buildSystemPrompt } from "@/lib/ai/context";
import { AiError, runChat, stripThinking } from "@/lib/ai/providers";
import { getAgent } from "@/lib/ai/agents";
import { findJobForUrl, rememberAnswer } from "@/lib/apply/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  question: z.string().trim().min(3).max(3000),
  maxLength: z.number().int().positive().max(20000).optional(),
  url: z.string().url().optional(),
  jobId: z.string().optional(),
  foundId: z.string().optional(),
  jobDescription: z.string().max(40000).optional(),
});

// POST /api/apply/answer: the AI writes an answer to one open application question.
// Body: { question, maxLength?, url? | jobId? | foundId?, jobDescription? } → { answer }
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  const b = parsed.data;
  const match = b.url ? await findJobForUrl(b.url) : null;
  const jobId = b.jobId ?? match?.jobId ?? undefined;
  const foundId = b.foundId ?? match?.foundId ?? undefined;
  const agent = getAgent("apply-writer")!;
  try {
    const system = await buildSystemPrompt("apply-writer", { jobId, foundId, jobDescription: b.jobDescription });
    let text = "";
    await runChat({
      system,
      messages: [
        {
          role: "user",
          content: `Question on the application form: ${b.question}${b.maxLength ? `\nLimit: ${b.maxLength} characters.` : ""}`,
        },
      ],
      maxTokens: agent.maxTokens,
      onText: (t) => (text += t),
    });
    let answer = stripThinking(text).replace(/^["“]|["”]$/g, "").trim();
    if (b.maxLength && answer.length > b.maxLength) answer = answer.slice(0, b.maxLength).replace(/\s+\S*$/, "");
    await rememberAnswer(jobId ?? null, b.question, answer, "ai");
    return NextResponse.json({ answer, jobId: jobId ?? null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof AiError ? error.message : String(error) }, { status: 502 });
  }
}
