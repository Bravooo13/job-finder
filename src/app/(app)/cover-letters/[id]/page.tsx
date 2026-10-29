import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CoverLetterEditor } from "@/components/cover-letters/CoverLetterEditor";
import { getAiStatus } from "@/lib/ai/settings";
import { getCoverLetter } from "@/lib/cover-letters/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const letter = await getCoverLetter((await params).id);
  return { title: letter?.title ?? "Cover letter not found" };
}

export default async function CoverLetterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ write?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [letter, ai] = await Promise.all([getCoverLetter(id), getAiStatus()]);
  if (!letter) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/cover-letters"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Cover letters
      </Link>
      <CoverLetterEditor
        letter={{
          id: letter.id,
          title: letter.title,
          content: letter.content,
          notes: letter.notes,
          company: letter.company,
          role: letter.role,
          jobDescription: letter.jobDescription,
          instructions: letter.instructions,
          job: letter.job ? { id: letter.job.id, title: letter.job.title, company: letter.job.company, url: letter.job.url } : null,
          resume: letter.resume ? { id: letter.resume.id, title: letter.resume.title } : null,
        }}
        aiReady={ai.ready}
        aiLabel={ai.label}
        autoWrite={query.write === "1" && ai.ready}
      />
    </div>
  );
}
