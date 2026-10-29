"use client";

import { Check, ChevronDown, ChevronRight, Copy, FileCode2, Wand2 } from "lucide-react";
import { memo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-xs"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {done ? "Copied" : label}
    </Button>
  );
}

/** A full LaTeX document in a reply: collapsed, with Apply. */
function LatexBlock({ code, onApply, streaming }: { code: string; onApply?: (code: string) => void; streaming?: boolean }) {
  const [open, setOpen] = useState(false);
  const lines = code.split("\n").length;
  const complete = code.includes("\\end{document}");
  return (
    <div className="not-prose rounded-md border bg-background">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <FileCode2 className="size-4 text-primary" />
        <span className="text-sm font-medium">{streaming && !complete ? "Writing LaTeX…" : "Updated LaTeX"}</span>
        <span className="text-xs text-muted-foreground">{lines} lines</span>
        <div className="ml-auto flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setOpen((o) => !o)}>
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            {open ? "Hide" : "Show"}
          </Button>
          <CopyButton text={code} />
          {onApply && complete && !streaming ? (
            <Button type="button" size="sm" className="h-7 px-2.5 text-xs" onClick={() => onApply(code)}>
              <Wand2 className="size-3.5" /> Apply to editor
            </Button>
          ) : null}
        </div>
      </div>
      {open ? (
        <pre className="max-h-80 overflow-auto border-t bg-muted px-3 py-2 font-mono text-xs leading-relaxed">{code}</pre>
      ) : null}
    </div>
  );
}

function MarkdownImpl({
  text,
  onApplyLatex,
  streaming,
}: {
  text: string;
  onApplyLatex?: (code: string) => void;
  streaming?: boolean;
}) {
  const components: Components = {
    pre: ({ children }) => <>{children}</>,
    code: ({ className, children }) => {
      const code = String(children ?? "").replace(/\n$/, "");
      const lang = /language-(\w+)/.exec(className ?? "")?.[1];
      const isBlock = Boolean(lang) || code.includes("\n");
      if (!isBlock) return <code>{children}</code>;
      if ((lang === "latex" || lang === "tex") && code.includes("\\documentclass")) {
        return <LatexBlock code={code} onApply={onApplyLatex} streaming={streaming} />;
      }
      return (
        <div className="group relative">
          <pre>
            <code>{code}</code>
          </pre>
          <div className="absolute top-1 right-1 opacity-0 transition-opacity group-hover:opacity-100">
            <CopyButton text={code} />
          </div>
        </div>
      );
    },
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    ),
  };
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(MarkdownImpl);
export { CopyButton };
