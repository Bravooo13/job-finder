import { Columns3 } from "lucide-react";
import { VisaBadge } from "@/components/found/FoundList";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Option {
  id: string;
  title: string;
  company: string;
  score: number | null;
  visa?: string | null;
  status?: string;
}

function Group({ name, legend, options, checked }: { name: string; legend: string; options: Option[]; checked: Set<string> }) {
  return (
    <fieldset className="grid content-start gap-1">
      <legend className="mb-2 text-sm font-semibold">{legend}</legend>
      {options.map((o) => (
        <label key={o.id} className="flex items-start gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
          <input type="checkbox" name={name} value={o.id} defaultChecked={checked.has(o.id)} className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{o.title}</span>
            <span className="block text-xs text-muted-foreground">
              {o.company}
              {o.score != null ? ` · score ${o.score}` : ""}
            </span>
          </span>
          {o.visa && o.visa !== "unknown" ? <VisaBadge visa={o.visa} /> : null}
        </label>
      ))}
      {!options.length ? <p className="px-2 text-sm text-muted-foreground">Nothing here yet.</p> : null}
    </fieldset>
  );
}

/** A plain form: ticking jobs and pressing Compare loads /compare?found=…&jobs=…. */
export function ComparePicker({
  mine,
  top,
  checked,
}: {
  mine: Option[];
  top: Option[];
  checked: string[];
}) {
  const set = new Set(checked);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pick 2 to 6 jobs</CardTitle>
        <CardDescription>From your saved jobs or the best new finds. You can also tick jobs in Found jobs and press Compare.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action="/compare" method="get" className="grid gap-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Group name="jobs" legend="My jobs" options={mine} checked={set} />
            <Group name="found" legend="Top found jobs" options={top} checked={set} />
          </div>
          <div className="sticky bottom-4 flex justify-end">
            <Button type="submit" className="shadow-lg">
              <Columns3 /> Compare
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
