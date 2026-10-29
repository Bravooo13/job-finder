import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { NewCoverLetterForm } from "@/components/cover-letters/NewCoverLetterForm";
import { PageHeader } from "@/components/layout/PageHeader";
import { getAiStatus } from "@/lib/ai/settings";
import { db } from "@/lib/db";
import { discoveredJobs } from "@/lib/db/schema";
import { listJobs, listResumeOptions } from "@/lib/jobs/queries";

export const metadata = { title: "New cover letter" };
export const dynamic = "force-dynamic";

export default async function NewCoverLetterPage({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string; foundId?: string }>;
}) {
  const { jobId, foundId } = await searchParams;
  const [jobs, resumes, ai, found] = await Promise.all([
    listJobs(),
    listResumeOptions(),
    getAiStatus(),
    foundId
      ? db
          .select({ id: discoveredJobs.id, title: discoveredJobs.title, company: discoveredJobs.company })
          .from(discoveredJobs)
          .where(eq(discoveredJobs.id, foundId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : null,
  ]);

  return (
    <div className="flex flex-col gap-2">
      <Link
        href="/cover-letters"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Cover letters
      </Link>
      <PageHeader title="New cover letter" description="Pick the job and the resume to draw from. The writer does the rest." />
      <NewCoverLetterForm
        jobs={jobs.map((j) => ({ id: j.id, title: j.title, company: j.company, resumeId: j.resumeId }))}
        resumes={resumes}
        found={found}
        initialJobId={jobId && jobs.some((j) => j.id === jobId) ? jobId : ""}
        aiReady={ai.ready}
      />
    </div>
  );
}
