"use client";

import { ChevronDown, Copy, CopyPlus, Download, ExternalLink, Loader2, Printer, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ChatPanel } from "@/components/ai/ChatPanel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { splitLetter, type AgentId } from "@/lib/ai/agents";
import { deleteCoverLetter, duplicateCoverLetter, updateCoverLetter } from "@/lib/cover-letters/actions";

interface LetterData {
  id: string;
  title: string;
  content: string;
  notes: string | null;
  company: string | null;
  role: string | null;
  jobDescription: string | null;
  instructions: string | null;
  job: { id: string; title: string; company: string; url: string | null } | null;
  resume: { id: string; title: string } | null;
}

const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

export function CoverLetterEditor({
  letter,
  aiReady,
  aiLabel,
  autoWrite,
}: {
  letter: LetterData;
  aiReady: boolean;
  aiLabel: string;
  autoWrite: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(letter.title);
  const [content, setContent] = useState(letter.content);
  const [notes, setNotes] = useState(letter.notes ?? "");
  const [instructions, setInstructions] = useState(letter.instructions ?? "");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const [pending, start] = useTransition();
  const [writing, setWriting] = useState(false);
  const contentRef = useRef(content);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const history = useRef<string[]>([]);

  const save = useCallback(
    async (patch: Parameters<typeof updateCoverLetter>[1]) => {
      setSaveState("saving");
      const result = await updateCoverLetter(letter.id, patch);
      if (!result.ok) {
        setSaveState("unsaved");
        return void toast.error(result.error);
      }
      setSaveState("saved");
    },
    [letter.id],
  );

  function edit(value: string) {
    contentRef.current = value;
    setContent(value);
    setSaveState("unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save({ content: value }), 800);
  }

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void updateCoverLetter(letter.id, { content: contentRef.current });
      }
    },
    [letter.id],
  );

  // Don't write a new letter again if the page is reloaded.
  useEffect(() => {
    if (!autoWrite) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("write");
    window.history.replaceState(null, "", url);
  }, [autoWrite]);

  function applyLetter(text: string, newNotes: string) {
    if (contentRef.current.trim()) history.current.push(contentRef.current);
    const previous = contentRef.current;
    contentRef.current = text;
    setContent(text);
    setNotes(newNotes);
    if (timer.current) clearTimeout(timer.current);
    void save({ content: text, notes: newNotes });
    if (previous.trim()) {
      toast.success("Letter updated", {
        action: {
          label: "Undo",
          onClick: () => {
            contentRef.current = previous;
            setContent(previous);
            void save({ content: previous });
          },
        },
      });
    }
  }

  function onReplyDone(reply: string, agent: AgentId) {
    // The first draft goes straight into the editor; later ones wait for "Use this letter".
    if (agent === "cover-letter" && !contentRef.current.trim()) {
      const { letter: text, notes: n } = splitLetter(reply);
      if (text) applyLetter(text, n);
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([contentRef.current], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "cover_letter"}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            aria-label="Letter name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title !== letter.title && void save({ title })}
            className="h-auto border-transparent px-0 text-xl font-semibold shadow-none focus-visible:border-input focus-visible:px-2"
          />
          <div className="flex shrink-0 flex-wrap gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void navigator.clipboard.writeText(contentRef.current).then(() => toast.success("Copied"))}
              disabled={!content.trim()}
            >
              <Copy /> Copy
            </Button>
            <Button variant="outline" size="sm" onClick={download} disabled={!content.trim()}>
              <Download /> .txt
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`/letter/${letter.id}/print`} target="_blank" rel="noreferrer">
                <Printer /> PDF
              </a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await duplicateCoverLetter(letter.id);
                  if (!r.ok) return void toast.error(r.error);
                  router.push(`/cover-letters/${r.data.id}`);
                })
              }
            >
              <CopyPlus /> Duplicate
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" aria-label="Delete letter">
                  <Trash2 />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this cover letter?</AlertDialogTitle>
                  <AlertDialogDescription>The letter and its AI chats are removed for good.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      start(async () => {
                        await deleteCoverLetter(letter.id);
                        toast.success("Deleted");
                        router.push("/cover-letters");
                      })
                    }
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          {letter.job ? (
            <Link href={`/jobs/${letter.job.id}`}>
              <Badge variant="secondary" className="hover:bg-secondary/70">
                {letter.job.title} · {letter.job.company}
              </Badge>
            </Link>
          ) : letter.role || letter.company ? (
            <Badge variant="secondary">{[letter.role, letter.company].filter(Boolean).join(" · ")}</Badge>
          ) : null}
          {letter.resume ? (
            <Link href={`/profile/resumes/${letter.resume.id}`}>
              <Badge variant="outline">From {letter.resume.title}</Badge>
            </Link>
          ) : null}
          {letter.job?.url ? (
            <a href={letter.job.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
              Posting <ExternalLink className="size-3" />
            </a>
          ) : null}
          <span className="ml-auto text-xs" aria-live="polite">
            {words(content)} words · {saveState === "saving" ? "Saving…" : saveState === "unsaved" ? "Unsaved" : "Saved"}
          </span>
        </div>

        <div className="rounded-lg border bg-card shadow-xs">
          {content.trim() || !writing ? null : (
            <p className="flex items-center gap-2 border-b px-6 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Writing your letter… it appears here when it&apos;s done.
            </p>
          )}
          <textarea
            aria-label="Cover letter"
            value={content}
            onChange={(e) => edit(e.target.value)}
            placeholder={
              aiReady
                ? "Ask the writer on the right for a draft, or type your letter here."
                : "Type your letter here. Connect an AI in Settings to have drafts written for you."
            }
            className="field-sizing-content min-h-[560px] w-full resize-none bg-transparent px-6 py-5 font-serif text-[15px] leading-7 outline-none placeholder:font-sans placeholder:text-sm placeholder:text-muted-foreground"
          />
        </div>

        {notes ? (
          <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Writer&apos;s notes: </span>
            {notes}
          </p>
        ) : null}

        <Collapsible>
          <CollapsibleTrigger className="group flex items-center gap-1 text-sm font-medium">
            What to emphasize
            <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 grid gap-2">
            <Textarea
              aria-label="What to emphasize"
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              onBlur={() => instructions !== (letter.instructions ?? "") && void save({ instructions })}
              placeholder="e.g. Lead with my thesis. Mention I can start in June."
            />
          </CollapsibleContent>
        </Collapsible>

        {letter.jobDescription ? (
          <Collapsible>
            <CollapsibleTrigger className="group flex items-center gap-1 text-sm font-medium">
              Job description
              <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 max-h-96 overflow-auto rounded-lg border p-4 text-sm leading-relaxed whitespace-pre-wrap">
              {letter.jobDescription}
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </div>

      <ChatPanel
        agents={["cover-letter", "job-fit", "outreach"] as AgentId[]}
        context={{ coverLetterId: letter.id }}
        getContext={() => ({ letterDraft: contentRef.current })}
        scope={{ coverLetterId: letter.id }}
        aiReady={aiReady}
        aiLabel={aiLabel}
        onUseLetter={applyLetter}
        onBusyChange={setWriting}
        onReplyDone={onReplyDone}
        autoSend={autoWrite && !letter.content.trim() ? { text: "Write a cover letter for this job.", agent: "cover-letter" } : null}
        placeholder="Ask for a draft or a change: “make the opening punchier”"
        className="h-[calc(100vh-9rem)] min-h-[560px] xl:sticky xl:top-6"
      />
    </div>
  );
}
