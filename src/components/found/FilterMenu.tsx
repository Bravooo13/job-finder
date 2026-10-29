"use client";

import { Check, ChevronDown, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface FilterOption {
  id: string;
  label: string;
  hint?: string;
  count?: number;
}

/** A filter button that opens a list of options (one or many can be picked). */
export function FilterMenu({
  label,
  options,
  value,
  onChange,
  multiple = true,
  searchable = false,
  hideEmpty = false,
  className,
}: {
  label: string;
  options: FilterOption[];
  value: string[];
  onChange: (next: string[]) => void;
  multiple?: boolean;
  searchable?: boolean;
  hideEmpty?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const shown = hideEmpty ? options.filter((o) => (o.count ?? 0) > 0 || value.includes(o.id)) : options;
  const selected = options.filter((o) => value.includes(o.id));
  const summary =
    selected.length === 0 ? label : selected.length === 1 ? selected[0].label : `${label} · ${selected.length}`;

  function toggle(id: string) {
    if (!multiple) {
      onChange(value.includes(id) ? [] : [id]);
      setOpen(false);
      return;
    }
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={`${label} filter`}
          className={cn("h-8 gap-1 font-normal", selected.length && "border-primary/60 bg-primary/5 text-primary", className)}
        >
          <span className="max-w-[180px] truncate">{summary}</span>
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          {searchable ? <CommandInput placeholder={`Find ${label.toLowerCase()}…`} /> : null}
          <CommandList className="max-h-80">
            <CommandEmpty>Nothing matches.</CommandEmpty>
            <CommandGroup>
              {shown.map((o) => {
                const on = value.includes(o.id);
                return (
                  <CommandItem key={o.id} value={`${o.label} ${o.id}`} onSelect={() => toggle(o.id)} className="items-start gap-2">
                    <span
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center border",
                        multiple ? "rounded-sm" : "rounded-full",
                        on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                      )}
                    >
                      {on ? <Check className="size-3" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block">{o.label}</span>
                      {o.hint ? <span className="block text-xs text-muted-foreground">{o.hint}</span> : null}
                    </span>
                    {o.count !== undefined ? (
                      <span className="text-xs tabular-nums text-muted-foreground">{o.count}</span>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        {selected.length ? (
          <div className="border-t p-1">
            <Button variant="ghost" size="sm" className="h-7 w-full text-xs" onClick={() => onChange([])}>
              <X className="size-3.5" /> Clear {label.toLowerCase()}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
