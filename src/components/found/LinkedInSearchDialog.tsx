"use client";

import { Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Run {
  id: string;
  state: "running" | "done" | "error";
  message: string;
  error?: string;
}

const POSTED = [
  { days: 1, label: "Past 24 hours" },
  { days: 3, label: "Past 3 days" },
  { days: 7, label: "Past week" },
  { days: 14, label: "Past 2 weeks" },
  { days: 30, label: "Past month" },
];

/** Search LinkedIn from Job Finder: no scrolling, no extension, no login. */
export function LinkedInSearchDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [keywords, setKeywords] = useState("");
  const [location, setLocation] = useState("Chicago, Illinois, United States");
  const [link, setLink] = useState("");
  const [days, setDays] = useState(7);
  const [pages, setPages] = useState(1);
  const [remote, setRemote] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const busy = status !== null;

  async function start() {
    const body = link.trim()
      ? { searchUrl: link.trim(), pages, by: "you" }
      : { keywords: keywords.trim(), location: remote ? undefined : location.trim() || undefined, remote, postedDays: days, pages, by: "you" };
    if (!link.trim() && !keywords.trim()) return void toast.error("Type what you're looking for, or paste a LinkedIn search link.");
    setStatus("Starting…");
    try {
      const res = await fetch("/api/grab/linkedin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      let run: Run = await res.json();
      if (!res.ok && !("id" in run)) throw new Error((run as unknown as { error: string }).error);
      while (run.state === "running") {
        setStatus(run.message);
        await new Promise((r) => setTimeout(r, 2500));
        run = await fetch(`/api/grab/linkedin?id=${encodeURIComponent(run.id)}`).then((r) => r.json());
      }
      if (run.state === "error") throw new Error(run.error || run.message);
      toast.success(run.message, { duration: 8000 });
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setStatus(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <DialogTrigger asChild>
        <Button>
          <Search /> Search LinkedIn
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Search LinkedIn</DialogTitle>
          <DialogDescription>
            Job Finder reads the results for you, one job at a time (about a minute per 25), and adds them to Found jobs with
            their industry and visa wording. No scrolling and no LinkedIn login.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="li-what">What</Label>
            <Input id="li-what" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="data analyst intern" disabled={busy || Boolean(link.trim())} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="li-where">Where</Label>
            <Input id="li-where" value={location} onChange={(e) => setLocation(e.target.value)} disabled={busy || remote || Boolean(link.trim())} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={remote} onChange={(e) => setRemote(e.target.checked)} disabled={busy || Boolean(link.trim())} />
              Remote jobs in the US instead
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="li-posted">Posted</Label>
              <select id="li-posted" value={days} onChange={(e) => setDays(Number(e.target.value))} disabled={busy || Boolean(link.trim())} className="h-9 rounded-md border bg-background px-2 text-sm">
                {POSTED.map((p) => (
                  <option key={p.days} value={p.days}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="li-pages">How many</Label>
              <select id="li-pages" value={pages} onChange={(e) => setPages(Number(e.target.value))} disabled={busy} className="h-9 rounded-md border bg-background px-2 text-sm">
                {[1, 2, 3, 5].map((n) => (
                  <option key={n} value={n}>
                    {n * 25} jobs ({n} {n === 1 ? "page" : "pages"})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="li-link">Or paste a LinkedIn search link</Label>
            <Input id="li-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://www.linkedin.com/jobs/search/?keywords=…" disabled={busy} />
            <p className="text-xs text-muted-foreground">Keeps the filters you set on LinkedIn (date posted, experience level, remote…).</p>
          </div>
        </div>
        <DialogFooter>
          {status ? (
            <p className="mr-auto flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
              <Loader2 className="size-4 animate-spin" /> {status}
            </p>
          ) : null}
          <Button onClick={start} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Search />} {busy ? "Searching…" : "Search"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
