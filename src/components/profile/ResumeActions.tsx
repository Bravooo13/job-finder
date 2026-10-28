"use client";

import { Crown, Loader2, MoreHorizontal, Printer, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteResume, setMasterResume } from "@/lib/resumes/actions";

export function ResumeActions({
  resumeId,
  title,
  isMaster,
  redirectAfterDelete,
}: {
  resumeId: string;
  title: string;
  isMaster: boolean;
  redirectAfterDelete?: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`More actions for ${title}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => window.open(`/resume/${resumeId}/print`, "_blank")}>
            <Printer /> Print or save as PDF
          </DropdownMenuItem>
          {!isMaster ? (
            <DropdownMenuItem
              onSelect={() =>
                startTransition(async () => {
                  const result = await setMasterResume(resumeId);
                  if (result.ok) toast.success(`"${title}" is now your master profile`);
                  else toast.error(result.error);
                })
              }
            >
              <Crown /> Make master profile
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirming(true)}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{title}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This resume and all its sections will be permanently removed. Jobs that used it
              will keep their details.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              className="bg-destructive-bg text-destructive-foreground hover:bg-destructive-bg/90"
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteResume(resumeId);
                  if (!result.ok) return void toast.error(result.error);
                  toast.success("Resume deleted");
                  if (redirectAfterDelete) router.push("/profile");
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
