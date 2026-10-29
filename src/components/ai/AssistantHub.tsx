"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AGENTS, type AgentId } from "@/lib/ai/agents";
import { cn } from "@/lib/utils";
import { AGENT_ICONS, ChatPanel } from "./ChatPanel";

const NONE = "__none__";

export function AssistantHub({
  resumes,
  jobs,
  aiReady,
  aiLabel,
  initialAgent,
  initialJobId,
}: {
  resumes: { id: string; title: string; isMaster: boolean }[];
  jobs: { id: string; title: string; company: string }[];
  aiReady: boolean;
  aiLabel: string;
  initialAgent: AgentId;
  initialJobId: string;
}) {
  const [agent, setAgent] = useState<AgentId>(initialAgent);
  const [resumeId, setResumeId] = useState(resumes.find((r) => r.isMaster)?.id ?? resumes[0]?.id ?? "");
  const [jobId, setJobId] = useState(initialJobId);
  const [jd, setJd] = useState("");
  const [industry, setIndustry] = useState("");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const selected = AGENTS.find((a) => a.id === agent)!;

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="flex flex-col gap-5">
        <div className="grid gap-1.5" role="radiogroup" aria-label="Agent">
          {AGENTS.map((a) => {
            const Icon = AGENT_ICONS[a.icon];
            const active = a.id === agent;
            return (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setAgent(a.id)}
                className={cn(
                  "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                  active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent",
                )}
              >
                <Icon className={cn("mt-0.5 size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                <span>
                  <span className="block text-sm font-medium">{a.name}</span>
                  <span className="block text-xs text-muted-foreground">{a.description}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid gap-4 rounded-lg border p-3">
          <div className="grid gap-1.5">
            <Label htmlFor="hub-resume">Resume</Label>
            <Select value={resumeId || NONE} onValueChange={(v) => setResumeId(v === NONE ? "" : v)}>
              <SelectTrigger id="hub-resume">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {resumes.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.title}
                    {r.isMaster ? " (master)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selected.reads.includes("job") ? (
            <div className="grid gap-1.5">
              <Label htmlFor="hub-job">Job</Label>
              <Select value={jobId || NONE} onValueChange={(v) => setJobId(v === NONE ? "" : v)}>
                <SelectTrigger id="hub-job">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {jobs.map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.title} · {j.company}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!jobId ? (
                <Collapsible>
                  <CollapsibleTrigger className="group flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    Or paste a job description
                    <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <Textarea aria-label="Job description" rows={6} value={jd} onChange={(e) => setJd(e.target.value)} />
                  </CollapsibleContent>
                </Collapsible>
              ) : null}
            </div>
          ) : null}
          {selected.reads.includes("jobs") ? (
            <fieldset className="grid gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">Jobs to compare</legend>
              <div className="grid max-h-56 gap-1 overflow-y-auto">
                {jobs.map((j) => (
                  <label key={j.id} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4"
                      checked={compareIds.includes(j.id)}
                      disabled={!compareIds.includes(j.id) && compareIds.length >= 8}
                      onChange={(e) => setCompareIds((ids) => (e.target.checked ? [...ids, j.id] : ids.filter((x) => x !== j.id)))}
                    />
                    <span>
                      {j.title} · <span className="text-muted-foreground">{j.company}</span>
                    </span>
                  </label>
                ))}
                {!jobs.length ? <p className="text-xs text-muted-foreground">No saved jobs yet.</p> : null}
              </div>
              <p className="text-xs text-muted-foreground">
                To compare found jobs, tick them in{" "}
                <Link href="/found" className="font-medium text-primary hover:underline">
                  Found jobs
                </Link>{" "}
                and press Compare.
              </p>
            </fieldset>
          ) : null}
          {selected.reads.includes("industry") ? (
            <div className="grid gap-1.5">
              <Label htmlFor="hub-industry">Target industry</Label>
              <Input id="hub-industry" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Optional" />
            </div>
          ) : null}
        </div>
      </div>

      <ChatPanel
        key={agent}
        agents={[agent]}
        context={{ resumeId, jobId, jobDescription: jobId ? null : jd, industry, jobIds: selected.reads.includes("jobs") ? compareIds : null }}
        scope={{ agent }}
        aiReady={aiReady}
        aiLabel={aiLabel}
        className="h-[calc(100vh-11rem)] min-h-[560px]"
      />
    </div>
  );
}
