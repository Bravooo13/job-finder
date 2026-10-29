"use client";

import { ChevronDown, Loader2, RotateCcw } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AGENT_ICONS } from "@/components/ai/ChatPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { saveAgentPrompt } from "@/lib/ai/actions";
import { AGENTS, type Agent } from "@/lib/ai/agents";

function AgentPrompt({ agent, custom }: { agent: Agent; custom?: string }) {
  const [text, setText] = useState(custom ?? agent.prompt);
  const [saved, setSaved] = useState(custom ?? agent.prompt);
  const [pending, start] = useTransition();
  const Icon = AGENT_ICONS[agent.icon];
  const isCustom = saved.trim() !== agent.prompt.trim();

  function save(value: string | null) {
    start(async () => {
      const result = await saveAgentPrompt(agent.id, value);
      if (!result.ok) return void toast.error(result.error);
      const next = value ?? agent.prompt;
      setText(next);
      setSaved(next);
      toast.success(value === null ? `${agent.name} reset to the built-in instructions` : `${agent.name} saved`);
    });
  }

  return (
    <Collapsible className="rounded-lg border">
      <CollapsibleTrigger className="group flex w-full items-center gap-3 px-4 py-3 text-left">
        <Icon className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 font-medium">
            {agent.name}
            {isCustom ? (
              <Badge variant="secondary" className="font-normal">
                Edited
              </Badge>
            ) : null}
          </span>
          <span className="block text-sm text-muted-foreground">{agent.description}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="grid gap-3 border-t px-4 py-3">
        <Textarea
          aria-label={`${agent.name} instructions`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={14}
          className="font-mono text-xs leading-relaxed"
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={pending || text === saved} onClick={() => save(text)}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Save
          </Button>
          <Button size="sm" variant="outline" disabled={pending || !isCustom} onClick={() => save(null)}>
            <RotateCcw /> Reset to built-in
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function AgentPromptsCard({ custom }: { custom: Record<string, string> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Agents</CardTitle>
        <CardDescription>
          Each agent has its own instructions. Edit them to change how it works; your resume, the job and the notes above
          are added automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {AGENTS.map((a) => (
          <AgentPrompt key={a.id} agent={a} custom={custom[a.id]} />
        ))}
      </CardContent>
    </Card>
  );
}
