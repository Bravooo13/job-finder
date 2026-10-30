"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Menu, Settings } from "lucide-react";
import { useEffect, useState } from "react";
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

function SettingsLink({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = pathname.startsWith("/settings");
  return (
    <Link
      href="/settings"
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Settings className="size-4" />
      Settings
    </Link>
  );
}

/** How many things wait for you (AI requests, held applications), checked every half minute. */
function useWaitingCount(): number {
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  useEffect(() => {
    let stop = false;
    const check = () =>
      fetch("/api/control", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!stop && d?.waiting) setCount(Number(d.waiting.total) || 0);
        })
        .catch(() => {});
    void check();
    const t = setInterval(check, 30_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [pathname]);
  return count;
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const waiting = useWaitingCount();
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
            {href === "/activity" && waiting > 0 ? (
              <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[11px] leading-none font-semibold text-primary-foreground tabular-nums" aria-label={`${waiting} waiting for you`}>
                {waiting}
              </span>
            ) : null}
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
      <div className="flex flex-col gap-3">
        <SettingsLink />
        <ThemeToggle />
      </div>
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
          <div className="flex flex-col gap-3">
            <SettingsLink onNavigate={() => setOpen(false)} />
            <ThemeToggle />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
