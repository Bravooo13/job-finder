"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Link2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { JOB_SOURCES, JOB_STATUSES, JOB_TYPES, WORKPLACES } from "@/lib/constants";
import { createJob, importJob, updateJob } from "@/lib/jobs/actions";
import { emptyJobForm, jobFormSchema, type JobFormValues } from "@/lib/jobs/schema";
import { cn } from "@/lib/utils";

const NONE = "__none__";

export interface ResumeOption {
  id: string;
  title: string;
  isMaster: boolean;
}

interface JobFormDialogProps {
  trigger: React.ReactNode;
  companyNames: string[];
  resumes: ResumeOption[];
  /** Present when editing an existing job. */
  job?: { id: string; values: JobFormValues };
  /** Opens with the link importer focused. */
  startWithImport?: boolean;
}

function Field({
  label,
  htmlFor,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function OptionSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  allowNone,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
  placeholder: string;
  allowNone?: boolean;
}) {
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowNone ? <SelectItem value={NONE}>{placeholder}</SelectItem> : null}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function JobFormDialog({
  trigger,
  companyNames,
  resumes,
  job,
  startWithImport,
}: JobFormDialogProps) {
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importNote, setImportNote] = useState<
    { kind: "warning" | "error"; text: string; duplicate?: { id: string; title: string } } | null
  >(null);
  const [importing, startImport] = useTransition();
  const [saving, startSave] = useTransition();

  const form = useForm<JobFormValues>({
    resolver: zodResolver(jobFormSchema),
    defaultValues: job?.values ?? emptyJobForm,
  });
  const { register, handleSubmit, setValue, watch, reset, getValues, formState } = form;
  const errors = formState.errors;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      reset(job?.values ?? emptyJobForm);
      setImportUrl("");
      setImportNote(null);
    }
  }

  function runImport() {
    if (!importUrl.trim()) return;
    setImportNote(null);
    startImport(async () => {
      const result = await importJob(importUrl);
      if (!result.ok) {
        setImportNote({ kind: "error", text: result.error, duplicate: result.duplicate });
        if (!getValues("url")) setValue("url", importUrl.trim());
        return;
      }
      const j = result.job;
      reset({
        ...getValues(),
        title: j.title || getValues("title"),
        company: j.company || getValues("company"),
        location: j.location ?? "",
        description: j.description ?? "",
        url: j.url,
        source: j.source,
        jobType: j.jobType ?? "",
        workplace: j.workplace ?? "",
        salary: j.salary ?? "",
        postedAt: j.postedAt ?? "",
      });
      if (result.duplicate) {
        setImportNote({
          kind: "warning",
          text: "You've already saved this job.",
          duplicate: result.duplicate,
        });
      } else if (result.warning) {
        setImportNote({ kind: "warning", text: result.warning });
      } else {
        toast.success("Job details filled in. Review and save.");
      }
    });
  }

  function onSubmit(values: JobFormValues) {
    startSave(async () => {
      if (job) {
        const result = await updateJob(job.id, values);
        if (!result.ok) return void toast.error(result.error);
        toast.success("Job updated");
        setOpen(false);
        router.refresh();
      } else {
        const result = await createJob(values);
        if (!result.ok) return void toast.error(result.error);
        toast.success("Job saved");
        setOpen(false);
        router.push(`/jobs/${result.data.id}`);
      }
    });
  }

  const f = (name: string) => `${uid}-${name}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{job ? "Edit job" : "Add a job"}</DialogTitle>
          <DialogDescription>
            {job
              ? "Update the details of this job."
              : "Paste a job link to fill this in automatically, or type the details yourself."}
          </DialogDescription>
        </DialogHeader>

        {!job ? (
          <div className="rounded-lg border bg-muted/40 p-3">
            <Label htmlFor={f("import")} className="mb-1.5 flex items-center gap-1.5">
              <Link2 className="size-4" /> Import from a job link
            </Label>
            <div className="flex gap-2">
              <Input
                id={f("import")}
                autoFocus={startWithImport}
                placeholder="https://boards.greenhouse.io/company/jobs/123…"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    runImport();
                  }
                }}
              />
              <Button type="button" variant="secondary" onClick={runImport} disabled={importing || !importUrl.trim()}>
                {importing ? <Loader2 className="animate-spin" /> : null}
                Fetch
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Works with Greenhouse, Lever, Ashby, Workday and most company career pages.
            </p>
            {importNote ? (
              <div
                className={cn(
                  "mt-2 flex items-start gap-2 rounded-md p-2 text-sm",
                  importNote.kind === "error"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                )}
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  {importNote.text}{" "}
                  {importNote.duplicate ? (
                    <Link href={`/jobs/${importNote.duplicate.id}`} className="font-medium underline">
                      Open saved job
                    </Link>
                  ) : null}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        <form id={f("form")} onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2">
          <Field label="Job title" htmlFor={f("title")} error={errors.title?.message}>
            <Input id={f("title")} {...register("title")} />
          </Field>
          <Field label="Company" htmlFor={f("company")} error={errors.company?.message}>
            <Input id={f("company")} list={f("companies")} autoComplete="off" {...register("company")} />
            <datalist id={f("companies")}>
              {companyNames.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Location" htmlFor={f("location")}>
            <Input id={f("location")} placeholder="Chicago, IL" {...register("location")} />
          </Field>
          <Field label="Workplace" htmlFor={f("workplace")}>
            <OptionSelect
              id={f("workplace")}
              value={watch("workplace")}
              onChange={(v) => setValue("workplace", v)}
              options={WORKPLACES}
              placeholder="Not specified"
              allowNone
            />
          </Field>
          <Field label="Job type" htmlFor={f("jobType")}>
            <OptionSelect
              id={f("jobType")}
              value={watch("jobType")}
              onChange={(v) => setValue("jobType", v)}
              options={JOB_TYPES}
              placeholder="Not specified"
              allowNone
            />
          </Field>
          <Field label="Status" htmlFor={f("status")}>
            <OptionSelect
              id={f("status")}
              value={watch("status")}
              onChange={(v) => setValue("status", v as JobFormValues["status"])}
              options={JOB_STATUSES}
              placeholder="Status"
            />
          </Field>
          <Field label="Source" htmlFor={f("source")}>
            <Input id={f("source")} list={f("sources")} autoComplete="off" placeholder="LinkedIn, Handshake…" {...register("source")} />
            <datalist id={f("sources")}>
              {JOB_SOURCES.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <Field label="Salary" htmlFor={f("salary")}>
            <Input id={f("salary")} placeholder="$80,000 – $95,000" {...register("salary")} />
          </Field>
          <Field label="Job link" htmlFor={f("url")} className="sm:col-span-2">
            <Input id={f("url")} type="url" placeholder="https://…" {...register("url")} />
          </Field>
          <Field label="Date applied" htmlFor={f("dateApplied")}>
            <Input id={f("dateApplied")} type="date" {...register("dateApplied")} />
          </Field>
          <Field label="Apply by" htmlFor={f("dueDate")}>
            <Input id={f("dueDate")} type="date" {...register("dueDate")} />
          </Field>
          <Field label="Resume used" htmlFor={f("resumeId")}>
            <OptionSelect
              id={f("resumeId")}
              value={watch("resumeId")}
              onChange={(v) => setValue("resumeId", v)}
              options={resumes.map((r) => ({
                value: r.id,
                label: r.isMaster ? `${r.title} (master)` : r.title,
              }))}
              placeholder="None"
              allowNone
            />
          </Field>
          <Field label="Skills mentioned" htmlFor={f("skills")}>
            <Input id={f("skills")} placeholder="Python, SQL, Tableau" {...register("skills")} />
          </Field>
          <Field label="Job description" htmlFor={f("description")} className="sm:col-span-2">
            <Textarea
              id={f("description")}
              rows={10}
              className="max-h-[40vh] font-mono text-xs leading-relaxed"
              placeholder="Paste the full job description. It's used for matching your resume later."
              {...register("description")}
            />
          </Field>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form={f("form")} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            {job ? "Save changes" : "Save job"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
