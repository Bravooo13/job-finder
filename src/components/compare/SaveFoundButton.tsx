"use client";

import { Bookmark, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveFoundJob } from "@/lib/search/actions";

export function SaveFoundButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await saveFoundJob(id);
          if (!r.ok) return void toast.error(r.error);
          toast.success("Saved to My jobs", { action: { label: "Open", onClick: () => router.push(`/jobs/${r.data.jobId}`) } });
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Bookmark />} Save
    </Button>
  );
}
