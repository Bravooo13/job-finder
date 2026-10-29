"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { ChatPanel } from "@/components/ai/ChatPanel";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AgentId } from "@/lib/ai/agents";

const NONE = "__none__";

export function ResumeAiTab({
  resumeId,
  industry: initialIndustry,
  jobs,
  defaultJobId,
  aiReady,
  aiLabel,
}: {
  resumeId: string;
  industry: string | null;
  jobs: { id: string; title: string; company: string }[];
  defaultJobId: string | null;
  aiReady: boolean;
  aiLabel: string;
}) {
  const [jobId, setJobId] = useState(defaultJobId ?? "");
  const [jd, setJd] = useState("");
  const [industry, setIndustry] = useState(initialIndustry ?? "");

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="ai-job">Job to compare against</Label>
          <Select value={jobId || NONE} onValueChange={(v) => setJobId(v === NONE ? "" : v)}>
            <SelectTrigger id="ai-job">
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
          <p className="text-xs text-muted-foreground">From My jobs. Save a found job to use it here.</p>
        </div>
        <Collapsible>
          <CollapsibleTrigger className="group flex items-center gap-1 text-sm font-medium">
            Or paste a job description
            <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <Textarea
              aria-label="Job description"
              rows={8}
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="Paste the posting here"
            />
          </CollapsibleContent>
        </Collapsible>
        <div className="grid gap-1.5">
          <Label htmlFor="ai-industry">Target industry</Label>
          <Input
            id="ai-industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="e.g. Quantitative research"
          />
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          The agents read this resume, the job and your notes from Settings. Switch agents at the top of the chat.
        </p>
      </div>
      <ChatPanel
        agents={["resume-tailor", "job-fit", "interview-prep", "outreach"] as AgentId[]}
        context={{ resumeId, jobId: jobId || null, jobDescription: jobId ? null : jd, industry }}
        scope={{ resumeId }}
        aiReady={aiReady}
        aiLabel={aiLabel}
        className="h-[calc(100vh-13rem)] min-h-[520px]"
      />
    </div>
  );
}
