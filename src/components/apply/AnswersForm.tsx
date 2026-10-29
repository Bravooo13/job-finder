"use client";

import { Info, Loader2, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveMyAnswers } from "@/lib/apply/actions";
import type { ApplyProfile } from "@/lib/apply/profile-schema";
import { cn } from "@/lib/utils";

type Key = keyof ApplyProfile;
type TextKey = Exclude<Key, "custom">;

const YES_NO: { value: "yes" | "no" | ""; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "", label: "Not set" },
];

function YesNo({ label, hint, value, onChange }: { label: string; hint?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="flex shrink-0 gap-1 rounded-md border p-0.5" role="radiogroup" aria-label={label}>
        {YES_NO.map((o) => (
          <button
            key={o.value || "unset"}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded px-3 py-1 text-sm",
              value === o.value ? (o.value ? "bg-primary text-primary-foreground" : "bg-muted") : "text-muted-foreground hover:bg-accent",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AnswersForm({ initial }: { initial: ApplyProfile }) {
  const [p, setP] = useState<ApplyProfile>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [pending, start] = useTransition();
  const set = (k: Key, v: unknown) => setP((x) => ({ ...x, [k]: v }));
  const dirty = JSON.stringify(p) !== saved;

  const field = (k: TextKey, label: string, opts: { placeholder?: string; type?: string; hint?: string } = {}) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`a-${k}`}>{label}</Label>
      <Input
        id={`a-${k}`}
        type={opts.type ?? "text"}
        value={p[k] as string}
        onChange={(e) => set(k, e.target.value)}
        placeholder={opts.placeholder}
      />
      {opts.hint ? <p className="text-xs text-muted-foreground">{opts.hint}</p> : null}
    </div>
  );

  function save() {
    start(async () => {
      const r = await saveMyAnswers({ ...p, custom: p.custom.filter((c) => c.question.trim()) });
      if (!r.ok) return void toast.error(r.error);
      setP(r.data);
      setSaved(JSON.stringify(r.data));
      toast.success("Answers saved");
    });
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Work authorization</CardTitle>
          <CardDescription>
            Application forms ask these in different ways. Job Finder answers each wording from these settings, and flags the
            ambiguous ones for you to check.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Alert>
            <Info className="size-4" />
            <AlertTitle>For F-1 students</AlertTitle>
            <AlertDescription>
              <p>
                The usual honest answers: authorized to work in the US <b>yes</b> (through CPT/OPT), need sponsorship to start{" "}
                <b>no</b>, need sponsorship in the future <b>yes</b> (H-1B after OPT). So “Will you now or in the future require
                sponsorship?” gets <b>Yes</b>. Check with your school&apos;s international office if you&apos;re unsure.
              </p>
            </AlertDescription>
          </Alert>
          <YesNo label="Legally authorized to work in the US" value={p.authorizedToWork} onChange={(v) => set("authorizedToWork", v)} />
          <YesNo
            label="Need visa sponsorship to start this job"
            hint="Answers “Do you currently require sponsorship?”"
            value={p.needsSponsorshipNow}
            onChange={(v) => set("needsSponsorshipNow", v)}
          />
          <YesNo
            label="Will need visa sponsorship in the future"
            hint="Answers “Will you now or in the future require sponsorship (e.g. H-1B)?”"
            value={p.needsSponsorshipLater}
            onChange={(v) => set("needsSponsorshipLater", v)}
          />
          <YesNo label="US citizen" value={p.usCitizen} onChange={(v) => set("usCitizen", v)} />
          <YesNo label="US permanent resident (green card)" value={p.permanentResident} onChange={(v) => set("permanentResident", v)} />
          <YesNo
            label="U.S. person for export-control rules"
            hint="Citizens, green card holders, refugees and asylees. Answers ITAR/EAR questions."
            value={p.usPerson}
            onChange={(v) => set("usPerson", v)}
          />
          <YesNo label="Have an active security clearance" value={p.hasClearance} onChange={(v) => set("hasClearance", v)} />
          <div className="grid gap-4 sm:grid-cols-2">
            {field("visaStatus", "Visa status", { placeholder: "F-1 student (CPT/OPT)" })}
            {field("citizenship", "Country of citizenship")}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
          <CardDescription>Filled in from your master resume until you change them here.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {field("firstName", "First name")}
          {field("lastName", "Last name")}
          {field("preferredName", "Preferred name")}
          {field("pronouns", "Pronouns", { placeholder: "Optional" })}
          {field("email", "Email", { type: "email" })}
          {field("phone", "Phone", { type: "tel" })}
          {field("street", "Street address", { hint: "Only used when a form asks for it" })}
          {field("city", "City")}
          {field("state", "State")}
          {field("zip", "ZIP code")}
          {field("country", "Country")}
          {field("linkedin", "LinkedIn URL")}
          {field("github", "GitHub URL")}
          {field("website", "Website or portfolio")}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Education</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {field("school", "Current school")}
          {field("degree", "Degree", { placeholder: "Master of Science" })}
          {field("major", "Major")}
          {field("gpa", "GPA", { placeholder: "Leave blank to skip" })}
          {field("graduation", "Graduation (YYYY-MM)", { placeholder: "2028-05" })}
          {field("previousSchool", "Previous school")}
          {field("previousDegree", "Previous degree")}
          {field("previousGraduation", "Previous graduation (YYYY-MM)")}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Availability and other questions</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {field("startDate", "Earliest start (YYYY-MM)", { placeholder: "2027-06" })}
            {field("availability", "Availability", { placeholder: "Summer 2027 (June to August)" })}
            {field("salaryExpectation", "Pay expectation", { placeholder: "Leave blank to skip" })}
            {field("hearAbout", "How you heard about jobs", { placeholder: "LinkedIn" })}
            {field("languages", "Languages")}
          </div>
          <YesNo label="At least 18 years old" value={p.over18} onChange={(v) => set("over18", v)} />
          <YesNo label="Willing to relocate" value={p.willingToRelocate} onChange={(v) => set("willingToRelocate", v)} />
          <YesNo label="Worked at the company before (default)" value={p.workedHereBefore} onChange={(v) => set("workedHereBefore", v)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Voluntary self-identification</CardTitle>
          <CardDescription>Leave these blank and forms get “I don&apos;t wish to answer”.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {field("gender", "Gender")}
          {field("hispanicLatino", "Hispanic or Latino")}
          {field("race", "Race / ethnicity")}
          {field("veteran", "Veteran status")}
          {field("disability", "Disability")}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your own questions</CardTitle>
          <CardDescription>Questions you get often, with your answer. Matched by wording.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {p.custom.map((c, i) => (
            <div key={i} className="grid gap-2 rounded-lg border p-3">
              <div className="flex gap-2">
                <Input
                  aria-label="Question"
                  value={c.question}
                  onChange={(e) => set("custom", p.custom.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))}
                  placeholder="Question"
                />
                <Button variant="ghost" size="icon" aria-label="Remove question" onClick={() => set("custom", p.custom.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
              <Textarea
                aria-label="Answer"
                rows={2}
                value={c.answer}
                onChange={(e) => set("custom", p.custom.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))}
                placeholder="Your answer"
              />
            </div>
          ))}
          <div>
            <Button variant="outline" onClick={() => set("custom", [...p.custom, { question: "", answer: "" }])}>
              <Plus /> Add a question
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-4 flex justify-end">
        <Button onClick={save} disabled={!dirty || pending} className="shadow-lg" aria-label="Save answers">
          {pending ? <Loader2 className="animate-spin" /> : null}
          Save answers
        </Button>
      </div>
    </div>
  );
}
