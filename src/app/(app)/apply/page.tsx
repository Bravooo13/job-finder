import { Bot, Chrome, ListChecks, MessageSquareText } from "lucide-react";
import { ApplyQueue } from "@/components/apply/ApplyQueue";
import { AnswersForm } from "@/components/apply/AnswersForm";
import { AutoApply } from "@/components/apply/AutoApply";
import { ExtensionSetup } from "@/components/apply/ExtensionSetup";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAiStatus } from "@/lib/ai/settings";
import { getAutoSettings, getResumeFile, helperLastSeen, listTasks, openTasksFor } from "@/lib/apply/auto";
import { getApplyProfile } from "@/lib/apply/profile";
import { applyQueue } from "@/lib/apply/queue";

export const metadata = { title: "Apply" };
export const dynamic = "force-dynamic";

export default async function ApplyPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const [items, profile, list, settings, resumeFile, ai] = await Promise.all([
    applyQueue(),
    getApplyProfile(),
    listTasks({ limit: 200 }),
    getAutoSettings(),
    getResumeFile(),
    getAiStatus(),
  ]);
  const open = await openTasksFor({ jobIds: items.map((i) => i.id) });
  const autoByJob = Object.fromEntries(
    open.filter((t) => t.jobId && ["queued", "running", "submitting", "held", "needs_you"].includes(t.status)).map((t) => [t.jobId!, { status: t.status, summary: t.summary }]),
  );
  const seen = helperLastSeen();
  const waiting = (list.counts.held ?? 0) + (list.counts.needs_you ?? 0);
  return (
    <>
      <PageHeader
        title="Apply"
        description="Jobs you saved and haven't applied to, Auto apply, your standard answers for application forms, and the browser helper that fills them in."
      />
      <Tabs defaultValue={tab === "answers" || tab === "extension" || tab === "auto" ? tab : "queue"}>
        <TabsList className="no-scrollbar max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="queue" className="gap-1.5">
            <ListChecks className="size-4" /> To apply ({items.length})
          </TabsTrigger>
          <TabsTrigger value="auto" className="gap-1.5">
            <Bot className="size-4" /> Auto apply{waiting ? ` (${waiting} need you)` : ""}
          </TabsTrigger>
          <TabsTrigger value="answers" className="gap-1.5">
            <MessageSquareText className="size-4" /> My answers
          </TabsTrigger>
          <TabsTrigger value="extension" className="gap-1.5">
            <Chrome className="size-4" /> Browser helper
          </TabsTrigger>
        </TabsList>
        <TabsContent value="queue" className="mt-4">
          <ApplyQueue items={items} auto={autoByJob} />
        </TabsContent>
        <TabsContent value="auto" className="mt-4 max-w-4xl">
          <AutoApply
            initial={{
              ...list,
              settings,
              resumeFile,
              ai: { ready: ai.ready, label: ai.label, applyModel: ai.settings.applyModel },
              helper: seen ? { lastSeen: new Date(seen.at).toISOString(), running: Date.now() - seen.at < 90_000, version: seen.version ?? null } : { lastSeen: null, running: false, version: null },
            }}
          />
        </TabsContent>
        <TabsContent value="answers" className="mt-4 max-w-3xl">
          <AnswersForm initial={profile} />
        </TabsContent>
        <TabsContent value="extension" className="mt-4 max-w-3xl">
          <ExtensionSetup />
        </TabsContent>
      </Tabs>
    </>
  );
}
