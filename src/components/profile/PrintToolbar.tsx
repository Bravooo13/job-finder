"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function PrintToolbar({ backHref }: { backHref: string }) {
  return (
    <div className="no-print mx-auto mb-4 flex w-full max-w-[8.5in] items-center justify-between px-4 sm:px-0">
      <Button variant="ghost" asChild>
        <Link href={backHref}>
          <ArrowLeft /> Back to editor
        </Link>
      </Button>
      <div className="flex items-center gap-3">
        <span className="hidden text-sm text-neutral-600 sm:inline">
          Choose “Save as PDF” in the print dialog.
        </span>
        <Button onClick={() => window.print()}>
          <Printer /> Print / Save PDF
        </Button>
      </div>
    </div>
  );
}
