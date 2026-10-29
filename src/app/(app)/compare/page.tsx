import { Plus } from "lucide-react";
import Link from "next/link";
import { ChatPanel } from "@/components/ai/ChatPanel";
import { ComparePicker } from "@/components/compare/ComparePicker";
import { CompareTable, compareUrl } from "@/components/compare/CompareTable";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { getAiStatus } from "@/lib/ai/settings";
import { compareItems, comparePicker, idsFromParam, MAX_COMPARE } from "@/lib/compare/queries";

export const metadata = { title: "Compare" };
export const dynamic = "force-dynamic";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ found?: string | string[]; jobs?: string | string[]; pick?: string }>;
}) {
  const p = await searchParams;
  const foundIds = idsFromParam(p.found);
  const jobIds = idsFromParam(p.jobs);
  const [items, ai] = await Promise.all([compareItems(foundIds, jobIds), getAiStatus()]);
  const showPicker = items.length < 2 || p.pick === "1";
  const picker = showPicker ? await comparePicker() : null;
  const tooMany = foundIds.length + jobIds.length > MAX_COMPARE;

  return (
    <>
      <PageHeader
        title="Compare"
        description="Jobs side by side: fit, visa outlook, pay, place and level. Ask the AI to rank them and plan your applications."
        actions={
          items.length >= 2 && !showPicker ? (
            <Button variant="outline" asChild>
              <Link href={`${compareUrl(items)}&pick=1`}>
                <Plus /> Change jobs
              </Link>
            </Button>
          ) : null
        }
      />
      {tooMany ? (
        <p className="mb-4 text-sm text-amber-700 dark:text-amber-400">Showing the first {MAX_COMPARE} jobs.</p>
      ) : null}
      <div className="grid gap-6">
        {items.length ? <CompareTable items={items} /> : null}
        {picker ? (
          <ComparePicker
            mine={picker.mine}
            top={picker.top}
            checked={items.map((i) => i.id)}
          />
        ) : null}
        {items.length >= 2 ? (
          <section aria-label="AI comparison" className="grid gap-2">
            <h2 className="text-lg font-semibold">Ask the AI</h2>
            <ChatPanel
              agents={["compare"]}
              context={{ foundIds: items.filter((i) => i.kind === "found").map((i) => i.id), jobIds: items.filter((i) => i.kind === "job").map((i) => i.id) }}
              scope={{ agent: "compare" }}
              aiReady={ai.ready}
              aiLabel={ai.label}
              className="h-[640px]"
            />
          </section>
        ) : null}
      </div>
    </>
  );
}
