import { Chrome, ListChecks, MessageSquareText } from "lucide-react";
import { ApplyQueue } from "@/components/apply/ApplyQueue";
import { AnswersForm } from "@/components/apply/AnswersForm";
import { ExtensionSetup } from "@/components/apply/ExtensionSetup";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getApplyProfile } from "@/lib/apply/profile";
import { applyQueue } from "@/lib/apply/queue";

export const metadata = { title: "Apply" };
export const dynamic = "force-dynamic";

export default async function ApplyPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const [items, profile] = await Promise.all([applyQueue(), getApplyProfile()]);
  return (
    <>
      <PageHeader
        title="Apply"
        description="Jobs you saved and haven't applied to, your standard answers for application forms, and the browser helper that fills them in."
      />
      <Tabs defaultValue={tab === "answers" || tab === "extension" ? tab : "queue"}>
        <TabsList className="no-scrollbar max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="queue" className="gap-1.5">
            <ListChecks className="size-4" /> To apply ({items.length})
          </TabsTrigger>
          <TabsTrigger value="answers" className="gap-1.5">
            <MessageSquareText className="size-4" /> My answers
          </TabsTrigger>
          <TabsTrigger value="extension" className="gap-1.5">
            <Chrome className="size-4" /> Browser helper
          </TabsTrigger>
        </TabsList>
        <TabsContent value="queue" className="mt-4">
          <ApplyQueue items={items} />
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
