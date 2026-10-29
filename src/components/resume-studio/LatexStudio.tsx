"use client";

import {
  AlertTriangle,
  Download,
  FileCode2,
  FileDown,
  FileText,
  Hammer,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  Upload,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChatPanel, type ChatPanelHandle } from "@/components/ai/ChatPanel";
import {
  fetchTectonicStatus,
  installTectonicEngine,
  type TectonicStatus,
} from "@/components/settings/LatexEngineCard";
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
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AgentId } from "@/lib/ai/agents";
import { blankLatex } from "@/lib/latex/template";
import { latexFromContent, saveResumeLatex } from "@/lib/resumes/actions";
import { cn } from "@/lib/utils";

const CodeEditor = dynamic(() => import("./CodeEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 size-4 animate-spin" /> Loading editor…
    </div>
  ),
});

type SaveState = "saved" | "saving" | "unsaved";

function fileBase(name: string) {
  return name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "resume";
}

export function LatexStudio({
  resumeId,
  initialLatex,
  fileName,
  industry,
  targetJob,
  aiReady,
  aiLabel,
  autoTailor,
}: {
  resumeId: string;
  initialLatex: string;
  fileName: string;
  industry: string | null;
  targetJob: { id: string; title: string; company: string } | null;
  aiReady: boolean;
  aiLabel: string;
  autoTailor: boolean;
}) {
  const [latex, setLatex] = useState(initialLatex);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [compileError, setCompileError] = useState<{ error: string; log: string } | null>(null);
  const [engine, setEngine] = useState<TectonicStatus | null>(null);
  const [installing, setInstalling] = useState(false);
  const [panel, setPanel] = useState<"pdf" | "ai">(autoTailor && aiReady ? "ai" : "pdf");
  const [showLog, setShowLog] = useState(false);
  const [lastMs, setLastMs] = useState<number | null>(null);
  const latexRef = useRef(latex);
  const logRef = useRef("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatRef = useRef<ChatPanelHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const compiledOnce = useRef(false);

  const persist = useCallback(
    async (value: string) => {
      setSaveState("saving");
      const result = await saveResumeLatex(resumeId, value);
      if (!result.ok) {
        setSaveState("unsaved");
        toast.error(result.error);
        return;
      }
      if (latexRef.current === value) setSaveState("saved");
    },
    [resumeId],
  );

  const change = useCallback(
    (value: string) => {
      latexRef.current = value;
      setLatex(value);
      setSaveState("unsaved");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void persist(value), 800);
    },
    [persist],
  );

  // Save right away when leaving the page with unsaved edits.
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        void saveResumeLatex(resumeId, latexRef.current);
      }
    };
  }, [resumeId]);

  const compile = useCallback(async (opts?: { quiet?: boolean }) => {
    const source = latexRef.current;
    if (!source.trim()) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      void persist(source);
    }
    setCompiling(true);
    if (!opts?.quiet) setPanel("pdf");
    try {
      const res = await fetch("/api/latex/compile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ latex: source }),
      });
      if (res.ok) {
        const blob = await res.blob();
        setPdfUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(blob);
        });
        setCompileError(null);
        logRef.current = "";
        setLastMs(Number(res.headers.get("x-compile-ms")) || null);
        return;
      }
      const body = await res.json().catch(() => ({ error: `Compile failed (${res.status})`, log: "" }));
      if (body.notInstalled) {
        setEngine({ installed: false, platformSupported: true });
        return;
      }
      setCompileError({ error: body.error, log: body.log ?? "" });
      logRef.current = body.log || body.error;
    } catch (error) {
      setCompileError({ error: error instanceof Error ? error.message : String(error), log: "" });
    } finally {
      setCompiling(false);
    }
  }, [persist]);

  useEffect(() => {
    void fetchTectonicStatus().then((s) => {
      setEngine(s);
      if (s.installed && latexRef.current.trim() && !compiledOnce.current) {
        compiledOnce.current = true;
        void compile({ quiet: true });
      }
    });
  }, [compile]);

  useEffect(() => () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  async function install() {
    setInstalling(true);
    try {
      const s = await installTectonicEngine();
      setEngine(s);
      toast.success(`Tectonic ${s.version ?? ""} installed`);
      if (latexRef.current.trim()) await compile();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setInstalling(false);
    }
  }

  function replaceSource(value: string, message?: string) {
    const previous = latexRef.current;
    change(value);
    if (message) {
      toast.success(message, previous.trim() ? { action: { label: "Undo", onClick: () => change(previous) } } : undefined);
    }
    void compile();
  }

  async function fromContent() {
    const result = await latexFromContent(resumeId);
    if (!result.ok) return void toast.error(result.error);
    replaceSource(result.data, "Built LaTeX from your resume content");
  }

  async function upload(file: File) {
    if (file.size > 500_000) return void toast.error("That file is too large for a resume");
    replaceSource(await file.text(), `Loaded ${file.name}`);
  }

  function download(content: BlobPart, type: string, name: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const applyLatex = (code: string) => replaceSource(code, "Applied the AI's LaTeX");

  // Don't start the tailoring chat again if the page is reloaded.
  useEffect(() => {
    if (!autoTailor) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("tailor");
    window.history.replaceState(null, "", url);
  }, [autoTailor]);

  const tailorPrompt = industry
    ? `Rewrite this resume for ${industry} roles${
        targetJob ? `, aimed at the ${targetJob.title} job at ${targetJob.company}` : ""
      }. Put the most relevant evidence first, reword bullets in that field's vocabulary, adjust the skills section, and drop what doesn't help. Keep every fact true and keep it to one page.`
    : null;

  const base = fileBase(fileName);
  const empty = !latex.trim();

  if (empty) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed px-6 py-14 text-center">
        <FileCode2 className="size-8 text-muted-foreground" />
        <div>
          <h3 className="font-medium">Write this resume in LaTeX</h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Start from your resume content, a blank template or your own .tex file. Edit on the left, see the PDF on the
            right, and ask the AI to rework it for an industry or a job.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => void fromContent()}>
            <Hammer /> Build from my resume
          </Button>
          <Button variant="outline" onClick={() => replaceSource(blankLatex(), "Started from the template")}>
            <FileText /> Blank template
          </Button>
          <Button variant="outline" onClick={() => fileInput.current?.click()}>
            <Upload /> Upload .tex
          </Button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".tex,text/x-tex,text/plain"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void compile()} disabled={compiling || !engine?.installed}>
          {compiling ? <Loader2 className="animate-spin" /> : <Play />}
          Compile
          <kbd className="ml-1 hidden rounded border border-primary-foreground/30 px-1 text-[10px] sm:inline">⌘S</kbd>
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline">
              <RefreshCw /> Rebuild from content
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Replace the LaTeX with your resume content?</AlertDialogTitle>
              <AlertDialogDescription>
                This rebuilds the document from the Content tab using the standard template. Your edits here are replaced,
                but you can undo right after.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void fromContent()}>Rebuild</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button variant="outline" onClick={() => fileInput.current?.click()}>
          <Upload /> Upload .tex
        </Button>
        <Button variant="outline" onClick={() => download(latexRef.current, "text/x-tex", `${base}.tex`)}>
          <Download /> .tex
        </Button>
        <Button variant="outline" asChild={Boolean(pdfUrl)} disabled={!pdfUrl}>
          {pdfUrl ? (
            <a href={pdfUrl} download={`${base}.pdf`}>
              <FileDown /> PDF
            </a>
          ) : (
            <span>
              <FileDown /> PDF
            </span>
          )}
        </Button>
        <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
          {saveState === "saving" ? "Saving…" : saveState === "unsaved" ? "Unsaved changes" : "All changes saved"}
          {lastMs ? ` · compiled in ${(lastMs / 1000).toFixed(1)}s` : ""}
        </span>
        <input
          ref={fileInput}
          type="file"
          accept=".tex,text/x-tex,text/plain"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-[calc(100vh-15rem)] min-h-[520px] overflow-hidden rounded-lg border">
          <CodeEditor value={latex} onChange={change} onSave={() => void compile()} />
        </div>

        <Tabs value={panel} onValueChange={(v) => setPanel(v as "pdf" | "ai")} className="flex h-[calc(100vh-15rem)] min-h-[520px] flex-col">
          <TabsList className="w-fit">
            <TabsTrigger value="pdf">
              <FileText className="mr-1.5 size-4" /> PDF preview
            </TabsTrigger>
            <TabsTrigger value="ai">
              <Sparkles className="mr-1.5 size-4" /> Ask AI
            </TabsTrigger>
          </TabsList>
          <TabsContent value="pdf" forceMount className="min-h-0 flex-1 data-[state=inactive]:hidden">
            <div className="relative flex h-full flex-col overflow-hidden rounded-lg border bg-muted/40">
              {engine && !engine.installed ? (
                <div className="m-auto flex max-w-sm flex-col items-center gap-3 p-6 text-center">
                  <Hammer className="size-8 text-muted-foreground" />
                  <h3 className="font-medium">Install the LaTeX engine</h3>
                  <p className="text-sm text-muted-foreground">
                    PDFs are made by Tectonic, a small LaTeX program (about 15 MB). It installs once into Job Finder&apos;s
                    data folder. The first PDF takes a minute or two while LaTeX packages download.
                  </p>
                  {engine.error ? <p className="text-sm text-destructive">{engine.error}</p> : null}
                  <Button onClick={() => void install()} disabled={installing || !engine.platformSupported}>
                    {installing ? <Loader2 className="animate-spin" /> : <Download />}
                    {installing ? "Installing…" : "Install Tectonic"}
                  </Button>
                </div>
              ) : (
                <>
                  {compileError ? (
                    <div className="border-b bg-card p-3 text-sm">
                      <p className="flex items-start gap-2 font-medium text-destructive">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" /> It didn&apos;t compile
                      </p>
                      <pre className="mt-1 max-h-28 overflow-auto font-mono text-xs whitespace-pre-wrap text-muted-foreground">
                        {compileError.error}
                      </pre>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={!aiReady}
                          onClick={() => {
                            setPanel("ai");
                            chatRef.current?.send("It doesn't compile. Find the cause in the log and send the fixed document.", {
                              agent: "latex",
                            });
                          }}
                        >
                          <Sparkles /> Ask AI to fix it
                        </Button>
                        {compileError.log ? (
                          <Button size="sm" variant="outline" onClick={() => setShowLog((s) => !s)}>
                            {showLog ? "Hide" : "Show"} full log
                          </Button>
                        ) : null}
                      </div>
                      {showLog ? (
                        <pre className="mt-2 max-h-60 overflow-auto rounded bg-muted p-2 font-mono text-[11px] whitespace-pre-wrap">
                          {compileError.log}
                        </pre>
                      ) : null}
                    </div>
                  ) : null}
                  {pdfUrl ? (
                    <a
                      href={pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="absolute right-3 bottom-3 z-10 rounded-md border bg-card/95 px-2.5 py-1 text-xs shadow-sm hover:bg-accent"
                    >
                      Open in a new tab
                    </a>
                  ) : null}
                  {pdfUrl ? (
                    <iframe
                      title="Resume PDF preview"
                      src={`${pdfUrl}#view=FitH`}
                      className={cn("min-h-0 w-full flex-1 bg-white", compiling && "opacity-60")}
                    />
                  ) : (
                    <div className="m-auto flex items-center gap-2 p-6 text-sm text-muted-foreground">
                      {compiling || engine === null ? (
                        <>
                          <Loader2 className="size-4 animate-spin" /> Compiling… (the first time can take a minute or two)
                        </>
                      ) : (
                        "Press Compile to see the PDF."
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>
          <TabsContent value="ai" forceMount className="min-h-0 flex-1 data-[state=inactive]:hidden">
            <ChatPanel
              ref={chatRef}
              agents={["latex", "resume-tailor"] as AgentId[]}
              context={{ resumeId, industry, jobId: targetJob?.id }}
              getContext={() => ({ latex: latexRef.current, compileLog: logRef.current })}
              scope={{ resumeId }}
              aiReady={aiReady}
              aiLabel={aiLabel}
              onApplyLatex={applyLatex}
              autoSend={autoTailor && tailorPrompt ? { text: tailorPrompt, agent: "latex" } : null}
              className="h-full"
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
