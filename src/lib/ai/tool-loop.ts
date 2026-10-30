import "server-only";
import { recordAiUsage } from "@/lib/control/log";
import { CLAUDE_MODELS, type AiSettings } from "./models";
import { AiError, assertUnderCap, CLAUDE_URL, claudeError, type ChatRequest, type ChatResult } from "./providers";
import { getClaudeKey } from "./settings";

// Claude with tools: it calls Job Finder's actions until it has an answer.
// Used by the Job Finder assistant and the Job scout. Streams its words and a
// line per step through onText.

type Json = Record<string, unknown>;

export interface LoopTool {
  name: string;
  description: string;
  input_schema: Json;
  /** A short line shown in the chat while the tool runs. */
  status: (input: Json) => string;
  run: (input: Json) => Promise<unknown>;
}

interface Block {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Json;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

export async function runToolLoop(
  req: ChatRequest & { tools: LoopTool[]; webSearch?: boolean; maxRounds?: number; agentName: string },
  s: AiSettings,
): Promise<ChatResult> {
  if (s.provider !== "claude") throw new AiError(`The ${req.agentName} needs Claude, because it uses tools. Pick Claude in Settings.`);
  const key = await getClaudeKey();
  if (!key) throw new AiError("Add your Claude API key in Settings first.");
  const model = s.claudeModel || CLAUDE_MODELS[0].id;
  // The tools and instructions are the same every round: cache them, so each round costs a fraction.
  const tools: Json[] = req.tools.map(({ name, description, input_schema }, i, all) => ({
    name,
    description,
    input_schema,
    ...(i === all.length - 1 ? { cache_control: { type: "ephemeral" } } : {}),
  }));
  let webSearch = req.webSearch ?? false;
  const messages: { role: "user" | "assistant"; content: unknown }[] = req.messages.map((m) => ({ role: m.role, content: m.content }));
  let actualModel = model;
  let stopReason: string | null = null;

  for (let round = 0; round < (req.maxRounds ?? 16); round++) {
    if (req.signal?.aborted) break;
    await assertUnderCap(s);
    // Mark the newest message too, so the next round reads everything before it from the cache.
    const last = messages.at(-1)!;
    const lastContent = typeof last.content === "string" ? [{ type: "text", text: last.content }] : (last.content as Json[]);
    const marked = [
      ...messages.slice(0, -1),
      { role: last.role, content: lastContent.map((b, i) => (i === lastContent.length - 1 ? { ...b, cache_control: { type: "ephemeral" } } : b)) },
    ];
    const body = {
      model,
      max_tokens: req.maxTokens,
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages: marked,
      tools: webSearch ? [...tools, { type: "web_search_20250305", name: "web_search", max_uses: 5 }] : tools,
    };
    let res: Response;
    try {
      res = await fetch(`${CLAUDE_URL()}/v1/messages`, {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: req.signal,
      });
    } catch (e) {
      if (req.signal?.aborted) throw e;
      throw new AiError("Couldn't reach Claude. Check your internet connection.");
    }
    if (!res.ok) {
      const text = await res.text();
      // Web search isn't on for every API key; carry on without it.
      if (webSearch && res.status === 400 && /web_search|server tool/i.test(text)) {
        webSearch = false;
        round--;
        continue;
      }
      throw claudeError(res.status, text, model);
    }
    const data = (await res.json()) as {
      content: Block[];
      stop_reason: string;
      model: string;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
        server_tool_use?: { web_search_requests?: number };
      };
    };
    actualModel = data.model ?? model;
    stopReason = data.stop_reason;
    const u = data.usage ?? {};
    await recordAiUsage({
      provider: "claude",
      model: actualModel,
      feature: req.feature,
      input: u.input_tokens ?? 0,
      output: u.output_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0,
      cacheRead: u.cache_read_input_tokens ?? 0,
      webSearches: u.server_tool_use?.web_search_requests ?? 0,
    });
    for (const b of data.content) {
      if (b.type === "text" && b.text) req.onText(b.text);
      if (b.type === "server_tool_use" && b.name === "web_search") req.onText(`\n\n_Searching the web: ${String(b.input?.query ?? "")}_\n\n`);
    }
    messages.push({ role: "assistant", content: data.content });
    if (data.stop_reason !== "tool_use") break;

    const results: Json[] = [];
    for (const b of data.content.filter((x) => x.type === "tool_use")) {
      const tool = req.tools.find((t) => t.name === b.name);
      if (!tool) {
        results.push({ type: "tool_result", tool_use_id: b.id, content: "Unknown tool", is_error: true });
        continue;
      }
      req.onText(`\n\n_${tool.status(b.input ?? {})}…_\n\n`);
      try {
        const out = await tool.run(b.input ?? {});
        results.push({ type: "tool_result", tool_use_id: b.id, content: clip(JSON.stringify(out) ?? "null", 14_000) });
      } catch (e) {
        results.push({ type: "tool_result", tool_use_id: b.id, content: e instanceof Error ? e.message : String(e), is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return { model: actualModel, stopReason };
}
