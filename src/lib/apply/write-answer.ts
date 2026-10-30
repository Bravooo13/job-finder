import "server-only";
import { z } from "zod";
import { getAgent } from "@/lib/ai/agents";
import { buildSystemPrompt } from "@/lib/ai/context";
import { forApplying } from "@/lib/ai/models";
import { runChat, stripThinking } from "@/lib/ai/providers";
import { getAiSettings } from "@/lib/ai/settings";
import { findJobForUrl, rememberAnswer } from "./jobs";

export const writeAnswerSchema = z.object({
  question: z.string().trim().min(3).max(3000).describe("The question as shown on the form."),
  maxLength: z.number().int().positive().max(20000).optional().describe("Character limit, if any."),
  url: z.string().url().optional().describe("The posting or application URL."),
  jobId: z.string().nullish().describe("A My jobs id."),
  foundId: z.string().nullish().describe("A found job id."),
  jobDescription: z.string().max(40000).optional(),
});
export type WriteAnswerInput = z.infer<typeof writeAnswerSchema>;

/** The Application answers agent writes one open question's answer (remembered for the job). */
export async function writeApplicationAnswer(b: WriteAnswerInput): Promise<{ answer: string; jobId: string | null }> {
  const match = b.url ? await findJobForUrl(b.url) : null;
  const jobId = b.jobId ?? match?.jobId ?? undefined;
  const foundId = b.foundId ?? match?.foundId ?? undefined;
  const agent = getAgent("apply-writer")!;
  const system = await buildSystemPrompt("apply-writer", { jobId, foundId, jobDescription: b.jobDescription });
  let text = "";
  await runChat(
    {
      system,
      messages: [{ role: "user", content: `Question on the application form: ${b.question}${b.maxLength ? `\nLimit: ${b.maxLength} characters.` : ""}` }],
      maxTokens: agent.maxTokens,
      feature: "apply-writer",
      onText: (t) => (text += t),
    },
    forApplying(await getAiSettings()),
  );
  let answer = stripThinking(text).replace(/^["“]|["”]$/g, "").trim();
  if (b.maxLength && answer.length > b.maxLength) answer = answer.slice(0, b.maxLength).replace(/\s+\S*$/, "");
  await rememberAnswer(jobId ?? null, b.question, answer, "ai");
  return { answer, jobId: jobId ?? null };
}
