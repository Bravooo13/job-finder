import { ACTOR_LABELS, type Actor } from "@/lib/control/shared";
import { cn } from "@/lib/utils";

const DOT: Record<Actor, string> = {
  you: "bg-foreground/60",
  assistant: "bg-primary",
  outside: "bg-violet-500",
  extension: "bg-amber-500",
  scheduler: "bg-sky-500",
};

/** Who did it: You, AI in Job Finder (with the agent), Outside AI (with the client), Browser helper, Schedule. */
export function ActorBadge({ actor, via, className }: { actor: Actor; via?: string | null; className?: string }) {
  const showVia = via && actor !== "you" && via !== ACTOR_LABELS[actor];
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium", className)}>
      <span className={cn("size-1.5 shrink-0 rounded-full", DOT[actor])} aria-hidden />
      <span className="truncate">
        {ACTOR_LABELS[actor]}
        {showVia ? <span className="font-normal text-muted-foreground"> · {via}</span> : null}
      </span>
    </span>
  );
}
