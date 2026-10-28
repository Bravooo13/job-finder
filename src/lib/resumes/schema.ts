import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max);

export const resumeBasicsSchema = z.object({
  title: z.string().trim().min(1, "Give this resume a name").max(150),
  fullName: optionalText(150),
  headline: optionalText(200),
  email: optionalText(200),
  phone: optionalText(50),
  location: optionalText(150),
  website: optionalText(300),
  linkedin: optionalText(300),
  github: optionalText(300),
  summary: optionalText(5000),
});

export type ResumeBasicsValues = z.infer<typeof resumeBasicsSchema>;

const monthOrEmpty = z
  .string()
  .regex(/^(\d{4}-\d{2})?$/, "Use a month like 2024-05");

export const resumeEntrySchema = z.object({
  section: z.enum(["experience", "education", "project", "certification", "volunteer", "award"]),
  title: z.string().trim().min(1, "This field is required").max(200),
  organization: optionalText(200),
  location: optionalText(150),
  startDate: monthOrEmpty,
  endDate: monthOrEmpty,
  current: z.boolean(),
  url: optionalText(500),
  description: optionalText(10_000),
});

export type ResumeEntryValues = z.infer<typeof resumeEntrySchema>;

export const skillGroupSchema = z.object({
  name: z.string().trim().min(1, "Name this group, e.g. Languages").max(80),
  skills: z.string().trim().min(1, "Add at least one skill").max(2000),
});

export type SkillGroupValues = z.infer<typeof skillGroupSchema>;

export const newResumeSchema = z.object({
  title: z.string().trim().min(1, "Give this resume a name").max(150),
  copyFromId: z.string(),
  targetJobId: z.string(),
});

export type NewResumeValues = z.infer<typeof newResumeSchema>;
