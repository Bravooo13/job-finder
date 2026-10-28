"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";
import { ThemeToggle } from "./ThemeToggle";

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 px-2 font-semibold tracking-tight">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Compass className="size-4" />
      </span>
      <span className="text-lg">{APP_NAME}</span>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col justify-between border-r bg-card px-3 py-5 md:flex">
      <div className="flex flex-col gap-6">
        <Brand />
        <NavLinks />
      </div>
      <ThemeToggle />
    </aside>
  );
}

export function MobileHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-card/95 px-4 py-3 backdrop-blur md:hidden">
      <Brand />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open menu">
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="flex w-64 flex-col justify-between p-4">
          <div className="flex flex-col gap-6 pt-2">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <Brand />
            <NavLinks onNavigate={() => setOpen(false)} />
          </div>
          <ThemeToggle />
        </SheetContent>
      </Sheet>
    </header>
  );
}
