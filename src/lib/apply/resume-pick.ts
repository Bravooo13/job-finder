// Which of your resume versions fits a job: the one made for its field
// (an "industry version" in Profile & resumes). Pure, shared by the server and the tests.

export interface ResumeVersion {
  id: string;
  title: string;
  industry: string | null;
  updatedAt?: Date | number | null;
}

export interface JobForResume {
  title: string;
  /** Job Finder's classification ids (src/lib/classify): roleType like "data-science", industry like "quant". */
  roleType?: string | null;
  industry?: string | null;
  description?: string | null;
}

// The industry choices offered when you make a version, and the job role types each one is for.
const PRESETS: { match: RegExp; roles: string[]; industries?: string[] }[] = [
  { match: /data science|analytics/, roles: ["data-science", "analytics"] },
  { match: /quant|trading/, roles: ["quant"], industries: ["quant"] },
  { match: /financ|investment bank|banking/, roles: ["finance"], industries: ["finance"] },
  { match: /economic consulting/, roles: ["economics", "consulting"] },
  { match: /management consulting|consult/, roles: ["consulting"], industries: ["consulting"] },
  { match: /economics research|econom/, roles: ["economics"] },
  { match: /software|data engineer|engineering/, roles: ["software"] },
  { match: /product|business analy/, roles: ["product", "analytics"] },
  { match: /risk|compliance|audit/, roles: ["risk"] },
  { match: /accounting/, roles: ["accounting"] },
  { match: /operations|supply chain/, roles: ["operations"] },
  { match: /marketing|sales/, roles: ["marketing"] },
];

const STOP = new Set("and & of the a an for in to with intern internship summer fall spring winter analyst associate role job version resume 2026 2027 2028".split(" "));
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9+ ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));

/** How well a version fits a job (0 = not at all). */
export function versionScore(v: ResumeVersion, job: JobForResume): number {
  const label = `${v.industry ?? ""} ${v.title}`.toLowerCase();
  let score = 0;
  const preset = PRESETS.find((p) => p.match.test((v.industry ?? "").toLowerCase()));
  if (preset && job.roleType && preset.roles.includes(job.roleType)) score += preset.roles[0] === job.roleType ? 4 : 3;
  if (preset?.industries && job.industry && preset.industries.includes(job.industry)) score += 1;
  // "Economic consulting" fits consulting jobs that talk about economics.
  if (/economic consulting/.test(label) && job.industry === "consulting" && /econom/i.test(`${job.title} ${job.description ?? ""}`)) score += 2;
  // Words in common with the job title ("Data engineering" version ↔ "Data Engineering Intern").
  const title = new Set(words(job.title));
  const shared = words(label).filter((w) => title.has(w));
  score += Math.min(3, new Set(shared).size);
  return score;
}

/** The best version for the job, or null when none clearly fits (then your main resume is used). */
export function pickResumeVersion(versions: ResumeVersion[], job: JobForResume): { version: ResumeVersion; score: number } | null {
  let best: { version: ResumeVersion; score: number } | null = null;
  for (const v of versions) {
    const score = versionScore(v, job);
    const newer = best && score === best.score && new Date(v.updatedAt ?? 0).getTime() > new Date(best.version.updatedAt ?? 0).getTime();
    if (!best || score > best.score || newer) best = { version: v, score };
  }
  return best && best.score >= 2 ? best : null;
}
