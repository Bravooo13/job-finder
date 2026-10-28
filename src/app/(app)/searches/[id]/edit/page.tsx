import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { SearchForm } from "@/components/searches/SearchForm";
import { listResumeOptions } from "@/lib/jobs/queries";
import { searchToForm } from "@/lib/search/defaults";
import { getDirectoryCounts, getSearch, listCompanyBoards } from "@/lib/search/queries";

export const metadata = { title: "Edit search" };
export const dynamic = "force-dynamic";

export default async function EditSearchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [search, resumes, mine] = await Promise.all([getSearch(id), listResumeOptions(), listCompanyBoards()]);
  if (!search) notFound();
  const directory = Object.values(getDirectoryCounts()).reduce((a, b) => a + b, 0);
  return (
    <>
      <Link href={`/searches/${id}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {search.name}
      </Link>
      <PageHeader title="Edit search" />
      <SearchForm
        searchId={id}
        initial={searchToForm(search)}
        resumes={resumes}
        myCompanyCount={mine.length}
        directoryCount={directory}
      />
    </>
  );
}
