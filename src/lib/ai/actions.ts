"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { db } from "@/lib/db";
import { aiThreads } from "@/lib/db/schema";
import { AGENTS, getAgent, type AgentId } from "./agents";
import type { AiStatus } from "./models";
import { AiError, listOllamaModels, runChat, stripThinking } from "./providers";
import {
  getAiSettings,
  getAiStatus,
  saveAiSettings,
  setAboutMe,
  setAgentPrompt,
  setClaudeKey,
} from "./settings";
import { getThreadMessages, listThreads, type ThreadScope } from "./threads";

const settingsSchema = z.object({
  provider: z.enum(["claude", "ollama"]),
  claudeModel: z.string().trim().min(1).max(100),
  applyModel: z.string().trim().min(1).max(100).optional(),
  ollamaUrl: z.string().trim().url("Enter a URL like http://127.0.0.1:11434").max(300),
  ollamaModel: z.string().trim().max(200),
});

export async function getStatus(): Promise<AiStatus> {
  return getAiStatus();
}

export async function updateAiSettings(input: z.infer<typeof settingsSchema>): Promise<ActionResult<AiStatus>> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid settings" };
  await saveAiSettings(parsed.data);
  revalidatePath("/settings");
  return { ok: true, data: await getAiStatus() };
}

export async function saveClaudeKey(key: string): Promise<ActionResult<AiStatus>> {
  const trimmed = key.trim();
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(trimmed)) {
    return { ok: false, error: "That doesn't look like a Claude API key. It starts with sk-ant-." };
  }
  await setClaudeKey(trimmed);
  revalidatePath("/settings");
  return { ok: true, data: await getAiStatus() };
}

export async function removeClaudeKey(): Promise<ActionResult<AiStatus>> {
  await setClaudeKey(null);
  revalidatePath("/settings");
  return { ok: true, data: await getAiStatus() };
}

/** Sends a tiny prompt to the selected AI to check that it works. */
export async function testAi(): Promise<ActionResult<{ reply: string; model: string; ms: number }>> {
  const started = Date.now();
  let reply = "";
  try {
    const result = await runChat(
      {
        system: "You are a connection test. Reply with one short friendly sentence.",
        messages: [{ role: "user", content: "Say hello to the Job Finder user in under 12 words." }],
        maxTokens: 60,
        feature: "test",
        signal: AbortSignal.timeout(60_000),
        onText: (t) => (reply += t),
      },
      await getAiSettings(),
    );
    return { ok: true, data: { reply: stripThinking(reply), model: result.model, ms: Date.now() - started } };
  } catch (error) {
    return { ok: false, error: error instanceof AiError ? error.message : `Test failed: ${String(error)}` };
  }
}

export async function ollamaModels(url: string): Promise<ActionResult<{ name: string; size: string }[]>> {
  try {
    return { ok: true, data: await listOllamaModels(url) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't reach Ollama" };
  }
}

export async function saveAboutMe(text: string): Promise<ActionResult> {
  if (text.length > 8000) return { ok: false, error: "Keep it under 8,000 characters" };
  await setAboutMe(text);
  revalidatePath("/settings");
  return { ok: true, data: null };
}

export async function saveAgentPrompt(id: string, prompt: string | null): Promise<ActionResult> {
  if (!getAgent(id)) return { ok: false, error: "Unknown agent" };
  if (prompt && prompt.length > 20000) return { ok: false, error: "Keep it under 20,000 characters" };
  await setAgentPrompt(id as AgentId, prompt);
  revalidatePath("/settings");
  return { ok: true, data: null };
}

// ----------------------------------------------------------------- threads

export async function threadsFor(scope: ThreadScope) {
  return listThreads(scope);
}

export async function threadMessages(threadId: string) {
  return getThreadMessages(threadId);
}

export async function deleteThread(threadId: string): Promise<ActionResult> {
  await db.delete(aiThreads).where(eq(aiThreads.id, threadId));
  return { ok: true, data: null };
}

export async function agentList() {
  return AGENTS.map(({ id, name, description }) => ({ id, name, description }));
}
