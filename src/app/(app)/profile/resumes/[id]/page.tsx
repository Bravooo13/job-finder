import { ArrowLeft, Copy, Crown, Printer, Target } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BasicsForm } from "@/components/profile/BasicsForm";
import { NewResumeDialog } from "@/components/profile/NewResumeDialog";
import { ResumeActions } from "@/components/profile/ResumeActions";
import { SectionCard } from "@/components/profile/SectionCard";
import { SkillsCard } from "@/components/profile/SkillsCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RESUME_SECTIONS } from "@/lib/constants";
import { getResume, listJobOptions, listResumes } from "@/lib/resumes/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const resume = await getResume((await params).id);
  return { title: resume?.title ?? "Resume not found" };
}

export default async function ResumePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [resume, allResumes, jobs] = await Promise.all([getResume(id), listResumes(), listJobOptions()]);
  if (!resume) notFound();
  const options = allResumes.map((r) => ({ id: r.id, title: r.title, isMaster: r.isMaster }));

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/profile"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Profile & resumes
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{resume.title}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {resume.isMaster ? (
              <Badge className="gap-1">
                <Crown className="size-3" /> Master profile
              </Badge>
            ) : null}
            {resume.targetJob ? (
              <Link href={`/jobs/${resume.targetJob.id}`}>
                <Badge variant="secondary" className="gap-1 hover:bg-secondary/70">
                  <Target className="size-3" /> Tailored for {resume.targetJob.title} · {resume.targetJob.company}
                </Badge>
              </Link>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <a href={`/resume/${resume.id}/print`} target="_blank" rel="noreferrer">
              <Printer /> Preview & PDF
            </a>
          </Button>
          <NewResumeDialog
            resumes={options}
            jobs={jobs}
            defaults={{ copyFromId: resume.id, title: `${resume.title} (copy)`.slice(0, 150) }}
            trigger={
              <Button variant="outline">
                <Copy /> Make a copy
              </Button>
            }
          />
          <ResumeActions resumeId={resume.id} title={resume.title} isMaster={resume.isMaster} redirectAfterDelete />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <BasicsForm key={resume.id} resume={resume} />
          <SkillsCard resumeId={resume.id} groups={resume.skillGroups} />
        </div>
        <div className="flex flex-col gap-6">
          {RESUME_SECTIONS.map((s) => (
            <SectionCard
              key={s.value}
              resumeId={resume.id}
              section={s.value}
              entries={resume.entries.filter((e) => e.section === s.value)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
