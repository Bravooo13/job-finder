import "server-only";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { discoveredJobs, jobs, resumes } from "@/lib/db/schema";
import { getAutoSettings, getResumeFile } from "./auto";
import { pickResumeVersion } from "./resume-pick";

// Which resume goes with an application, in this order:
// 1. the one you tailored for this job, 2. your version for the job's field
// (Profile & resumes → industry versions), 3. the PDF you uploaded for applications,
// 4. your master resume. The Auto apply "Resume to attach" setting can skip 2 or 3.

export type ResumeChoice =
  | { kind: "tailored" | "version" | "master"; resumeId: string; title: string; why: string }
  | { kind: "file"; name: string; why: string };

export async function resumeChoice(ids: { jobId?: string | null; foundId?: string | null }): Promise<ResumeChoice | null> {
  const settings = await getAutoSettings();
  let job: { title: string; roleType: string | null; industry: string | null; description: string | null; resumeId: string | null } | null = null;
  if (ids.jobId) {
    const [j] = await db
      .select({ title: jobs.title, roleType: jobs.roleType, industry: jobs.industry, description: jobs.description, resumeId: jobs.resumeId })
      .from(jobs)
      .where(eq(jobs.id, ids.jobId))
      .limit(1);
    job = j ?? null;
  }
  if (!job && ids.foundId) {
    const [f] = await db
      .select({ title: discoveredJobs.title, roleType: discoveredJobs.roleType, industry: discoveredJobs.industry, description: discoveredJobs.description })
      .from(discoveredJobs)
      .where(eq(discoveredJobs.id, ids.foundId))
      .limit(1);
    job = f ? { ...f, resumeId: null } : null;
  }

  const withLatex = (id: string) =>
    db
      .select({ id: resumes.id, title: resumes.title })
      .from(resumes)
      .where(and(eq(resumes.id, id), isNotNull(resumes.latex)))
      .limit(1)
      .then((r) => r[0] ?? null);

  // 1. Tailored for this job.
  if (job?.resumeId) {
    const r = await withLatex(job.resumeId);
    if (r) return { kind: "tailored", resumeId: r.id, title: r.title, why: "tailored for this job" };
  }
  if (ids.jobId) {
    const [r] = await db
      .select({ id: resumes.id, title: resumes.title })
      .from(resumes)
      .where(and(eq(resumes.targetJobId, ids.jobId), isNotNull(resumes.latex)))
      .orderBy(desc(resumes.updatedAt))
      .limit(1);
    if (r) return { kind: "tailored", resumeId: r.id, title: r.title, why: "tailored for this job" };
  }

  // 2. Your version for the job's field.
  if (job && settings.resume !== "file") {
    const versions = (
      await db
        .select({ id: resumes.id, title: resumes.title, industry: resumes.industry, updatedAt: resumes.updatedAt, latex: resumes.latex })
        .from(resumes)
        .where(and(eq(resumes.isMaster, false), isNotNull(resumes.industry)))
    ).filter((v) => v.latex?.trim());
    const pick = pickResumeVersion(versions, job);
    if (pick) return { kind: "version", resumeId: pick.version.id, title: pick.version.title, why: `your ${pick.version.industry} version` };
  }

  // 3. The PDF you uploaded.
  if (settings.resume !== "generated") {
    const file = await getResumeFile();
    if (file) return { kind: "file", name: file.name, why: "the PDF you uploaded" };
  }

  // 4. Your master resume.
  const [master] = await db.select({ id: resumes.id, title: resumes.title }).from(resumes).orderBy(desc(resumes.isMaster), desc(resumes.updatedAt)).limit(1);
  return master ? { kind: "master", resumeId: master.id, title: master.title, why: "your master resume" } : null;
}
