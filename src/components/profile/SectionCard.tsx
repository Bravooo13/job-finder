"use client";

import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RESUME_SECTIONS, type ResumeSection } from "@/lib/constants";
import type { ResumeEntry } from "@/lib/db/schema";
import { deleteResumeEntry, moveResumeEntry, saveResumeEntry } from "@/lib/resumes/actions";
import { resumeEntrySchema, type ResumeEntryValues } from "@/lib/resumes/schema";
import { dateRange } from "@/lib/utils";

type SectionMeta = (typeof RESUME_SECTIONS)[number];

function EntryDialog({
  open,
  onOpenChange,
  resumeId,
  meta,
  entry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resumeId: string;
  meta: SectionMeta;
  entry: ResumeEntry | null;
}) {
  const uid = useId();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<ResumeEntryValues>(() => toValues(meta.value, entry));
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof ResumeEntryValues>(key: K, value: ResumeEntryValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = resumeEntrySchema.safeParse(values);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setError(null);
    startTransition(async () => {
      const result = await saveResumeEntry(resumeId, entry?.id ?? null, parsed.data);
      if (!result.ok) return void toast.error(result.error);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {entry ? "Edit" : "Add"} {meta.label.toLowerCase()} entry
          </DialogTitle>
        </DialogHeader>
        <form id={`${uid}-form`} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-title`}>{meta.titleLabel}</Label>
            <Input id={`${uid}-title`} value={values.title} onChange={(e) => set("title", e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-org`}>{meta.orgLabel}</Label>
            <Input id={`${uid}-org`} value={values.organization} onChange={(e) => set("organization", e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-start`}>Start</Label>
            <Input id={`${uid}-start`} type="month" value={values.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-end`}>End</Label>
            <Input
              id={`${uid}-end`}
              type="month"
              disabled={values.current}
              value={values.current ? "" : values.endDate}
              onChange={(e) => set("endDate", e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Switch id={`${uid}-current`} checked={values.current} onCheckedChange={(c) => set("current", c)} />
            <Label htmlFor={`${uid}-current`}>I&apos;m still here / ongoing</Label>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-location`}>Location</Label>
            <Input id={`${uid}-location`} value={values.location} onChange={(e) => set("location", e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-url`}>Link</Label>
            <Input id={`${uid}-url`} placeholder="https://…" value={values.url} onChange={(e) => set("url", e.target.value)} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor={`${uid}-desc`}>Description</Label>
            <Textarea
              id={`${uid}-desc`}
              rows={6}
              placeholder={"One achievement per line, e.g.\n- Built a dashboard that cut reporting time by 40%"}
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Lines starting with “-” print as bullet points.</p>
          </div>
          {error ? <p className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={`${uid}-form`} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toValues(section: ResumeSection, entry: ResumeEntry | null): ResumeEntryValues {
  return {
    section,
    title: entry?.title ?? "",
    organization: entry?.organization ?? "",
    location: entry?.location ?? "",
    startDate: entry?.startDate ?? "",
    endDate: entry?.endDate ?? "",
    current: entry?.current ?? false,
    url: entry?.url ?? "",
    description: entry?.description ?? "",
  };
}

export function SectionCard({
  resumeId,
  section,
  entries,
}: {
  resumeId: string;
  section: ResumeSection;
  entries: ResumeEntry[];
}) {
  const meta = RESUME_SECTIONS.find((s) => s.value === section)!;
  const [dialog, setDialog] = useState<{ entry: ResumeEntry | null; key: number } | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(result.error ?? "Something went wrong");
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">{meta.label}</CardTitle>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Add ${meta.label.toLowerCase()}`}
          onClick={() => setDialog({ entry: null, key: Date.now() })}
        >
          <Plus /> Add
        </Button>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing here yet.</p>
        ) : (
          <ul className="divide-y">
            {entries.map((entry, index) => (
              <li key={entry.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{entry.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {[entry.organization, entry.location].filter(Boolean).join(" · ")}
                  </p>
                  {dateRange(entry.startDate, entry.endDate, entry.current) ? (
                    <p className="text-xs text-muted-foreground">
                      {dateRange(entry.startDate, entry.endDate, entry.current)}
                    </p>
                  ) : null}
                  {entry.description ? (
                    <p className="mt-1 line-clamp-3 text-sm whitespace-pre-line">{entry.description}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-start gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={pending || index === 0}
                    aria-label="Move up"
                    onClick={() => run(() => moveResumeEntry(resumeId, entry.id, "up"))}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={pending || index === entries.length - 1}
                    aria-label="Move down"
                    onClick={() => run(() => moveResumeEntry(resumeId, entry.id, "down"))}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`Edit ${entry.title}`}
                    onClick={() => setDialog({ entry, key: Date.now() })}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={pending}
                    aria-label={`Delete ${entry.title}`}
                    onClick={() => run(() => deleteResumeEntry(resumeId, entry.id))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {dialog ? (
        <EntryDialog
          key={dialog.key}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          resumeId={resumeId}
          meta={meta}
          entry={dialog.entry}
        />
      ) : null}
    </Card>
  );
}
