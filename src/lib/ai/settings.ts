import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { getAgent, type AgentId } from "./agents";
import { decrypt, encrypt } from "./crypto";
import { DEFAULT_AI_SETTINGS, modelLabel, type AiSettings, type AiStatus } from "./models";

const KEYS = {
  ai: "ai",
  claudeKey: "ai.claudeKey",
  aboutMe: "profile.aboutMe",
  agentPrompt: (id: string) => `agents.${id}.prompt`,
};

async function getValue<T>(key: string): Promise<T | undefined> {
  const row = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).limit(1);
  return row[0]?.value as T | undefined;
}

async function setValue(key: string, value: unknown) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}

async function deleteValue(key: string) {
  await db.delete(settings).where(eq(settings.key, key));
}

export async function getAiSettings(): Promise<AiSettings> {
  const stored = (await getValue<Partial<AiSettings>>(KEYS.ai)) ?? {};
  return { ...DEFAULT_AI_SETTINGS, ...stored };
}

export async function saveAiSettings(next: Partial<AiSettings>) {
  const current = await getAiSettings();
  await setValue(KEYS.ai, { ...current, ...next });
}

/** The Claude API key: the one saved in Settings, else ANTHROPIC_API_KEY. */
export async function getClaudeKey(): Promise<string | null> {
  const stored = await getValue<string>(KEYS.claudeKey);
  if (stored) {
    const key = decrypt(stored);
    if (key) return key;
  }
  return process.env.ANTHROPIC_API_KEY || null;
}

export async function setClaudeKey(key: string | null) {
  if (!key) return deleteValue(KEYS.claudeKey);
  await setValue(KEYS.claudeKey, encrypt(key));
}

export async function getAiStatus(): Promise<AiStatus> {
  const [s, stored] = await Promise.all([getAiSettings(), getValue<string>(KEYS.claudeKey)]);
  const savedKey = stored ? decrypt(stored) : null;
  const envKey = process.env.ANTHROPIC_API_KEY || null;
  const key = savedKey ?? envKey;
  const ready = s.provider === "claude" ? Boolean(key) : Boolean(s.ollamaModel && s.ollamaUrl);
  return {
    settings: s,
    claudeKey: { set: Boolean(key), hint: key ? `…${key.slice(-4)}` : null, fromEnv: !savedKey && Boolean(envKey) },
    ready,
    label: modelLabel(s),
  };
}

export async function getAboutMe(): Promise<string> {
  return (await getValue<string>(KEYS.aboutMe)) ?? "";
}

export async function setAboutMe(text: string) {
  await setValue(KEYS.aboutMe, text.trim());
}

/** The agent's instructions: your edited version from Settings, else the built-in one. */
export async function getAgentPrompt(id: AgentId): Promise<{ prompt: string; custom: boolean }> {
  const custom = await getValue<string>(KEYS.agentPrompt(id));
  if (custom?.trim()) return { prompt: custom, custom: true };
  return { prompt: getAgent(id)?.prompt ?? "", custom: false };
}

export async function getCustomPrompts(): Promise<Record<string, string>> {
  const rows = await db.select().from(settings);
  const out: Record<string, string> = {};
  for (const r of rows) {
    const m = /^agents\.(.+)\.prompt$/.exec(r.key);
    if (m && typeof r.value === "string") out[m[1]] = r.value;
  }
  return out;
}

export async function setAgentPrompt(id: AgentId, prompt: string | null) {
  if (!prompt?.trim() || prompt.trim() === getAgent(id)?.prompt.trim()) return deleteValue(KEYS.agentPrompt(id));
  await setValue(KEYS.agentPrompt(id), prompt.trim());
}
