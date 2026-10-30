"use client";

import { CheckCircle2, ExternalLink, KeyRound, Loader2, RefreshCw, Server, Sparkles, Zap } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ollamaModels,
  removeClaudeKey,
  saveClaudeKey,
  testAi,
  updateAiSettings,
} from "@/lib/ai/actions";
import { CLAUDE_MODELS, type AiProvider, type AiSettings, type AiStatus } from "@/lib/ai/models";
import { cn } from "@/lib/utils";

const CUSTOM = "__custom__";

function ProviderOption({
  value,
  current,
  onSelect,
  title,
  description,
  icon: Icon,
}: {
  value: AiProvider;
  current: AiProvider;
  onSelect: (v: AiProvider) => void;
  title: string;
  description: string;
  icon: typeof Sparkles;
}) {
  const active = value === current;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={() => onSelect(value)}
      className={cn(
        "flex flex-1 items-start gap-3 rounded-lg border p-4 text-left transition-colors",
        active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent",
      )}
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

export function AiSettingsCard({ initial }: { initial: AiStatus }) {
  const [status, setStatus] = useState(initial);
  const [s, setS] = useState<AiSettings>(initial.settings);
  const [key, setKey] = useState("");
  const [models, setModels] = useState<{ name: string; size: string }[] | null>(null);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, startSave] = useTransition();
  const [keySaving, startKey] = useTransition();
  const [testing, startTest] = useTransition();
  const [loadingModels, startModels] = useTransition();
  const knownModel = CLAUDE_MODELS.some((m) => m.id === s.claudeModel);
  const [customModel, setCustomModel] = useState(!knownModel);
  const set = <K extends keyof AiSettings>(k: K, v: AiSettings[K]) => setS((x) => ({ ...x, [k]: v }));
  const dirty = JSON.stringify(s) !== JSON.stringify(status.settings);

  function save(next = s, quiet = false) {
    startSave(async () => {
      const result = await updateAiSettings(next);
      if (!result.ok) return void toast.error(result.error);
      setStatus(result.data);
      setTestResult(null);
      if (!quiet) toast.success("AI settings saved");
    });
  }

  function saveKey() {
    startKey(async () => {
      const result = await saveClaudeKey(key);
      if (!result.ok) return void toast.error(result.error);
      setStatus(result.data);
      setKey("");
      toast.success("API key saved and encrypted on this computer");
    });
  }

  function forgetKey() {
    startKey(async () => {
      const result = await removeClaudeKey();
      if (result.ok) setStatus(result.data);
      toast.success("API key removed");
    });
  }

  function loadModels() {
    startModels(async () => {
      const result = await ollamaModels(s.ollamaUrl);
      if (!result.ok) {
        setModels(null);
        setOllamaError(result.error);
        return;
      }
      setOllamaError(null);
      setModels(result.data);
      if (!s.ollamaModel && result.data[0]) set("ollamaModel", result.data[0].name);
    });
  }

  function test() {
    startTest(async () => {
      if (dirty) {
        const saved = await updateAiSettings(s);
        if (!saved.ok) return void toast.error(saved.error);
        setStatus(saved.data);
      }
      const result = await testAi();
      setTestResult(
        result.ok
          ? { ok: true, text: `${result.data.model} replied in ${(result.data.ms / 1000).toFixed(1)}s: “${result.data.reply}”` }
          : { ok: false, text: result.error },
      );
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          AI model
          {status.ready ? (
            <Badge variant="secondary" className="gap-1 font-normal">
              <CheckCircle2 className="size-3 text-emerald-600" /> Using {status.label}
            </Badge>
          ) : (
            <Badge variant="outline" className="font-normal">
              Not set up
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          The resume tailor, LaTeX editor, cover letter writer and the other agents all use the model you pick here.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div role="radiogroup" aria-label="AI provider" className="flex flex-col gap-3 sm:flex-row">
          <ProviderOption
            value="claude"
            current={s.provider}
            onSelect={(v) => set("provider", v)}
            icon={Sparkles}
            title="Claude (API key)"
            description="Best quality. You pay Anthropic per use; a cover letter costs a few cents."
          />
          <ProviderOption
            value="ollama"
            current={s.provider}
            onSelect={(v) => {
              set("provider", v);
              if (!models) loadModels();
            }}
            icon={Server}
            title="Ollama (free, on this Mac)"
            description="Runs a model on your own computer. Free and private, but slower and weaker at writing."
          />
        </div>

        {s.provider === "claude" ? (
          <div className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="claude-key" className="flex items-center gap-2">
                <KeyRound className="size-4" /> Claude API key
              </Label>
              {status.claudeKey.set ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="secondary" className="font-mono font-normal">
                    sk-ant-{status.claudeKey.hint}
                  </Badge>
                  <span className="text-muted-foreground">
                    {status.claudeKey.fromEnv ? "from ANTHROPIC_API_KEY" : "saved, encrypted on this computer"}
                  </span>
                  {!status.claudeKey.fromEnv ? (
                    <Button variant="ghost" size="sm" onClick={forgetKey} disabled={keySaving}>
                      Remove
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="claude-key"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder={status.claudeKey.set ? "Paste a new key to replace it" : "sk-ant-…"}
                  className="font-mono sm:flex-1"
                />
                <Button onClick={saveKey} disabled={!key.trim() || keySaving}>
                  {keySaving ? <Loader2 className="animate-spin" /> : null}
                  Save key
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Get one at{" "}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-primary hover:underline"
                >
                  console.anthropic.com <ExternalLink className="size-3" />
                </a>
                . It never leaves this computer except to talk to Claude, and it isn&apos;t in the GitHub repo.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="claude-model">Model</Label>
              <Select
                value={customModel ? CUSTOM : s.claudeModel}
                onValueChange={(v) => {
                  if (v === CUSTOM) return setCustomModel(true);
                  setCustomModel(false);
                  set("claudeModel", v);
                }}
              >
                <SelectTrigger id="claude-model" className="sm:w-96">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLAUDE_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM}>Another model ID…</SelectItem>
                </SelectContent>
              </Select>
              {customModel ? (
                <Input
                  aria-label="Model ID"
                  value={s.claudeModel}
                  onChange={(e) => set("claudeModel", e.target.value)}
                  placeholder="claude-…"
                  className="font-mono sm:w-96"
                />
              ) : (
                <p className="text-xs text-muted-foreground">{CLAUDE_MODELS.find((m) => m.id === s.claudeModel)?.note}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="apply-model">Model for application answers</Label>
              <Select value={s.applyModel || "claude-haiku-5-5"} onValueChange={(v) => set("applyModel", v)}>
                <SelectTrigger id="apply-model" className="sm:w-96">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLAUDE_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Used by Auto apply and “Write answers with AI”. The cheapest model keeps each application to a few short calls.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="ollama-url">Ollama address</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="ollama-url"
                  value={s.ollamaUrl}
                  onChange={(e) => set("ollamaUrl", e.target.value)}
                  className="font-mono sm:w-96"
                />
                <Button variant="outline" onClick={loadModels} disabled={loadingModels}>
                  {loadingModels ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  Find models
                </Button>
              </div>
              {ollamaError ? <p className="text-sm text-destructive">{ollamaError}</p> : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ollama-model">Model</Label>
              {models && models.length ? (
                <Select value={s.ollamaModel} onValueChange={(v) => set("ollamaModel", v)}>
                  <SelectTrigger id="ollama-model" className="sm:w-96">
                    <SelectValue placeholder="Pick a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((m) => (
                      <SelectItem key={m.name} value={m.name}>
                        {m.name}
                        {m.size ? ` · ${m.size}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="ollama-model"
                  value={s.ollamaModel}
                  onChange={(e) => set("ollamaModel", e.target.value)}
                  placeholder="Model name, e.g. from `ollama list`"
                  className="font-mono sm:w-96"
                />
              )}
              <p className="text-xs text-muted-foreground">
                Install Ollama from{" "}
                <a href="https://ollama.com" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  ollama.com
                </a>
                , then download a chat model in Terminal with <code className="rounded bg-muted px-1">ollama pull &lt;model&gt;</code>. Models
                around 8B parameters run well on most Macs; bigger ones write better.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <Button onClick={() => save()} disabled={!dirty || saving} aria-label="Save AI settings">
            {saving ? <Loader2 className="animate-spin" /> : null}
            Save
          </Button>
          <Button variant="outline" onClick={test} disabled={testing}>
            {testing ? <Loader2 className="animate-spin" /> : <Zap />}
            Test it
          </Button>
          {testResult ? (
            <p className={cn("text-sm", testResult.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")}>
              {testResult.text}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
