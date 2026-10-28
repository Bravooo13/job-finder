import { Copy, Crown, FileText, Plus, Target } from "lucide-react";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/layout/PageHeader";
import { ImportResumeButton } from "@/components/profile/ImportResumeButton";
import { NewResumeDialog } from "@/components/profile/NewResumeDialog";
import { ResumeActions } from "@/components/profile/ResumeActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listJobOptions, listResumes } from "@/lib/resumes/queries";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Profile & resumes" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const [resumes, jobs] = await Promise.all([listResumes(), listJobOptions()]);
  const options = resumes.map((r) => ({ id: r.id, title: r.title, isMaster: r.isMaster }));

  const newButton = (
    <NewResumeDialog
      resumes={options}
      jobs={jobs}
      trigger={
        <Button>
          <Plus /> {resumes.length ? "New resume" : "Create master profile"}
        </Button>
      }
    />
  );

  return (
    <>
      <PageHeader
        title="Profile & resumes"
        description="Keep everything in your master profile, then make a trimmed, tailored copy for each job."
        actions={
          resumes.length ? (
            <>
              <ImportResumeButton />
              {newButton}
            </>
          ) : undefined
        }
      />
      {resumes.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-8" />}
          title="Start with your master profile"
          description="Import your resume (PDF or Word) and Job Finder fills in your experience, education, projects and skills. Or type it in yourself. Every tailored resume starts as a copy of it."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ImportResumeButton variant="default" />
              {newButton}
            </div>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {resumes.map((r) => (
            <Card key={r.id} className="relative transition-shadow hover:shadow-md">
              <CardContent className="flex h-full flex-col gap-3 pt-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/profile/resumes/${r.id}`}
                      className="block truncate font-semibold after:absolute after:inset-0 hover:underline"
                    >
                      {r.title}
                    </Link>
                    {r.headline ? (
                      <p className="truncate text-sm text-muted-foreground">{r.headline}</p>
                    ) : null}
                  </div>
                  <div className="relative z-10 -mt-1 -mr-2">
                    <ResumeActions resumeId={r.id} title={r.title} isMaster={r.isMaster} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {r.isMaster ? (
                    <Badge className="gap-1">
                      <Crown className="size-3" /> Master profile
                    </Badge>
                  ) : null}
                  {r.targetJobTitle ? (
                    <Badge variant="secondary" className="max-w-full gap-1">
                      <Target className="size-3 shrink-0" />
                      <span className="truncate">
                        {r.targetJobTitle} · {r.targetCompany}
                      </span>
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-auto flex items-center justify-between pt-2 text-xs text-muted-foreground">
                  <span>
                    {r.entryCount} entries · {r.skillCount} skill groups
                  </span>
                  <span>Updated {timeAgo(r.updatedAt)}</span>
                </div>
                <div className="relative z-10">
                  <NewResumeDialog
                    resumes={options}
                    jobs={jobs}
                    defaults={{ copyFromId: r.id, title: `${r.title} (copy)`.slice(0, 150) }}
                    trigger={
                      <Button variant="outline" size="sm" className="w-full">
                        <Copy /> Make a tailored copy
                      </Button>
                    }
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
