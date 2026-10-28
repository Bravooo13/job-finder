"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { removeCompanyBoard } from "@/lib/search/actions";

export function RemoveCompanyButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Remove ${name}`}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await removeCompanyBoard(id);
          router.refresh();
        })
      }
    >
      <Trash2 />
    </Button>
  );
}
