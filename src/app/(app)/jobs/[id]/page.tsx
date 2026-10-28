import { ArrowLeft, ExternalLink, FileText, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteJobButton } from "@/components/jobs/JobDetailActions";
import { JobFormDialog } from "@/components/jobs/JobFormDialog";
import { JobStatusMenu } from "@/components/jobs/JobStatus";
import { NotesSection } from "@/components/jobs/NotesSection";
import { NewResumeDialog } from "@/components/profile/NewResumeDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { jobTypeLabel, workplaceLabel } from "@/lib/constants";
import { getJob, listCompanyNames, listResumeOptions } from "@/lib/jobs/queries";
import type { JobFormValues } from "@/lib/jobs/schema";
import { formatDate, toDateInput } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const job = await getJob((await params).id);
  return { title: job ? `${job.title} · ${job.company.name}` : "Job not found" };
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium">{children || "—"}</dd>
    </div>
  );
}

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [job, companyNames, resumes] = await Promise.all([
    getJob(id),
    listCompanyNames(),
    listResumeOptions(),
  ]);
  if (!job) notFound();

  const formValues: JobFormValues = {
    title: job.title,
    company: job.company.name,
    location: job.location ?? "",
    workplace: job.workplace ?? "",
    jobType: job.jobType ?? "",
    status: job.status as JobFormValues["status"],
    source: job.source ?? "",
    url: job.url ?? "",
    salary: job.salary ?? "",
    description: job.description ?? "",
    skills: (job.skills ?? []).join(", "),
    dateApplied: toDateInput(job.dateApplied),
    dueDate: toDateInput(job.dueDate),
    resumeId: job.resumeId ?? "",
    postedAt: job.postedAt?.toISOString() ?? "",
  };

  const subtitle = [job.company.name, job.location, workplaceLabel(job.workplace)]
    .filter(Boolean)
    .join(" · ");
  const master = resumes.find((r) => r.isMaster);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/jobs"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Jobs
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
          <p className="mt-1 text-muted-foreground">{subtitle}</p>
          <div className="mt-3">
            <JobStatusMenu jobId={job.id} status={job.status} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {job.url ? (
            <Button variant="outline" asChild>
              <a href={job.url} target="_blank" rel="noreferrer">
                <ExternalLink /> Open posting
              </a>
            </Button>
          ) : null}
          <NewResumeDialog
            resumes={resumes}
            jobs={[{ id: job.id, title: job.title, company: job.company.name }]}
            defaults={{
              title: `${job.company.name} – ${job.title}`.slice(0, 150),
              copyFromId: master?.id ?? "",
              targetJobId: job.id,
            }}
            trigger={
              <Button variant="outline">
                <FileText /> Tailor a resume
              </Button>
            }
          />
          <JobFormDialog
            companyNames={companyNames}
            resumes={resumes}
            job={{ id: job.id, values: formValues }}
            trigger={
              <Button variant="outline">
                <Pencil /> Edit
              </Button>
            }
          />
          <DeleteJobButton jobId={job.id} title={job.title} />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
            <Fact label="Job type">{jobTypeLabel(job.jobType)}</Fact>
            <Fact label="Salary">{job.salary}</Fact>
            <Fact label="Source">{job.source}</Fact>
            <Fact label="Applied">{formatDate(job.dateApplied)}</Fact>
            <Fact label="Apply by">{formatDate(job.dueDate)}</Fact>
            <Fact label="Resume used">
              {job.resume ? (
                <Link href={`/profile/resumes/${job.resume.id}`} className="text-primary hover:underline">
                  {job.resume.title}
                </Link>
              ) : null}
            </Fact>
            <Fact label="Posted">{formatDate(job.postedAt)}</Fact>
            <Fact label="Added">{formatDate(job.createdAt)}</Fact>
            <Fact label="Last updated">{formatDate(job.updatedAt)}</Fact>
          </dl>
          {job.skills?.length ? (
            <div className="mt-5 flex flex-wrap gap-1.5 border-t pt-4">
              {job.skills.map((skill) => (
                <Badge key={skill} variant="secondary">
                  {skill}
                </Badge>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Tabs defaultValue="description">
        <TabsList>
          <TabsTrigger value="description">Description</TabsTrigger>
          <TabsTrigger value="notes">
            Notes{job.notes.length ? ` (${job.notes.length})` : ""}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="description" className="mt-4">
          {job.description ? (
            <div className="max-w-3xl rounded-lg border p-5 text-sm leading-relaxed whitespace-pre-wrap">
              {job.description}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No description saved. Use Edit to paste it; it&apos;s what resume matching will read.
            </p>
          )}
        </TabsContent>
        <TabsContent value="notes" className="mt-4 max-w-3xl">
          <NotesSection jobId={job.id} notes={job.notes} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
