import "server-only";
import { eq } from "drizzle-orm";
import { RESUME_SECTIONS } from "@/lib/constants";
import { db } from "@/lib/db";
import { coverLetters, discoveredJobs } from "@/lib/db/schema";
import { getJob } from "@/lib/jobs/queries";
import { getResume, type ResumeWithSections } from "@/lib/resumes/queries";
import { dateRange } from "@/lib/utils";
import { getAgent, type AgentId } from "./agents";
import { getAboutMe, getAgentPrompt } from "./settings";

export interface ChatContext {
  resumeId?: string;
  jobId?: string;
  foundId?: string;
  coverLetterId?: string;
  /** The letter as it is in the editor right now (may be newer than the saved one). */
  letterDraft?: string;
  latex?: string;
  compileLog?: string;
  jobDescription?: string;
  industry?: string;
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}\n[…cut for length]` : text);

/** A resume as plain text the model can read. */
export function resumeToText(r: ResumeWithSections): string {
  const lines: string[] = [];
  if (r.fullName) lines.push(`Name: ${r.fullName}`);
  if (r.headline) lines.push(`Headline: ${r.headline}`);
  const contact = [r.email, r.phone, r.location, r.website, r.linkedin, r.github].filter(Boolean);
  if (contact.length) lines.push(`Contact: ${contact.join(" · ")}`);
  if (r.summary) lines.push("", "SUMMARY", r.summary);

  const order = ["education", "experience", "project", "volunteer", "award", "certification"];
  for (const key of order) {
    const entries = r.entries.filter((e) => e.section === key);
    if (!entries.length) continue;
    const label = RESUME_SECTIONS.find((s) => s.value === key)?.label ?? key;
    lines.push("", label.toUpperCase());
    for (const e of entries) {
      const head = [e.title, e.organization].filter(Boolean).join(", ");
      const meta = [e.location, dateRange(e.startDate, e.endDate, e.current)].filter(Boolean).join(" | ");
      lines.push(`- ${head}${meta ? ` (${meta})` : ""}${e.url ? ` ${e.url}` : ""}`);
      for (const d of (e.description ?? "").split("\n").map((l) => l.trim()).filter(Boolean)) {
        lines.push(`    ${d.replace(/^[-•*]\s*/, "• ")}`);
      }
    }
  }
  if (r.skillGroups.length) {
    lines.push("", "SKILLS");
    for (const g of r.skillGroups) lines.push(`- ${g.name}: ${g.skills.join(", ")}`);
  }
  if (!r.entries.length && r.sourceText) lines.push("", "RESUME TEXT (as imported)", clip(r.sourceText, 15000));
  return lines.join("\n").trim();
}

interface JobInfo {
  title: string;
  company: string;
  location?: string | null;
  salary?: string | null;
  url?: string | null;
  description?: string | null;
}

function jobToText(j: JobInfo): string {
  const lines = [`Role: ${j.title}`, `Company: ${j.company}`];
  if (j.location) lines.push(`Location: ${j.location}`);
  if (j.salary) lines.push(`Pay: ${j.salary}`);
  if (j.url) lines.push(`Posting: ${j.url}`);
  lines.push("", "Job description:", j.description ? clip(j.description, 15000) : "(no description saved)");
  return lines.join("\n");
}

export async function loadJob(ctx: Pick<ChatContext, "jobId" | "foundId">): Promise<JobInfo | null> {
  if (ctx.jobId) {
    const job = await getJob(ctx.jobId);
    if (job) return { ...job, company: job.company.name };
  }
  if (ctx.foundId) {
    const row = await db.query.discoveredJobs.findFirst({ where: eq(discoveredJobs.id, ctx.foundId) });
    if (row) return row;
  }
  return null;
}

/** Builds the system prompt: the agent's instructions plus everything it should read. */
export async function buildSystemPrompt(agentId: AgentId, ctx: ChatContext): Promise<string> {
  const agent = getAgent(agentId);
  if (!agent) throw new Error("Unknown agent");
  const [{ prompt }, aboutMe] = await Promise.all([getAgentPrompt(agentId), getAboutMe()]);

  const letter = ctx.coverLetterId
    ? await db.query.coverLetters.findFirst({ where: eq(coverLetters.id, ctx.coverLetterId) })
    : undefined;
  const resumeId = ctx.resumeId ?? letter?.resumeId ?? undefined;
  const resume = resumeId ? await getResume(resumeId) : null;
  const job = await loadJob({ jobId: ctx.jobId ?? letter?.jobId ?? undefined, foundId: ctx.foundId });
  const pastedJd = ctx.jobDescription?.trim() || letter?.jobDescription?.trim();

  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const parts = [prompt, `Today is ${today}.`];
  if (aboutMe) parts.push(`## About the user, in their own words\n${clip(aboutMe, 6000)}`);
  if (resume) parts.push(`## The user's resume ("${resume.title}")\n${resumeToText(resume)}`);
  else parts.push("## The user's resume\n(No resume selected. Ask the user for the details you need.)");

  if (job) parts.push(`## Target job\n${jobToText(job)}`);
  else if (pastedJd || letter?.company || letter?.role) {
    parts.push(
      `## Target job\n${jobToText({
        title: letter?.role || "(not given)",
        company: letter?.company || "(not given)",
        description: pastedJd,
      })}`,
    );
  }

  const industry = ctx.industry?.trim() || resume?.industry?.trim();
  if (industry) parts.push(`## Target industry\n${industry}`);
  if (letter?.instructions?.trim()) parts.push(`## What the user wants this letter to emphasize\n${letter.instructions.trim()}`);
  if (ctx.latex?.trim()) parts.push(`## Current LaTeX source\n\`\`\`latex\n${clip(ctx.latex, 60000)}\n\`\`\``);
  if (ctx.compileLog?.trim()) parts.push(`## Last compile log\n\`\`\`\n${clip(ctx.compileLog, 8000)}\n\`\`\``);
  const draft = ctx.letterDraft ?? letter?.content;
  if (draft?.trim()) parts.push(`## Current cover letter draft\n${clip(draft.trim(), 20000)}`);
  return parts.join("\n\n");
}
