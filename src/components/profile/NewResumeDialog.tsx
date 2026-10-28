"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
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
import { createResume } from "@/lib/resumes/actions";
import type { NewResumeValues } from "@/lib/resumes/schema";

const NONE = "__none__";

export function NewResumeDialog({
  trigger,
  resumes,
  jobs,
  defaults,
}: {
  trigger: React.ReactNode;
  resumes: { id: string; title: string; isMaster: boolean }[];
  jobs: { id: string; title: string; company: string }[];
  defaults?: Partial<NewResumeValues>;
}) {
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<NewResumeValues>({ title: "", copyFromId: "", targetJobId: "" });
  const [pending, startTransition] = useTransition();
  const isFirst = resumes.length === 0;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      const master = resumes.find((r) => r.isMaster);
      setValues({
        title: isFirst ? "Master profile" : "",
        copyFromId: master?.id ?? "",
        targetJobId: "",
        ...defaults,
      });
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createResume(values);
      if (!result.ok) return void toast.error(result.error);
      toast.success("Resume created");
      setOpen(false);
      router.push(`/profile/resumes/${result.data.id}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isFirst ? "Create your master profile" : "New resume"}</DialogTitle>
          <DialogDescription>
            {isFirst
              ? "Your master profile holds everything about you. Tailored resumes are copies of it that you trim for each job."
              : "Start from your master profile and trim it for a specific job, or start blank."}
          </DialogDescription>
        </DialogHeader>
        <form id={`${uid}-form`} onSubmit={submit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-title`}>Name</Label>
            <Input
              id={`${uid}-title`}
              required
              maxLength={150}
              placeholder="e.g. Data Analyst – Acme"
              value={values.title}
              onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
            />
          </div>
          {!isFirst ? (
            <div className="grid gap-1.5">
              <Label htmlFor={`${uid}-copy`}>Start from</Label>
              <Select
                value={values.copyFromId || NONE}
                onValueChange={(v) => setValues((s) => ({ ...s, copyFromId: v === NONE ? "" : v }))}
              >
                <SelectTrigger id={`${uid}-copy`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Blank resume</SelectItem>
                  {resumes.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      Copy of {r.title}
                      {r.isMaster ? " (master)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {jobs.length ? (
            <div className="grid gap-1.5">
              <Label htmlFor={`${uid}-job`}>Tailored for</Label>
              <Select
                value={values.targetJobId || NONE}
                onValueChange={(v) => setValues((s) => ({ ...s, targetJobId: v === NONE ? "" : v }))}
              >
                <SelectTrigger id={`${uid}-job`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No specific job</SelectItem>
                  {jobs.map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.title} · {j.company}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form={`${uid}-form`} disabled={pending || !values.title.trim()}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
