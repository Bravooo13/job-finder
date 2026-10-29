"use client";

import { CheckCircle2, Download, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface TectonicStatus {
  installed: boolean;
  version?: string;
  path?: string;
  source?: "app" | "system";
  platformSupported: boolean;
  error?: string;
}

export async function fetchTectonicStatus(fresh = false): Promise<TectonicStatus> {
  const res = await fetch(`/api/latex/status${fresh ? "?fresh=1" : ""}`, { cache: "no-store" });
  return res.json();
}

export async function installTectonicEngine(): Promise<TectonicStatus> {
  const res = await fetch("/api/latex/install", { method: "POST" });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Install failed");
  return body;
}

export function LatexEngineCard() {
  const [status, setStatus] = useState<TectonicStatus | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    void fetchTectonicStatus(true).then(setStatus);
  }, []);

  async function install() {
    setInstalling(true);
    try {
      setStatus(await installTectonicEngine());
      toast.success("LaTeX engine installed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setInstalling(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          LaTeX engine
          {status?.installed ? (
            <Badge variant="secondary" className="gap-1 font-normal">
              <CheckCircle2 className="size-3 text-emerald-600" /> Tectonic {status.version}
            </Badge>
          ) : null}
        </CardTitle>
        <CardDescription>
          Resumes in the LaTeX editor are turned into PDFs by Tectonic, a small LaTeX program that runs on this computer.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {status === null ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : status.installed ? (
          <p className="text-muted-foreground">
            {status.source === "app" ? "Installed by Job Finder" : "Using the copy already on this computer"} at{" "}
            <code className="rounded bg-muted px-1 text-xs">{status.path}</code>. LaTeX packages download automatically the
            first time they&apos;re used, then stay cached.
          </p>
        ) : (
          <>
            <p className="text-muted-foreground">
              Not installed yet. Job Finder can download the official build (about 15 MB) into its data folder. The first PDF
              then takes a minute or two while LaTeX packages download.
            </p>
            {status.error ? <p className="text-destructive">{status.error}</p> : null}
            <div>
              <Button onClick={install} disabled={installing || !status.platformSupported}>
                {installing ? <Loader2 className="animate-spin" /> : <Download />}
                {installing ? "Installing…" : "Install Tectonic"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
