"use client";

import {
  ArrowUp,
  Code2,
  Columns3,
  Gauge,
  History,
  Loader2,
  Mail,
  Mic,
  PenLine,
  Plus,
  Send,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteThread, threadMessages, threadsFor } from "@/lib/ai/actions";
import { AGENTS, getAgent, splitLetter, type Agent, type AgentId } from "@/lib/ai/agents";
import { cn, timeAgo } from "@/lib/utils";
import { CopyButton, Markdown } from "./Markdown";

export const AGENT_ICONS: Record<Agent["icon"], typeof Wand2> = {
  wand: Wand2,
  code: Code2,
  mail: Mail,
  mic: Mic,
  gauge: Gauge,
  send: Send,
  pen: PenLine,
  columns: Columns3,
};

export interface ChatContextInput {
  resumeId?: string | null;
  jobId?: string | null;
  foundId?: string | null;
  coverLetterId?: string | null;
  letterDraft?: string | null;
  latex?: string | null;
  compileLog?: string | null;
  jobDescription?: string | null;
  industry?: string | null;
  foundIds?: string[] | null;
  jobIds?: string[] | null;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  error?: string;
}

interface ThreadRow {
  id: string;
  agent: string;
  title: string;
  updatedAt: Date;
}

export interface ChatPanelHandle {
  send: (text: string, opts?: { agent?: AgentId; newThread?: boolean }) => void;
}

/** Hides reasoning that some local models print inside <think> tags. */
function visibleText(text: string): { text: string; thinking: boolean } {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>\s*/g, "");
  const open = cleaned.indexOf("<think>");
  if (open >= 0) return { text: cleaned.slice(0, open), thinking: true };
  return { text: cleaned, thinking: false };
}

/** Cover letter replies get the letter view; questions and advice stay Markdown. */
function looksLikeLetter(text: string) {
  return text.includes("===NOTES===") || /^\s*(Dear|To whom|Hello|Hi)\b/i.test(text);
}

function cleanContext(ctx: ChatContextInput) {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (typeof v === "string" && v.trim()) out[k] = v;
    else if (Array.isArray(v) && v.length) out[k] = v;
  }
  return out;
}

function LetterReply({
  content,
  streaming,
  onUse,
}: {
  content: string;
  streaming?: boolean;
  onUse?: (letter: string, notes: string) => void;
}) {
  const { letter, notes } = splitLetter(content);
  const words = letter.trim() ? letter.trim().split(/\s+/).length : 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-md border bg-background px-4 py-3 font-serif text-[0.9rem] leading-relaxed whitespace-pre-wrap">
        {letter || "…"}
      </div>
      {notes ? <p className="text-xs text-muted-foreground">{notes}</p> : null}
      {!streaming && letter ? (
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs text-muted-foreground">{words} words</span>
          <CopyButton text={letter} />
          {onUse ? (
            <Button type="button" size="sm" className="h-7 px-2.5 text-xs" onClick={() => onUse(letter, notes)}>
              <Wand2 className="size-3.5" /> Use this letter
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ChatPanel({
  agents,
  context,
  getContext,
  scope,
  aiReady,
  aiLabel,
  onApplyLatex,
  onUseLetter,
  onReplyDone,
  onBusyChange,
  autoSend,
  placeholder,
  className,
  ref,
}: {
  agents: AgentId[];
  context: ChatContextInput;
  /** Called at send time for values that change while you type (like the LaTeX source). */
  getContext?: () => ChatContextInput;
  scope: { resumeId?: string; jobId?: string; coverLetterId?: string; agent?: string };
  aiReady: boolean;
  aiLabel: string;
  onApplyLatex?: (latex: string) => void;
  onUseLetter?: (letter: string, notes: string) => void;
  onReplyDone?: (reply: string, agent: AgentId) => void;
  onBusyChange?: (busy: boolean) => void;
  autoSend?: { text: string; agent?: AgentId } | null;
  placeholder?: string;
  className?: string;
  ref?: Ref<ChatPanelHandle>;
}) {
  const [agentId, setAgentId] = useState<AgentId>(agents[0]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [threads, setThreads] = useState<ThreadRow[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoSent = useRef(false);
  const agent = getAgent(agentId)!;
  const Icon = AGENT_ICONS[agent.icon];

  const scrollToEnd = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(scrollToEnd, [messages, scrollToEnd]);

  const send = useCallback(
    async (raw: string, opts?: { agent?: AgentId; newThread?: boolean }) => {
      const text = raw.trim();
      if (!text || busy) return;
      if (!aiReady) {
        toast.error("Set up AI in Settings first");
        return;
      }
      const useAgent = opts?.agent ?? agentId;
      if (opts?.agent && opts.agent !== agentId) setAgentId(opts.agent);
      const currentThread = opts?.newThread || useAgent !== agentId ? null : threadId;
      const replyId = crypto.randomUUID();
      setMessages((m) => [
        ...(currentThread ? m : []),
        { id: crypto.randomUUID(), role: "user", content: text },
        { id: replyId, role: "assistant", content: "", pending: true },
      ]);
      if (!currentThread) setThreadId(null);
      setInput("");
      setBusy(true);
      onBusyChange?.(true);
      const controller = new AbortController();
      abortRef.current = controller;
      let reply = "";
      const update = (patch: Partial<Message>) =>
        setMessages((m) => m.map((msg) => (msg.id === replyId ? { ...msg, ...patch } : msg)));

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            agent: useAgent,
            threadId: currentThread ?? undefined,
            message: text,
            context: cleanContext({ ...context, ...getContext?.() }),
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `The AI request failed (${res.status})`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let failed: string | null = null;
        for (;;) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          const lines = buffer.split("\n");
          buffer = done ? "" : (lines.pop() ?? "");
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as { type: string; id?: string; text?: string; message?: string; stopReason?: string };
            if (event.type === "thread" && event.id) setThreadId(event.id);
            else if (event.type === "text" && event.text) {
              reply += event.text;
              update({ content: reply });
            } else if (event.type === "error") failed = event.message ?? "The AI stopped with an error";
            else if (event.type === "done" && event.stopReason === "max_tokens") {
              toast.warning("The reply hit its length limit and was cut off. Ask it to continue.");
            }
          }
          if (done) break;
        }
        if (failed) throw new Error(failed);
        update({ pending: false });
        setThreads(null);
        onReplyDone?.(visibleText(reply).text, useAgent);
      } catch (error) {
        if (controller.signal.aborted) {
          update({ pending: false, content: reply ? `${reply}\n\n_(stopped)_` : "_(stopped)_" });
        } else {
          const message = error instanceof Error ? error.message : String(error);
          update({ pending: false, error: message });
        }
      } finally {
        setBusy(false);
        onBusyChange?.(false);
        abortRef.current = null;
      }
    },
    [agentId, aiReady, busy, context, getContext, onBusyChange, onReplyDone, threadId],
  );

  useImperativeHandle(ref, () => ({ send: (text, opts) => void send(text, opts) }), [send]);

  useEffect(() => {
    if (autoSend?.text && !autoSent.current && aiReady) {
      autoSent.current = true;
      void send(autoSend.text, { agent: autoSend.agent, newThread: true });
    }
  }, [autoSend, aiReady, send]);

  async function loadThreads() {
    setThreads((await threadsFor(scope)) as ThreadRow[]);
  }

  async function openThread(t: ThreadRow) {
    if (busy) return;
    const rows = await threadMessages(t.id);
    if (agents.includes(t.agent as AgentId)) setAgentId(t.agent as AgentId);
    setThreadId(t.id);
    setMessages(rows.map((r) => ({ id: r.id, role: r.role as Message["role"], content: r.content })));
  }

  async function removeThread(t: ThreadRow) {
    await deleteThread(t.id);
    if (t.id === threadId) {
      setThreadId(null);
      setMessages([]);
    }
    await loadThreads();
  }

  function newChat() {
    if (busy) abortRef.current?.abort();
    setThreadId(null);
    setMessages([]);
  }

  return (
    <div className={cn("flex min-h-0 flex-col rounded-lg border bg-card", className)}>
      <div className="flex items-center gap-2 border-b px-3 py-2">
        {agents.length > 1 ? (
          <Select
            value={agentId}
            onValueChange={(v) => {
              setAgentId(v as AgentId);
              setThreadId(null);
              setMessages([]);
            }}
          >
            <SelectTrigger aria-label="Agent" className="h-8 w-auto shrink-0 gap-2 border-0 px-2 font-medium shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {agents.map((id) => {
                const a = getAgent(id)!;
                const AIcon = AGENT_ICONS[a.icon];
                return (
                  <SelectItem key={id} value={id}>
                    <span className="flex items-center gap-2">
                      <AIcon className="size-4 text-primary" /> {a.name}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        ) : (
          <span className="flex shrink-0 items-center gap-2 px-1 text-sm font-medium">
            <Icon className="size-4 text-primary" /> {agent.name}
          </span>
        )}
        <Badge variant="secondary" className="min-w-0 font-normal" title="Change this in Settings">
          <span className="truncate">{aiLabel}</span>
        </Badge>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <DropdownMenu onOpenChange={(open) => open && void loadThreads()}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label="Past chats">
                <History className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Past chats</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {threads === null ? (
                <div className="flex justify-center py-3">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : threads.length === 0 ? (
                <p className="px-2 py-3 text-sm text-muted-foreground">No saved chats yet.</p>
              ) : (
                threads.map((t) => (
                  <DropdownMenuItem key={t.id} className="flex items-start gap-2" onSelect={() => void openThread(t)}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{t.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {getAgent(t.agent)?.name ?? t.agent} · {timeAgo(t.updatedAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Delete chat"
                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void removeThread(t);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" className="size-8" aria-label="New chat" onClick={newChat}>
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {!aiReady ? (
          <Alert>
            <Settings2 className="size-4" />
            <AlertTitle>Connect an AI first</AlertTitle>
            <AlertDescription>
              <p>
                Add your Claude API key, or pick a free local model with Ollama, in{" "}
                <Link href="/settings" className="font-medium text-primary underline">
                  Settings
                </Link>
                .
              </p>
            </AlertDescription>
          </Alert>
        ) : messages.length === 0 ? (
          <div className="flex flex-col gap-3 py-2">
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
              <p>{agent.description}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              {agent.starters.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m) => {
              if (m.role === "user") {
                return (
                  <div key={m.id} className="ml-8 self-end rounded-lg bg-primary/10 px-3 py-2 text-sm whitespace-pre-wrap">
                    {m.content}
                  </div>
                );
              }
              const { text, thinking } = visibleText(m.content);
              return (
                <div key={m.id} className="flex flex-col gap-1">
                  {m.pending && !text ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" /> {thinking ? "Thinking…" : "Working on it…"}
                    </p>
                  ) : agentId === "cover-letter" && looksLikeLetter(text) ? (
                    <LetterReply content={text} streaming={m.pending} onUse={onUseLetter} />
                  ) : (
                    <Markdown text={text} onApplyLatex={onApplyLatex} streaming={m.pending} />
                  )}
                  {m.error ? <p className="text-sm text-destructive">{m.error}</p> : null}
                  {!m.pending && !m.error && text && agentId !== "cover-letter" ? (
                    <div>
                      <CopyButton text={text} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <form
        className="border-t p-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="flex items-end gap-2 rounded-md border bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring/40">
          <textarea
            aria-label="Message"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={1}
            placeholder={placeholder ?? `Ask the ${agent.name.toLowerCase()}…`}
            disabled={!aiReady}
            className="field-sizing-content max-h-40 min-h-8 flex-1 resize-none bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
          />
          {busy ? (
            <Button type="button" size="icon" variant="secondary" className="size-8" aria-label="Stop" onClick={() => abortRef.current?.abort()}>
              <Square className="size-3.5" />
            </Button>
          ) : (
            <Button type="submit" size="icon" className="size-8" aria-label="Send" disabled={!input.trim() || !aiReady}>
              <ArrowUp className="size-4" />
            </Button>
          )}
        </div>
        <p className="mt-1 px-1 text-[11px] text-muted-foreground">Enter to send · Shift+Enter for a new line · Chats are saved</p>
      </form>
    </div>
  );
}

export { AGENTS };
