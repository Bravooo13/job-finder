"use client";

import { Loader2, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FoundBoard } from "@/lib/boards/detect";
import { PROVIDER_LABELS } from "@/lib/boards/types";
import { addCompanyBoard, lookUpCompany } from "@/lib/search/actions";

export function AddCompany() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [results, setResults] = useState<FoundBoard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [looking, startLook] = useTransition();
  const [adding, startAdd] = useTransition();

  function look() {
    setError(null);
    setResults(null);
    startLook(async () => {
      const r = await lookUpCompany(input);
      if (!r.ok) setError(r.error);
      else setResults(r.data);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Company name or careers link"
            className="pl-9"
            placeholder="Company name, careers page, or a link to one of its jobs"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                look();
              }
            }}
          />
        </div>
        <Button onClick={look} disabled={looking || !input.trim()}>
          {looking ? <Loader2 className="animate-spin" /> : null}
          Find
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Works for companies whose careers pages run on Greenhouse, Lever, Ashby or Workday. For Workday, paste a link to the
        careers site (it contains myworkdayjobs.com).
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {results ? (
        <ul className="flex flex-col divide-y rounded-lg border">
          {results.map((b) => (
            <li key={`${b.provider}:${b.token}:${b.site ?? ""}`} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{b.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {PROVIDER_LABELS[b.provider]} · {b.jobCount.toLocaleString()} open jobs ·{" "}
                  <a href={b.careersUrl} target="_blank" rel="noreferrer" className="hover:underline">
                    {b.careersUrl.replace(/^https?:\/\//, "")}
                  </a>
                </p>
              </div>
              <Button
                size="sm"
                disabled={adding}
                onClick={() =>
                  startAdd(async () => {
                    const r = await addCompanyBoard(b);
                    if (!r.ok) return void toast.error(r.error);
                    toast.success(`Added ${b.name}`);
                    setResults(null);
                    setInput("");
                    router.refresh();
                  })
                }
              >
                <Plus /> Add
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
