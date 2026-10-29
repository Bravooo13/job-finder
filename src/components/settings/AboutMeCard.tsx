"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { saveAboutMe } from "@/lib/ai/actions";

const EXAMPLE = `For example:
- Statistics major, graduating May 2027.
- Looking for data and analytics internships in Chicago or remote.
- Will need visa sponsorship.
- Writing voice: warm and specific, no corporate buzzwords. Sign letters "Best,".
- Strongest stories: my senior thesis; my summer analytics internship.`;

export function AboutMeCard({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle>About you</CardTitle>
        <CardDescription>
          Every agent reads this along with your resume: goals, constraints, your writing voice, stories to lean on.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Textarea
          aria-label="About you"
          rows={9}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={EXAMPLE}
          className="min-h-48"
        />
        <div className="flex items-center gap-3">
          <Button
            aria-label="Save notes about you"
            disabled={pending || text === saved}
            onClick={() =>
              start(async () => {
                const result = await saveAboutMe(text);
                if (!result.ok) return void toast.error(result.error);
                setSaved(text);
                toast.success("Saved");
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : null}
            Save
          </Button>
          <span className="text-xs text-muted-foreground">{text.length.toLocaleString()} / 8,000</span>
        </div>
      </CardContent>
    </Card>
  );
}
