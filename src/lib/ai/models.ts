// Shared between server and client: which AI providers and models Job Finder can use.

export type AiProvider = "claude" | "ollama";

export interface AiSettings {
  provider: AiProvider;
  claudeModel: string;
  ollamaUrl: string;
  ollamaModel: string;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: "claude",
  claudeModel: "claude-sonnet-5-5",
  ollamaUrl: "http://127.0.0.1:11434",
  ollamaModel: "",
};

export const CLAUDE_MODELS = [
  {
    id: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    note: "Fast and strong. The best value for everyday use.",
  },
  {
    id: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    note: "Best writing and reasoning. About twice the cost of Sonnet.",
  },
  {
    id: "claude-haiku-5-5",
    label: "Claude Haiku 5.5",
    note: "Fastest and cheapest. Fine for quick questions.",
  },
] as const;

/** What the browser is allowed to know about the AI setup (never the key itself). */
export interface AiStatus {
  settings: AiSettings;
  claudeKey: { set: boolean; hint: string | null; fromEnv: boolean };
  ready: boolean;
  label: string; // "Claude Sonnet 5.5" or "Ollama · llama3.1"
}

export function modelLabel(settings: AiSettings): string {
  if (settings.provider === "ollama") return `Ollama · ${settings.ollamaModel || "no model picked"}`;
  return CLAUDE_MODELS.find((m) => m.id === settings.claudeModel)?.label ?? settings.claudeModel;
}
