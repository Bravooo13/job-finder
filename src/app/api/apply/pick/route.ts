import { NextResponse } from "next/server";
import { z } from "zod";
import { buildSystemPrompt } from "@/lib/ai/context";
import { forApplying } from "@/lib/ai/models";
import { AiError, runChat, stripThinking } from "@/lib/ai/providers";
import { getAiSettings } from "@/lib/ai/settings";
import { findJobForUrl } from "@/lib/apply/jobs";
import { asRequester } from "@/lib/control/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const fieldSchema = z.object({
  key: z.string().max(200),
  label: z.string().max(2000),
  type: z.string().max(40),
  options: z.array(z.string().max(500)).max(200).optional(),
  multiple: z.boolean().optional(),
  maxLength: z.number().int().positive().optional(),
});

const bodySchema = z.object({
  url: z.string().url().optional(),
  jobId: z.string().nullish(),
  foundId: z.string().nullish(),
  fields: z.array(fieldSchema).min(1).max(30),
});

// Questions the AI must never answer: these come from My answers or from you.
const OFF_LIMITS = /sponsor|authori[sz]|visa|citizen|green card|permanent resident|immigration|clearance|itar|export|u\.?s\.? person|consent|certif|acknowledg|agree|attest|gender|race|racial|ethnic|veteran|disabilit|criminal|convict|salary|compensation|signature|social security|date of birth/i;

const PROMPT = `You now fill in short questions on a job application form for the user, using only their resume, what they wrote about themselves and the job description.

Reply with JSON only, no other text:
{"answers":[{"key":"<the field key>","value":<answer>}]}

Rules:
- For a field with options, the value must be exactly one of the options (copied character for character), or a list of options when "multiple" is true.
- For a field without options, the value is a short plain answer (a number of years, a yes/no, a few words).
- When the resume doesn't support an answer, use null. Never invent experience, numbers, employers or skills.
- Yes/no questions about experience: "Yes" only when the resume shows it.`;

// POST /api/apply/pick: the AI answers choice and short questions the answer engine didn't know.
// Body: { url? | jobId? | foundId?, fields: [{ key, label, type, options?, multiple? }] } → { answers: [{ key, value }] }
export async function POST(request: Request) {
  return asRequester(request, () => pick(request));
}

async function pick(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  const b = parsed.data;
  const fields = b.fields.filter((f) => !OFF_LIMITS.test(f.label) && f.type !== "file" && f.type !== "textarea");
  if (!fields.length) return NextResponse.json({ answers: [] });
  const match = b.url ? await findJobForUrl(b.url) : null;
  try {
    const system = `${await buildSystemPrompt("apply-writer", { jobId: b.jobId ?? match?.jobId ?? undefined, foundId: b.foundId ?? match?.foundId ?? undefined })}\n\n${PROMPT}`;
    const questions = fields.map((f) => ({
      key: f.key,
      question: f.label.replace(/\s+/g, " ").trim(),
      ...(f.options?.length ? { options: f.options } : {}),
      ...(f.multiple ? { multiple: true } : {}),
    }));
    let text = "";
    await runChat(
      { system, messages: [{ role: "user", content: JSON.stringify({ questions }) }], maxTokens: 1500, feature: "apply-pick", onText: (t) => (text += t) },
      forApplying(await getAiSettings()),
    );
    const json = /\{[\s\S]*\}/.exec(stripThinking(text).replace(/```(?:json)?/g, ""))?.[0];
    const out = json ? (JSON.parse(json) as { answers?: { key?: string; value?: unknown }[] }) : {};
    const answers: { key: string; value: string | string[] }[] = [];
    for (const a of out.answers ?? []) {
      const f = fields.find((x) => x.key === a.key);
      if (!f || a.value === null || a.value === undefined) continue;
      const exact = (v: unknown) => (typeof v === "string" ? f.options?.find((o) => o.trim().toLowerCase() === v.trim().toLowerCase()) : undefined);
      if (f.options?.length) {
        const list = (Array.isArray(a.value) ? a.value : [a.value]).map(exact).filter((x): x is string => Boolean(x));
        if (list.length) answers.push({ key: f.key, value: f.multiple ? list : list[0] });
      } else if (typeof a.value === "string" || typeof a.value === "number") {
        const v = String(a.value).trim();
        if (v) answers.push({ key: f.key, value: f.maxLength ? v.slice(0, f.maxLength) : v });
      }
    }
    return NextResponse.json({ answers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof AiError ? error.message : String(error) }, { status: 502 });
  }
}
