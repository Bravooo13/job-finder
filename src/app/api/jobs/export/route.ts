import { format } from "date-fns";
import { jobTypeLabel, statusLabel, workplaceLabel } from "@/lib/constants";
import { listJobs } from "@/lib/jobs/queries";

export const dynamic = "force-dynamic";

function csvCell(value: unknown): string {
  if (value == null) return "";
  const text = value instanceof Date ? format(value, "yyyy-MM-dd") : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET() {
  const jobs = await listJobs();
  const header = [
    "Title",
    "Company",
    "Location",
    "Workplace",
    "Job type",
    "Status",
    "Source",
    "Salary",
    "Date applied",
    "Due date",
    "Added",
    "URL",
  ];
  const rows = jobs.map((j) =>
    [
      j.title,
      j.company,
      j.location,
      workplaceLabel(j.workplace),
      jobTypeLabel(j.jobType),
      statusLabel(j.status),
      j.source,
      j.salary,
      j.dateApplied,
      j.dueDate,
      j.createdAt,
      j.url,
    ]
      .map(csvCell)
      .join(","),
  );
  const body = [header.join(","), ...rows].join("\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="job-finder-${format(new Date(), "yyyy-MM-dd")}.csv"`,
    },
  });
}
