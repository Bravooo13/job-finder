"use client";

import { ChevronDown } from "lucide-react";
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
        context={{ resumeId, jobId, jobDescription: jobId ? null : jd, industry }}
        scope={{ agent }}
        aiReady={aiReady}
        aiLabel={aiLabel}
        className="h-[calc(100vh-11rem)] min-h-[560px]"
      />
    </div>
  );
}
