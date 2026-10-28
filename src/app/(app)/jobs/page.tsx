import { Link2, Plus } from "lucide-react";
import { JobFormDialog } from "@/components/jobs/JobFormDialog";
import { JobsTable } from "@/components/jobs/JobsTable";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { listCompanyNames, listJobs, listResumeOptions } from "@/lib/jobs/queries";

export const metadata = { title: "Jobs" };
export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const [jobs, companyNames, resumes] = await Promise.all([
    listJobs(),
    listCompanyNames(),
    listResumeOptions(),
  ]);

  const addButtons = (
    <>
      <JobFormDialog
        companyNames={companyNames}
        resumes={resumes}
        startWithImport
        trigger={
          <Button variant="outline">
            <Link2 /> Import from link
          </Button>
        }
      />
      <JobFormDialog
        companyNames={companyNames}
        resumes={resumes}
        trigger={
          <Button>
            <Plus /> Add job
          </Button>
        }
      />
    </>
  );

  return (
    <>
      <PageHeader
        title="Jobs"
        description="Every job you're tracking, from saved to offer."
        actions={jobs.length ? addButtons : undefined}
      />
      <JobsTable jobs={jobs} toolbar={<div className="flex gap-2">{addButtons}</div>} />
    </>
  );
}
