import { CalendarClock, FileText, Link2, Plus } from "lucide-react";
import Link from "next/link";
import { ApplicationCalendar, StatusDonut, WeeklyChart } from "@/components/dashboard/charts";
import { JobFormDialog } from "@/components/jobs/JobFormDialog";
import { JobStatusBadge } from "@/components/jobs/JobStatus";
import { PageHeader } from "@/components/layout/PageHeader";
import { NewResumeDialog } from "@/components/profile/NewResumeDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardData } from "@/lib/dashboard/queries";
import { listCompanyNames, listResumeOptions } from "@/lib/jobs/queries";
import { listJobOptions } from "@/lib/resumes/queries";
import { formatDate, timeAgo } from "@/lib/utils";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const [data, companyNames, resumes, jobOptions] = await Promise.all([
    getDashboardData(),
    listCompanyNames(),
    listResumeOptions(),
    listJobOptions(),
  ]);
  const { totals } = data;
  const isEmpty = totals.tracked === 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={formatDate(new Date(), "EEEE, MMMM d")}
        actions={
          <>
            <JobFormDialog
              companyNames={companyNames}
              resumes={resumes}
              startWithImport
              trigger={
                <Button variant="outline">
                  <Link2 /> Import job link
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
        }
      />

      {isEmpty ? (
        <Card className="mb-6 border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">Welcome to Job Finder</p>
              <p className="text-sm text-muted-foreground">
                Start by setting up your master profile, then add the jobs you&apos;re looking at.
              </p>
            </div>
            {totals.resumes === 0 ? (
              <NewResumeDialog
                resumes={[]}
                jobs={jobOptions}
                trigger={
                  <Button>
                    <FileText /> Create master profile
                  </Button>
                }
              />
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Applied this week" value={totals.applied7} hint={`${totals.applied30} in the last 30 days`} />
        <Stat label="Total applied" value={totals.applied} hint={`${totals.tracked} jobs tracked`} />
        <Stat label="Interviewing" value={totals.interviews} hint={`${totals.offers} offer${totals.offers === 1 ? "" : "s"}`} />
        <Stat
          label="Response rate"
          value={totals.responseRate == null ? "—" : `${totals.responseRate}%`}
          hint="Applications that reached interview or beyond"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Weekly activity</CardTitle>
            <CardDescription className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-[#a5b4fc]" /> Saved
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-[#4f46e5]" /> Applied
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WeeklyChart data={data.weekly} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pipeline</CardTitle>
            <CardDescription>Jobs by status</CardDescription>
          </CardHeader>
          <CardContent>
            {data.statusCounts.length ? (
              <>
                <StatusDonut data={data.statusCounts} />
                <ul className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1.5 text-sm">
                  {data.statusCounts.map((s) => (
                    <li key={s.status} className="flex items-center gap-1.5">
                      <JobStatusBadge status={s.status} />
                      <span className="tabular-nums text-muted-foreground">{s.count}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">No jobs yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Applications over the last year</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <ApplicationCalendar data={data.calendar} from={data.calendarFrom} to={data.calendarTo} />
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">Recently added</CardTitle>
            <Button variant="link" size="sm" asChild className="px-0">
              <Link href="/jobs">All jobs</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {data.recent.length ? (
              <ul className="divide-y">
                {data.recent.map((job) => (
                  <li key={job.id}>
                    <Link href={`/jobs/${job.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:opacity-80">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{job.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {job.company} · added {timeAgo(job.createdAt)}
                        </p>
                      </div>
                      <JobStatusBadge status={job.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">Jobs you add show up here.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Apply-by dates coming up</CardTitle>
          </CardHeader>
          <CardContent>
            {data.upcoming.length ? (
              <ul className="divide-y">
                {data.upcoming.map((job) => (
                  <li key={job.id}>
                    <Link href={`/jobs/${job.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:opacity-80">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{job.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{job.company}</p>
                      </div>
                      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <CalendarClock className="size-3.5" />
                        {formatDate(job.dueDate, "MMM d")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Set an “Apply by” date on a saved job to see it here.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
