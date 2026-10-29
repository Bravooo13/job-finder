import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAgent, type AgentId } from "@/lib/ai/agents";
import { buildSystemPrompt } from "@/lib/ai/context";
import { AiError, runChat, stripThinking, type ChatMessage } from "@/lib/ai/providers";
import { runScout } from "@/lib/ai/scout";
import { getAiSettings } from "@/lib/ai/settings";
import { db } from "@/lib/db";
import { aiMessages, aiThreads } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  agent: z.string(),
  threadId: z.string().optional(),
  message: z.string().trim().min(1, "Type a message").max(30000),
  context: z
    .object({
      resumeId: z.string().optional(),
      jobId: z.string().optional(),
      foundId: z.string().optional(),
      coverLetterId: z.string().optional(),
      letterDraft: z.string().max(50000).optional(),
      latex: z.string().max(150000).optional(),
      compileLog: z.string().max(30000).optional(),
      jobDescription: z.string().max(40000).optional(),
      industry: z.string().max(200).optional(),
      foundIds: z.array(z.string().max(64)).max(8).optional(),
      jobIds: z.array(z.string().max(64)).max(8).optional(),
    })
    .default({}),
});

/** Merges back-to-back messages from the same side; the API wants them alternating. */
function alternate(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (!m.content.trim()) continue;
    const last = out.at(-1);
    if (last && last.role === m.role) last.content += `\n\n${m.content}`;
    else out.push({ ...m });
  }
  while (out[0]?.role === "assistant") out.shift();
  return out;
}

// POST /api/ai/chat: send a message to an agent and stream the reply back as
// newline-delimited JSON: {type:"thread"} first, then {type:"text"} chunks,
// then {type:"done"} or {type:"error"}.
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  const { agent: agentId, message, context } = parsed.data;
  const agent = getAgent(agentId);
  if (!agent) return NextResponse.json({ error: "Unknown agent" }, { status: 400 });

  // Find or start the conversation.
  let threadId = parsed.data.threadId;
  if (threadId) {
    const thread = await db.query.aiThreads.findFirst({ where: eq(aiThreads.id, threadId) });
    if (!thread) threadId = undefined;
  }
  if (!threadId) {
    const [created] = await db
      .insert(aiThreads)
      .values({
        agent: agent.id,
        title: message.replace(/\s+/g, " ").slice(0, 80),
        resumeId: context.resumeId || null,
        jobId: context.jobId || null,
        coverLetterId: context.coverLetterId || null,
      })
      .returning({ id: aiThreads.id });
    threadId = created.id;
  }

  const history = await db
    .select({ role: aiMessages.role, content: aiMessages.content })
    .from(aiMessages)
    .where(eq(aiMessages.threadId, threadId))
    .orderBy(asc(aiMessages.createdAt));
  await db.insert(aiMessages).values({ threadId, role: "user", content: message });
  await db.update(aiThreads).set({ updatedAt: new Date() }).where(eq(aiThreads.id, threadId));

  const settings = await getAiSettings();
  let system: string;
  try {
    system = await buildSystemPrompt(agent.id as AgentId, context);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Couldn't read the context" }, { status: 400 });
  }
  const messages = alternate([
    ...history.slice(-40).map((m) => ({ role: m.role as ChatMessage["role"], content: m.content })),
    { role: "user", content: message },
  ]);

  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort());
  const encoder = new TextEncoder();
  const id = threadId;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The browser went away; cancel() below stops the model.
        }
      };
      send({ type: "thread", id });
      let text = "";
      let model: string | null = null;
      try {
        const result = await (agent.id === "job-scout" ? runScout : runChat)(
          {
            system,
            messages,
            maxTokens: agent.maxTokens,
            signal: abort.signal,
            onText: (t) => {
              text += t;
              send({ type: "text", text: t });
            },
          },
          settings,
        );
        model = result.model;
        send({ type: "done", stopReason: result.stopReason, model: result.model });
      } catch (error) {
        if (!abort.signal.aborted) {
          const message =
            error instanceof AiError ? error.message : `Something went wrong: ${error instanceof Error ? error.message : String(error)}`;
          if (!(error instanceof AiError)) console.error("AI chat failed", error);
          send({ type: "error", message });
        }
      } finally {
        const reply = stripThinking(text);
        if (reply) {
          await db
            .insert(aiMessages)
            .values({ threadId: id, role: "assistant", content: abort.signal.aborted ? `${reply}\n\n_(stopped)_` : reply, model })
            .catch((e) => console.error("Couldn't save the AI reply", e));
          await db.update(aiThreads).set({ updatedAt: new Date() }).where(eq(aiThreads.id, id)).catch(() => {});
        }
        try {
          controller.close();
        } catch {}
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-thread-id": id },
  });
}
