import { z } from "zod";

export const newCoverLetterSchema = z
  .object({
    jobId: z.string(),
    foundId: z.string(),
    company: z.string().trim().max(200),
    role: z.string().trim().max(200),
    jobDescription: z.string().trim().max(40000),
    resumeId: z.string(),
    instructions: z.string().trim().max(3000),
  })
  .refine((v) => v.jobId || v.foundId || v.jobDescription.length >= 50, {
    message: "Pick a job or paste the job description",
  });

export type NewCoverLetterValues = z.infer<typeof newCoverLetterSchema>;
