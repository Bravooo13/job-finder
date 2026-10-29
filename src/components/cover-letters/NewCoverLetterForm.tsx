"use client";

import { Briefcase, ClipboardPaste, Inbox, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createCoverLetter } from "@/lib/cover-letters/actions";
import { cn } from "@/lib/utils";

type Source = "job" | "found" | "paste";

export function NewCoverLetterForm({
  jobs,
  resumes,
  found,
  initialJobId,
  aiReady,
}: {
  jobs: { id: string; title: string; company: string; resumeId: string | null }[];
  resumes: { id: string; title: string; isMaster: boolean }[];
  found: { id: string; title: string; company: string } | null;
  initialJobId: string;
  aiReady: boolean;
}) {
  const router = useRouter();
  const master = resumes.find((r) => r.isMaster) ?? resumes[0];
  const [source, setSource] = useState<Source>(found ? "found" : initialJobId || jobs.length ? "job" : "paste");
  const [jobId, setJobId] = useState(initialJobId || jobs[0]?.id || "");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [jd, setJd] = useState("");
  const initialResume = jobs.find((j) => j.id === initialJobId)?.resumeId ?? master?.id ?? "";
  const [resumeId, setResumeId] = useState(initialResume);
  const [instructions, setInstructions] = useState("");
  const [pending, start] = useTransition();

  function pickJob(id: string) {
    setJobId(id);
    const tailored = jobs.find((j) => j.id === id)?.resumeId;
    if (tailored) setResumeId(tailored);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const result = await createCoverLetter({
        jobId: source === "job" ? jobId : "",
        foundId: source === "found" && found ? found.id : "",
        company: source === "paste" ? company : "",
        role: source === "paste" ? role : "",
        jobDescription: source === "paste" ? jd : "",
        resumeId,
        instructions,
      });
      if (!result.ok) return void toast.error(result.error);
      router.push(`/cover-letters/${result.data.id}${aiReady ? "?write=1" : ""}`);
    });
  }

  const sources: { value: Source; label: string; icon: typeof Briefcase; hidden?: boolean }[] = [
    { value: "found", label: "Found job", icon: Inbox, hidden: !found },
    { value: "job", label: "One of my jobs", icon: Briefcase, hidden: !jobs.length },
    { value: "paste", label: "Paste a job description", icon: ClipboardPaste },
  ];

  return (
    <form onSubmit={submit} className="grid max-w-3xl gap-6">
      <Card>
        <CardContent className="grid gap-4 pt-6">
          <Label>Which job is it for?</Label>
          <div role="radiogroup" aria-label="Job source" className="flex flex-wrap gap-2">
            {sources
              .filter((s) => !s.hidden)
              .map((s) => (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={source === s.value}
                  onClick={() => setSource(s.value)}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                    source === s.value ? "border-primary bg-primary/5 text-primary ring-1 ring-primary" : "hover:bg-accent",
                  )}
                >
                  <s.icon className="size-4" /> {s.label}
                </button>
              ))}
          </div>

          {source === "found" && found ? (
            <p className="rounded-md bg-muted px-3 py-2 text-sm">
              <span className="font-medium">{found.title}</span> · {found.company}
            </p>
          ) : null}

          {source === "job" ? (
            <Select value={jobId} onValueChange={pickJob}>
              <SelectTrigger aria-label="Job">
                <SelectValue placeholder="Pick a job" />
              </SelectTrigger>
              <SelectContent>
                {jobs.map((j) => (
                  <SelectItem key={j.id} value={j.id}>
                    {j.title} · {j.company}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          {source === "paste" ? (
            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="cl-company">Company</Label>
                  <Input id="cl-company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Analytics" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="cl-role">Role</Label>
                  <Input id="cl-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Data Science Intern" />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cl-jd">Job description</Label>
                <Textarea id="cl-jd" rows={10} value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Paste the full posting" />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4 pt-6">
          <div className="grid gap-1.5">
            <Label htmlFor="cl-resume">Resume to draw from</Label>
            <Select value={resumeId} onValueChange={setResumeId}>
              <SelectTrigger id="cl-resume">
                <SelectValue placeholder="Pick a resume" />
              </SelectTrigger>
              <SelectContent>
                {resumes.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.title}
                    {r.isMaster ? " (master)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cl-notes">Anything to emphasize? (optional)</Label>
            <Textarea
              id="cl-notes"
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Lead with my thesis. Mention I can start in June. Keep it under 300 words."
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {aiReady ? "Write it" : "Create letter"}
        </Button>
      </div>
    </form>
  );
}
