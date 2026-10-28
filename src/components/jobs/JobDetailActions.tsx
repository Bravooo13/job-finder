"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
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
import { deleteJob } from "@/lib/jobs/actions";

export function DeleteJobButton({ jobId, title }: { jobId: string; title: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await deleteJob(jobId);
      if (!result.ok) return void toast.error(result.error);
      toast.success("Job deleted");
      router.push("/jobs");
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Delete job">
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this job?</AlertDialogTitle>
          <AlertDialogDescription>
            &ldquo;{title}&rdquo; and its notes will be permanently removed. To just hide it, set
            its status to Archived instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirm} disabled={pending} className="bg-destructive-bg text-destructive-foreground hover:bg-destructive-bg/90">
            {pending ? <Loader2 className="animate-spin" /> : null}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
