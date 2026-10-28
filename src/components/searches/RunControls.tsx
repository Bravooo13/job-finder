"use client";

import { Loader2, Play, Square, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { deleteSearch, runSearch, stopRun } from "@/lib/search/actions";

/** Refreshes the page every few seconds while a search is running. */
export function AutoRefresh({ active, everyMs = 2500 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(t);
  }, [active, everyMs, router]);
  return null;
}

export function RunButton({
  searchId,
  running,
  size = "default",
}: {
  searchId: string;
  running: boolean;
  size?: "default" | "sm";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (running) {
    return (
      <Button
        variant="outline"
        size={size}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await stopRun(searchId);
            toast("Stopping…");
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <Square />}
        Stop
      </Button>
    );
  }
  return (
    <Button
      size={size}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await runSearch(searchId);
          if (!result.ok) return void toast.error(result.error);
          toast.success("Search started. Results appear as each company is checked.");
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Play />}
      Run now
    </Button>
  );
}

export function DeleteSearchButton({ searchId, name }: { searchId: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Delete search">
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{name}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            The search and its unreviewed finds are removed. Jobs you already saved stay in My jobs.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            className="bg-destructive-bg text-destructive-foreground hover:bg-destructive-bg/90"
            onClick={() =>
              startTransition(async () => {
                await deleteSearch(searchId);
                toast.success("Search deleted");
                router.push("/searches");
              })
            }
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
