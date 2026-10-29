"use client";

import { Download, ExternalLink, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const DATA_HUB = "https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub";

interface Stats {
  employers: number;
  fiscalYear: number | null;
}

export function H1bDataCard({ initial }: { initial: Stats }) {
  const [stats, setStats] = useState(initial);
  const [busy, setBusy] = useState<"download" | "upload" | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function download() {
    setBusy("download");
    try {
      const res = await fetch("/api/h1b/download", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setStats(body.stats);
      toast.success(`Loaded H-1B data for ${body.years.map((y: { year: number }) => y.year).join(" and ")}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e), { duration: 10_000 });
    } finally {
      setBusy(null);
    }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy("upload");
    try {
      const form = new FormData();
      for (const f of Array.from(files)) form.append("file", f);
      const res = await fetch("/api/h1b", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setStats(body.stats);
      const employers = body.results.reduce((s: number, r: { employers: number }) => s + r.employers, 0);
      toast.success(`Imported ${employers.toLocaleString()} employers`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          H-1B employer history
          {stats.employers ? (
            <Badge variant="secondary">
              {stats.employers.toLocaleString()} employers{stats.fiscalYear ? ` · FY${stats.fiscalYear}` : ""}
            </Badge>
          ) : (
            <Badge variant="outline">Not loaded</Badge>
          )}
        </CardTitle>
        <CardDescription>
          USCIS publishes how many H-1B petitions each employer got approved. With it, Found jobs shows an “H-1B sponsor” badge
          on companies with a record and the visa filter can rank them, even when the posting doesn&apos;t say.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <Button onClick={download} disabled={busy !== null}>
            {busy === "download" ? <Loader2 className="animate-spin" /> : <Download />} Download from USCIS
          </Button>
          <Button variant="outline" onClick={() => input.current?.click()} disabled={busy !== null}>
            {busy === "upload" ? <Loader2 className="animate-spin" /> : <Upload />} Upload CSV
          </Button>
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            multiple
            className="hidden"
            aria-label="H-1B data CSV"
            onChange={(e) => void upload(e.target.files)}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          If the download is refused, open the{" "}
          <a href={DATA_HUB} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">
            H-1B Employer Data Hub <ExternalLink className="size-3" />
          </a>
          , choose a fiscal year, download the CSV and upload it here. Several years can be added; the newest numbers win.
        </p>
      </CardContent>
    </Card>
  );
}
