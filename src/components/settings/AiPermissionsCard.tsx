"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { saveAiPermissions } from "@/lib/control/server-actions";
import { formatUsd, LEVEL_LABELS, LEVELS, type ActionInfo, type GroupId, type Level } from "@/lib/control/shared";

export interface PermissionGroupView {
  id: GroupId;
  label: string;
  description: string;
  fixed?: boolean;
  level: Level;
  actions: ActionInfo[];
}

const SAME = "__group__";

function LevelSelect({ value, onChange, label, allowSame, groupLevel }: { value: string; onChange: (v: string) => void; label: string; allowSame?: boolean; groupLevel?: Level }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="w-40 shrink-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowSame ? <SelectItem value={SAME}>Same as group ({LEVEL_LABELS[groupLevel ?? "allow"]})</SelectItem> : null}
        {LEVELS.map((l) => (
          <SelectItem key={l} value={l}>
            {LEVEL_LABELS[l]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AiPermissionsCard({ groups: initial, overrides: initialOverrides, dailyCapUsd, spentToday }: {
  groups: PermissionGroupView[];
  overrides: Record<string, Level>;
  dailyCapUsd: number | null;
  spentToday: number;
}) {
  const [groups, setGroups] = useState(initial);
  const [overrides, setOverrides] = useState(initialOverrides);
  const [cap, setCap] = useState(dailyCapUsd === null ? "" : String(dailyCapUsd));
  const [capOn, setCapOn] = useState(dailyCapUsd !== null);
  const [savedCap, setSavedCap] = useState(dailyCapUsd);
  const [pending, start] = useTransition();

  const save = (input: Parameters<typeof saveAiPermissions>[0], done?: () => void) =>
    start(async () => {
      const r = await saveAiPermissions(input);
      if (!r.ok) return void toast.error(r.error);
      done?.();
      toast.success("Saved");
    });

  const capValue = capOn ? Number(cap) : null;
  const capValid = !capOn || (cap.trim() !== "" && Number.isFinite(capValue) && (capValue ?? 0) >= 0 && (capValue ?? 0) <= 1000);

  return (
    <Card id="ai-permissions">
      <CardHeader>
        <CardTitle>What AI may do</CardTitle>
        <CardDescription>
          For the Job Finder assistant, the Job scout and outside AIs (Claude Code or Claude Desktop through MCP). You can always do everything yourself.
          &ldquo;Ask me first&rdquo; steps wait in{" "}
          <Link href="/activity" className="font-medium text-primary hover:underline">
            Activity → Waiting for you
          </Link>
          , and everything any AI does is in the activity log.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <ul className="grid gap-3">
          {groups.map((g) => (
            <li key={g.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{g.label}</p>
                  <p className="text-xs text-muted-foreground">{g.description}</p>
                </div>
                {g.fixed ? (
                  <span className="shrink-0 rounded-md border px-3 py-1.5 text-sm text-muted-foreground">Always</span>
                ) : (
                  <LevelSelect
                    label={`${g.label}: what AI may do`}
                    value={g.level}
                    onChange={(v) => {
                      const level = v as Level;
                      save({ groups: { [g.id]: level } }, () => setGroups((all) => all.map((x) => (x.id === g.id ? { ...x, level } : x))));
                    }}
                  />
                )}
              </div>
              {!g.fixed && g.actions.length ? (
                <Collapsible className="mt-2">
                  <CollapsibleTrigger className="group flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                    {g.actions.length} action{g.actions.length === 1 ? "" : "s"}
                    {g.actions.some((a) => overrides[a.name]) ? " (some set on their own)" : ""}
                    <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <ul className="mt-2 grid gap-2">
                      {g.actions.map((a) => (
                        <li key={a.name} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm">{a.title}</p>
                            <p className="font-mono text-[11px] text-muted-foreground">{a.name}</p>
                          </div>
                          <LevelSelect
                            label={`${a.title}: what AI may do`}
                            allowSame
                            groupLevel={g.level}
                            value={overrides[a.name] ?? SAME}
                            onChange={(v) => {
                              const level = v === SAME ? null : (v as Level);
                              save({ actions: { [a.name]: level } }, () =>
                                setOverrides((o) => {
                                  const next = { ...o };
                                  if (level) next[a.name] = level;
                                  else delete next[a.name];
                                  return next;
                                }),
                              );
                            }}
                          />
                        </li>
                      ))}
                    </ul>
                  </CollapsibleContent>
                </Collapsible>
              ) : null}
            </li>
          ))}
        </ul>

        <div className="grid gap-2 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Label htmlFor="ai-cap" className="text-sm font-medium">
                Daily AI limit
              </Label>
              <p className="text-xs text-muted-foreground">
                All AI use stops for the day at this amount (chats, agents, Auto apply&apos;s written answers). Spent today: {formatUsd(spentToday)}.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch aria-label="Use a daily AI limit" checked={capOn} onCheckedChange={setCapOn} />
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">$</span>
                <Input
                  id="ai-cap"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={1000}
                  step={0.5}
                  className="w-24"
                  disabled={!capOn}
                  value={cap}
                  onChange={(e) => setCap(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                disabled={pending || !capValid || capValue === savedCap}
                onClick={() => save({ dailyCapUsd: capValue }, () => setSavedCap(capValue))}
              >
                {pending ? <Loader2 className="animate-spin" /> : null}
                Save limit
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
