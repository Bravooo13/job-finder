import { AssistantHub } from "@/components/ai/AssistantHub";
import { PageHeader } from "@/components/layout/PageHeader";
import { getAgent, type AgentId } from "@/lib/ai/agents";
import { getAiStatus } from "@/lib/ai/settings";
import { listResumeOptions } from "@/lib/jobs/queries";
import { listJobOptions } from "@/lib/resumes/queries";

export const metadata = { title: "AI agents" };
export const dynamic = "force-dynamic";

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string; jobId?: string }>;
}) {
  const query = await searchParams;
  const [resumes, jobs, ai] = await Promise.all([listResumeOptions(), listJobOptions(), getAiStatus()]);
  const agent = (getAgent(query.agent ?? "")?.id ?? "job-fit") as AgentId;
  return (
    <>
      <PageHeader
        title="AI agents"
        description="Each agent handles one kind of task and reads your resume, the job and your notes from Settings."
      />
      <AssistantHub
        resumes={resumes}
        jobs={jobs}
        aiReady={ai.ready}
        aiLabel={ai.label}
        initialAgent={agent}
        initialJobId={query.jobId && jobs.some((j) => j.id === query.jobId) ? query.jobId : ""}
      />
    </>
  );
}
