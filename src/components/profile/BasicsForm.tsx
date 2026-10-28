"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useId, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Resume } from "@/lib/db/schema";
import { updateResumeBasics } from "@/lib/resumes/actions";
import { resumeBasicsSchema, type ResumeBasicsValues } from "@/lib/resumes/schema";

const FIELDS: { name: keyof ResumeBasicsValues; label: string; placeholder?: string; type?: string }[] = [
  { name: "fullName", label: "Full name" },
  { name: "headline", label: "Headline", placeholder: "Data analyst · CS student at …" },
  { name: "email", label: "Email", type: "email" },
  { name: "phone", label: "Phone", type: "tel" },
  { name: "location", label: "Location", placeholder: "Chicago, IL" },
  { name: "website", label: "Website / portfolio" },
  { name: "linkedin", label: "LinkedIn" },
  { name: "github", label: "GitHub" },
];

export function BasicsForm({ resume }: { resume: Resume }) {
  const uid = useId();
  const [pending, startTransition] = useTransition();
  const form = useForm<ResumeBasicsValues>({
    resolver: zodResolver(resumeBasicsSchema),
    defaultValues: {
      title: resume.title,
      fullName: resume.fullName ?? "",
      headline: resume.headline ?? "",
      email: resume.email ?? "",
      phone: resume.phone ?? "",
      location: resume.location ?? "",
      website: resume.website ?? "",
      linkedin: resume.linkedin ?? "",
      github: resume.github ?? "",
      summary: resume.summary ?? "",
    },
  });
  const { register, handleSubmit, formState, reset } = form;

  function onSubmit(values: ResumeBasicsValues) {
    startTransition(async () => {
      const result = await updateResumeBasics(resume.id, values);
      if (!result.ok) return void toast.error(result.error);
      reset(values);
      toast.success("Saved");
    });
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Basics</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor={`${uid}-title`}>Resume name (only you see this)</Label>
            <Input id={`${uid}-title`} {...register("title")} />
            {formState.errors.title ? (
              <p className="text-xs text-destructive">{formState.errors.title.message}</p>
            ) : null}
          </div>
          {FIELDS.map((f) => (
            <div key={f.name} className="grid gap-1.5">
              <Label htmlFor={`${uid}-${f.name}`}>{f.label}</Label>
              <Input id={`${uid}-${f.name}`} type={f.type} placeholder={f.placeholder} {...register(f.name)} />
            </div>
          ))}
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor={`${uid}-summary`}>Summary</Label>
            <Textarea
              id={`${uid}-summary`}
              rows={4}
              placeholder="Two or three sentences on who you are and what you're looking for."
              {...register("summary")}
            />
          </div>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={pending || !formState.isDirty}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Save basics
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
