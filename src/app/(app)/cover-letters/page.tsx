import { FileSignature, Plus } from "lucide-react";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listCoverLetters, wordCount } from "@/lib/cover-letters/queries";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Cover letters" };
export const dynamic = "force-dynamic";

export default async function CoverLettersPage() {
  const letters = await listCoverLetters();
  const newButton = (
    <Button asChild>
      <Link href="/cover-letters/new">
        <Plus /> New cover letter
      </Link>
    </Button>
  );
  return (
    <>
      <PageHeader
        title="Cover letters"
        description="Written from each job's description and your resume, in your voice. Every letter is saved here."
        actions={letters.length ? newButton : undefined}
      />
      {letters.length === 0 ? (
        <EmptyState
          icon={<FileSignature className="size-8" />}
          title="No cover letters yet"
          description="Pick one of your jobs (or paste a job description) and the cover letter writer drafts one from your resume. You can edit it, ask for changes and come back to it any time."
          action={newButton}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {letters.map((l) => {
            const preview = l.content.replace(/^Dear[^\n]*\n+/i, "").trim();
            return (
              <Card key={l.id} className="relative transition-shadow hover:shadow-md">
                <CardContent className="flex h-full flex-col gap-2 pt-5">
                  <Link
                    href={`/cover-letters/${l.id}`}
                    className="line-clamp-2 font-semibold after:absolute after:inset-0 hover:underline"
                  >
                    {l.title}
                  </Link>
                  <div className="flex flex-wrap gap-1.5">
                    {l.jobTitle ? (
                      <Badge variant="secondary" className="max-w-full truncate font-normal">
                        Linked to My jobs
                      </Badge>
                    ) : null}
                    {l.resumeTitle ? (
                      <Badge variant="outline" className="max-w-full truncate font-normal">
                        {l.resumeTitle}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="line-clamp-4 font-serif text-sm leading-relaxed text-muted-foreground">
                    {preview || "Not written yet."}
                  </p>
                  <div className="mt-auto flex justify-between pt-2 text-xs text-muted-foreground">
                    <span>{wordCount(l.content)} words</span>
                    <span>Updated {timeAgo(l.updatedAt)}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
