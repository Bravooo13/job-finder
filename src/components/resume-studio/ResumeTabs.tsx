"use client";

import { Code2, LayoutList, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Tab = "content" | "latex" | "ai";

/** Resume tabs. The LaTeX and AI tabs load the first time you open them, then keep their state. */
export function ResumeTabs({
  initial,
  content,
  latex,
  ai,
}: {
  initial: Tab;
  content: ReactNode;
  latex: ReactNode;
  ai: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>(initial);
  const [seen, setSeen] = useState<Set<Tab>>(() => new Set([initial]));

  function open(next: Tab) {
    setTab(next);
    setSeen((s) => new Set(s).add(next));
    const url = new URL(window.location.href);
    if (next === "content") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  }

  return (
    <Tabs value={tab} onValueChange={(v) => open(v as Tab)}>
      <TabsList className="no-scrollbar max-w-full justify-start overflow-x-auto">
        <TabsTrigger value="content" className="gap-1.5">
          <LayoutList className="size-4" /> Content
        </TabsTrigger>
        <TabsTrigger value="latex" className="gap-1.5">
          <Code2 className="size-4" /> LaTeX & PDF
        </TabsTrigger>
        <TabsTrigger value="ai" className="gap-1.5">
          <Sparkles className="size-4" /> AI chat
        </TabsTrigger>
      </TabsList>
      <TabsContent value="content" className="mt-4">
        {content}
      </TabsContent>
      <TabsContent value="latex" forceMount className="mt-4 data-[state=inactive]:hidden">
        {seen.has("latex") ? latex : null}
      </TabsContent>
      <TabsContent value="ai" forceMount className="mt-4 data-[state=inactive]:hidden">
        {seen.has("ai") ? ai : null}
      </TabsContent>
    </Tabs>
  );
}
