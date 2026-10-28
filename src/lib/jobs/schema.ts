import { z } from "zod";
import { JOB_STATUS_VALUES } from "@/lib/constants";

// Shared by the job form (client) and the save actions (server).
export const jobFormSchema = z.object({
  title: z.string().trim().min(1, "Job title is required").max(300),
  company: z.string().trim().min(1, "Company is required").max(200),
  location: z.string().trim().max(300),
  workplace: z.string(),
  jobType: z.string(),
  status: z.enum(JOB_STATUS_VALUES),
  source: z.string().trim().max(100),
  url: z.string().trim().max(2000),
  salary: z.string().trim().max(200),
  description: z.string().max(100_000),
  skills: z.string().max(2000), // comma separated
  dateApplied: z.string(), // yyyy-MM-dd or ""
  dueDate: z.string(), // yyyy-MM-dd or ""
  resumeId: z.string(),
  postedAt: z.string(), // ISO or ""
});

export type JobFormValues = z.infer<typeof jobFormSchema>;

export const emptyJobForm: JobFormValues = {
  title: "",
  company: "",
  location: "",
  workplace: "",
  jobType: "",
  status: "new",
  source: "",
  url: "",
  salary: "",
  description: "",
  skills: "",
  dateApplied: "",
  dueDate: "",
  resumeId: "",
  postedAt: "",
};

export function parseSkills(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ).slice(0, 50);
}
