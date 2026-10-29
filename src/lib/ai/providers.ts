import "server-only";
import { CLAUDE_MODELS, type AiSettings } from "./models";
import { getAiSettings, getClaudeKey } from "./settings";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  signal?: AbortSignal;
  onText: (text: string) => void;
}

export interface ChatResult {
  model: string;
  stopReason: string | null;
}

/** An error with a message that can be shown to the user as is. */
export class AiError extends Error {}

export const CLAUDE_URL = () => (process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com").replace(/\/+$/, "");

/** Sends a conversation to the AI picked in Settings and streams the reply through onText. */
export async function runChat(req: ChatRequest, settings?: AiSettings): Promise<ChatResult> {
  const s = settings ?? (await getAiSettings());
  return s.provider === "ollama" ? runOllama(req, s) : runClaude(req, s);
}

// ------------------------------------------------------------------ Claude

export function claudeError(status: number, body: string, model: string): AiError {
  let message = "";
  let type = "";
  try {
    const parsed = JSON.parse(body);
    message = parsed?.error?.message ?? "";
    type = parsed?.error?.type ?? "";
  } catch {
    message = body.slice(0, 300);
  }
  if (status === 401 || type === "authentication_error")
    return new AiError("Claude rejected the API key. Check it in Settings.");
  if (status === 403 || type === "permission_error")
    return new AiError(`Your API key isn't allowed to do this${message ? `: ${message}` : "."}`);
  if (status === 404 || type === "not_found_error")
    return new AiError(`The model "${model}" isn't available to your API key. Pick another model in Settings.`);
  if (status === 429 || type === "rate_limit_error")
    return new AiError("Claude's rate limit was hit. Wait a minute and try again.");
  if (status === 529 || type === "overloaded_error")
    return new AiError("Claude is overloaded right now. Try again in a minute.");
  if (/credit balance/i.test(message))
    return new AiError("Your Anthropic account is out of credits. Add credits at console.anthropic.com.");
  return new AiError(`Claude returned an error (${status})${message ? `: ${message}` : ""}`);
}

async function runClaude(req: ChatRequest, s: AiSettings): Promise<ChatResult> {
  const key = await getClaudeKey();
  if (!key) throw new AiError("Add your Claude API key in Settings first.");
  const model = s.claudeModel || CLAUDE_MODELS[0].id;

  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch(`${CLAUDE_URL()}/v1/messages`, {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: req.maxTokens,
          system: req.system,
          messages: req.messages,
          stream: true,
        }),
        signal: req.signal,
      });
    } catch (error) {
      if (req.signal?.aborted) throw error;
      if (attempt === 2) throw new AiError("Couldn't reach Claude. Check your internet connection.");
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    // Retry overloads and server errors; everything else is final.
    if (res.ok || ![500, 502, 503, 504, 529].includes(res.status) || attempt === 2) break;
    await res.body?.cancel();
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  if (!res) throw new AiError("Couldn't reach Claude.");
  if (!res.ok || !res.body) throw claudeError(res.status, await res.text(), model);

  let stopReason: string | null = null;
  let actualModel = model;
  for await (const event of sseEvents(res.body)) {
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
      req.onText(event.delta.text ?? "");
    } else if (event.type === "message_start") {
      actualModel = event.message?.model ?? model;
    } else if (event.type === "message_delta") {
      stopReason = event.delta?.stop_reason ?? stopReason;
    } else if (event.type === "error") {
      throw claudeError(529, JSON.stringify(event), model);
    }
  }
  return { model: actualModel, stopReason };
}

/** Parses a server-sent events stream into JSON payloads. */
async function* sseEvents(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");
    let end: number;
    while ((end = buffer.indexOf("\n\n")) >= 0 || (done && buffer.trim())) {
      const chunk = end >= 0 ? buffer.slice(0, end) : buffer;
      buffer = end >= 0 ? buffer.slice(end + 2) : "";
      const data = chunk
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (!data) continue;
      try {
        yield JSON.parse(data);
      } catch {
        // Not JSON (or a keep-alive); skip it.
      }
    }
    if (done) return;
  }
}

// ------------------------------------------------------------------ Ollama

function ollamaBase(s: AiSettings) {
  return (s.ollamaUrl || "http://127.0.0.1:11434").replace(/\/+$/, "");
}

async function runOllama(req: ChatRequest, s: AiSettings): Promise<ChatResult> {
  if (!s.ollamaModel) throw new AiError("Pick an Ollama model in Settings first.");
  let res: Response;
  try {
    res = await fetch(`${ollamaBase(s)}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: s.ollamaModel,
        messages: [{ role: "system", content: req.system }, ...req.messages],
        stream: true,
        // The default context window is small; resumes and job posts need more.
        options: { num_ctx: 16384, num_predict: req.maxTokens },
      }),
      signal: req.signal,
    });
  } catch (error) {
    if (req.signal?.aborted) throw error;
    throw new AiError(`Couldn't reach Ollama at ${ollamaBase(s)}. Is the Ollama app running?`);
  }
  if (!res.ok || !res.body) {
    const text = await res.text();
    let message = text;
    try {
      message = JSON.parse(text).error ?? text;
    } catch {}
    if (res.status === 404) throw new AiError(`Ollama doesn't have the model "${s.ollamaModel}". Run: ollama pull ${s.ollamaModel}`);
    throw new AiError(`Ollama returned an error (${res.status}): ${message.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let stopReason: string | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = done ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      if (!line.trim()) continue;
      let event: { message?: { content?: string }; done?: boolean; done_reason?: string; error?: string };
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (event.error) throw new AiError(`Ollama: ${event.error}`);
      if (event.message?.content) req.onText(event.message.content);
      if (event.done) stopReason = event.done_reason === "length" ? "max_tokens" : (event.done_reason ?? "end_turn");
    }
    if (done) break;
  }
  return { model: s.ollamaModel, stopReason };
}

export async function listOllamaModels(url: string): Promise<{ name: string; size: string }[]> {
  const base = (url || "http://127.0.0.1:11434").replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(5000) });
  } catch {
    throw new AiError(`Couldn't reach Ollama at ${base}. Install it from ollama.com and open the app.`);
  }
  if (!res.ok) throw new AiError(`Ollama returned an error (${res.status}).`);
  const data = (await res.json()) as { models?: { name: string; details?: { parameter_size?: string } }[] };
  return (data.models ?? []).map((m) => ({ name: m.name, size: m.details?.parameter_size ?? "" }));
}

/** Removes <think>…</think> reasoning that some local models put in their reply. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>\s*/g, "").replace(/^<think>[\s\S]*$/, "").trim();
}
