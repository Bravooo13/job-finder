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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createIndustryVersion } from "@/lib/resumes/actions";

export const INDUSTRIES = [
  "Data science & analytics",
  "Quantitative research & trading",
  "Finance & investment banking",
  "Economic consulting",
  "Management consulting",
  "Economics research",
  "Software engineering",
  "Product & business analysis",
];

const NONE = "__none__";
const OTHER = "__other__";

export function IndustryVersionDialog({
  trigger,
  fromId,
  jobs,
  aiReady,
}: {
  trigger: React.ReactNode;
  fromId: string;
  jobs: { id: string; title: string; company: string }[];
  aiReady: boolean;
}) {
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(INDUSTRIES[0]);
  const [custom, setCustom] = useState("");
  const [jobId, setJobId] = useState("");
  const [title, setTitle] = useState("");
  const [pending, start] = useTransition();
  const industry = choice === OTHER ? custom.trim() : choice;
  const job = jobs.find((j) => j.id === jobId);
  const suggestedTitle = job ? `${job.company} – ${job.title}` : `Resume – ${industry || "new industry"}`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const result = await createIndustryVersion({ fromId, industry, title: title || suggestedTitle, targetJobId: jobId });
      if (!result.ok) return void toast.error(result.error);
      setOpen(false);
      toast.success(aiReady ? "New version made. The AI is tailoring it now." : "New version made");
      router.push(`/profile/resumes/${result.data.id}?tab=latex${aiReady ? "&tailor=1" : ""}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New version for an industry</DialogTitle>
          <DialogDescription>
            Copies this resume, opens it in the LaTeX editor and has the AI rework it for the field you pick. You review the
            changes before anything is applied.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-industry`}>Industry</Label>
            <Select value={choice} onValueChange={setChoice}>
              <SelectTrigger id={`${uid}-industry`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((i) => (
                  <SelectItem key={i} value={i}>
                    {i}
                  </SelectItem>
                ))}
                <SelectItem value={OTHER}>Something else…</SelectItem>
              </SelectContent>
            </Select>
            {choice === OTHER ? (
              <Input
                aria-label="Industry name"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="e.g. Healthcare analytics"
                autoFocus
              />
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-job`}>Aim it at a saved job (optional)</Label>
            <Select value={jobId || NONE} onValueChange={(v) => setJobId(v === NONE ? "" : v)}>
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
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-title`}>Name</Label>
            <Input id={`${uid}-title`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={suggestedTitle} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !industry}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Make it
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
