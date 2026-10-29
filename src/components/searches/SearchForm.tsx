"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PROVIDER_LABELS } from "@/lib/boards/types";
import { createSearch, keywordsFromResume, updateSearch } from "@/lib/search/actions";
import { SEARCH_SOURCES, splitLines, splitList, TITLE_PRESETS, type SearchFormValues, type SearchSource } from "@/lib/search/schema";
import { cn } from "@/lib/utils";

const LEVELS = [
  { value: "internship", label: "Internships & co-ops" },
  { value: "entry", label: "Entry level & new grad" },
  { value: "any", label: "Any level" },
] as const;

const HOURS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: new Date(2000, 0, 1, h).toLocaleTimeString("en-US", { hour: "numeric" }),
}));

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
    </Card>
  );
}

function Check({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  id: string;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-input accent-[hsl(var(--primary))]"
      />
      {label}
    </label>
  );
}

export function SearchForm({
  searchId,
  initial,
  resumes,
  myCompanyCount,
  directoryCount,
}: {
  searchId?: string;
  initial: SearchFormValues;
  resumes: { id: string; title: string; isMaster: boolean }[];
  myCompanyCount: number;
  directoryCount: number;
}) {
  const router = useRouter();
  const uid = useId();
  const [v, setV] = useState<SearchFormValues>(initial);
  const [saving, startSave] = useTransition();
  const [suggesting, startSuggest] = useTransition();
  const set = <K extends keyof SearchFormValues>(key: K, value: SearchFormValues[K]) =>
    setV((s) => ({ ...s, [key]: value }));
  const f = (name: string) => `${uid}-${name}`;

  function toggle<T extends string>(list: T[], value: T, on: boolean): T[] {
    return on ? Array.from(new Set([...list, value])) : list.filter((x) => x !== value);
  }

  function addTitles(titles: string[]) {
    const merged = splitLines([v.titles, ...titles].join("\n"));
    set("titles", merged.join("\n"));
  }

  function suggest() {
    if (!v.resumeId) return void toast.error("Pick a resume first");
    startSuggest(async () => {
      const result = await keywordsFromResume(v.resumeId);
      if (!result.ok) return void toast.error(result.error);
      const merged = splitList([v.keywords, ...result.data].join("\n"));
      set("keywords", merged.join(", "));
      toast.success(`Added ${result.data.length} keywords from your resume`);
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startSave(async () => {
      if (searchId) {
        const result = await updateSearch(searchId, v);
        if (!result.ok) return void toast.error(result.error);
        toast.success("Search saved");
        router.push(`/searches/${searchId}`);
      } else {
        const result = await createSearch(v);
        if (!result.ok) return void toast.error(result.error);
        toast.success("Search created");
        router.push(`/searches/${result.data.id}`);
      }
      router.refresh();
    });
  }

  const titleCount = splitLines(v.titles).length;
  const keywordCount = splitList(v.keywords).length;

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-2">
      <div className="grid content-start gap-6">
        <Section title="Name">
          <Input id={f("name")} aria-label="Search name" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="Summer 2027 data internships" />
        </Section>

        <Section
          title="Job titles to look for"
          description="One per line. Word forms are matched, so “data scientist” also finds “Data Science Intern”."
        >
          <div className="flex flex-wrap gap-1.5">
            {TITLE_PRESETS.map((p) => (
              <Button key={p.label} type="button" variant="outline" size="sm" onClick={() => addTitles(p.titles)}>
                + {p.label}
              </Button>
            ))}
          </div>
          <Textarea
            id={f("titles")}
            aria-label="Job titles"
            rows={8}
            value={v.titles}
            onChange={(e) => set("titles", e.target.value)}
            placeholder={"data scientist\ndata analyst\nmachine learning"}
          />
          <p className="text-xs text-muted-foreground">{titleCount} titles</p>
        </Section>

        <Section title="Level">
          <div className="grid gap-2">
            {LEVELS.map((l) => (
              <Check
                key={l.value}
                id={f(`level-${l.value}`)}
                label={l.label}
                checked={v.levels.includes(l.value)}
                onChange={(on) => set("levels", toggle(v.levels, l.value, on))}
              />
            ))}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={f("exclude")}>Skip titles containing</Label>
            <Input
              id={f("exclude")}
              value={v.excludeWords}
              onChange={(e) => set("excludeWords", e.target.value)}
              placeholder="senior, staff, director"
            />
            <p className="text-xs text-muted-foreground">Comma separated. Senior titles are already skipped unless you pick “Any level”.</p>
          </div>
        </Section>
      </div>

      <div className="grid content-start gap-6">
        <Section title="Where" description="Cities include everything within 50 miles. You can also use states or countries.">
          <Textarea
            id={f("locations")}
            aria-label="Locations"
            rows={3}
            value={v.locations}
            onChange={(e) => set("locations", e.target.value)}
            placeholder={"Chicago, IL\nUnited States"}
          />
          <div className="flex items-center gap-2">
            <Switch id={f("remote")} checked={v.includeRemote} onCheckedChange={(c) => set("includeRemote", c)} />
            <Label htmlFor={f("remote")}>Include remote jobs</Label>
          </div>
        </Section>

        <Section
          title="Your skills"
          description="Jobs that mention more of these score higher. Pulled from your resume, and you can add more."
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={v.resumeId || "__none__"} onValueChange={(x) => set("resumeId", x === "__none__" ? "" : x)}>
              <SelectTrigger aria-label="Resume to match" className="sm:flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No resume</SelectItem>
                {resumes.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.title}
                    {r.isMaster ? " (master)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" onClick={suggest} disabled={suggesting || !v.resumeId}>
              {suggesting ? <Loader2 className="animate-spin" /> : <Sparkles />}
              Suggest from resume
            </Button>
          </div>
          <Textarea
            id={f("keywords")}
            aria-label="Keywords"
            rows={5}
            value={v.keywords}
            onChange={(e) => set("keywords", e.target.value)}
            placeholder="Python, SQL, machine learning, Tableau"
          />
          <p className="text-xs text-muted-foreground">
            {keywordCount} keywords{v.resumeId ? ", plus the skills section of the selected resume" : ""}
          </p>
        </Section>

        <Section title="Which companies">
          <div className="grid gap-2" role="radiogroup" aria-label="Which companies">
            {[
              { value: "all", label: `All ${directoryCount.toLocaleString()} built-in company boards, plus your ${myCompanyCount} companies` },
              { value: "mine", label: `Only your companies (${myCompanyCount})` },
            ].map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={f("scope")}
                  checked={v.companyScope === o.value}
                  onChange={() => set("companyScope", o.value as SearchFormValues["companyScope"])}
                  className="size-4 accent-[hsl(var(--primary))]"
                />
                {o.label}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {SEARCH_SOURCES.map((p) => (
              <Check
                key={p}
                id={f(`src-${p}`)}
                label={p === "linkedin" ? "LinkedIn (public job search)" : PROVIDER_LABELS[p]}
                checked={v.sources.includes(p)}
                onChange={(on) => set("sources", toggle<SearchSource>(v.sources, p, on))}
              />
            ))}
          </div>
        </Section>

        <Section title="Results and schedule">
          <div className="grid gap-1.5">
            <Label htmlFor={f("min")}>Only keep jobs scoring at least {v.minScore}</Label>
            <input
              id={f("min")}
              type="range"
              min={0}
              max={90}
              step={5}
              value={v.minScore}
              onChange={(e) => set("minScore", Number(e.target.value))}
              className="w-full accent-[hsl(var(--primary))]"
            />
            <p className="text-xs text-muted-foreground">Lower finds more jobs; higher keeps only close matches. 40–50 is a good start.</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={f("hour")}>Run automatically</Label>
            <Select value={String(v.scheduleHour)} onValueChange={(x) => set("scheduleHour", Number(x))}>
              <SelectTrigger id={f("hour")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="-1">Only when I press Run</SelectItem>
                {HOURS.map((h) => (
                  <SelectItem key={h.value} value={h.value}>
                    Every day at {h.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Runs while Job Finder is open. If it was closed at that time, it runs next time you open it.</p>
          </div>
        </Section>

        <div className={cn("flex justify-end gap-2")}>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            {searchId ? "Save search" : "Create search"}
          </Button>
        </div>
      </div>
    </form>
  );
}
