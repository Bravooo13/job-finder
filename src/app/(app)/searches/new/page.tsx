import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { SearchForm } from "@/components/searches/SearchForm";
import { listResumeOptions } from "@/lib/jobs/queries";
import { newSearchDefaults } from "@/lib/search/defaults";
import { getDirectoryCounts, listCompanyBoards } from "@/lib/search/queries";

export const metadata = { title: "New search" };
export const dynamic = "force-dynamic";

export default async function NewSearchPage() {
  const [resumes, mine] = await Promise.all([listResumeOptions(), listCompanyBoards()]);
  const master = resumes.find((r) => r.isMaster) ?? resumes[0];
  const directory = Object.values(getDirectoryCounts()).reduce((a, b) => a + b, 0);
  return (
    <>
      <Link href="/searches" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Searches
      </Link>
      <PageHeader title="New search" description="Describe the jobs you want. You can change any of this later." />
      <SearchForm
        initial={newSearchDefaults(master?.id ?? "")}
        resumes={resumes}
        myCompanyCount={mine.length}
        directoryCount={directory}
      />
    </>
  );
}
