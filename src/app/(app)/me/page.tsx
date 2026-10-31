import Link from "next/link";
import { AnswersForm } from "@/components/apply/AnswersForm";
import { PageHeader } from "@/components/layout/PageHeader";
import { getApplyProfile } from "@/lib/apply/profile";

export const metadata = { title: "My info" };
export const dynamic = "force-dynamic";

export default async function MyInfoPage() {
  const profile = await getApplyProfile();
  return (
    <>
      <PageHeader
        title="My info"
        description="Everything application forms ask about you: contact and address, education, work, work authorization, where you want to work, and your own answers. Job Finder fills forms from this, however each form words the question."
      />
      <p className="mb-6 max-w-3xl text-sm text-muted-foreground">
        Blank fields are filled in from your master resume. When a form asks something new, answer it once under “Your own questions” (or
        from{" "}
        <Link href="/activity" className="font-medium text-primary hover:underline">
          Activity → Waiting for you
        </Link>
        ) and it&apos;s reused for every application that asks the same thing.
      </p>
      <div className="max-w-4xl">
        <AnswersForm initial={profile} />
      </div>
    </>
  );
}
