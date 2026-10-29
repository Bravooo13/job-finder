// Turns a resume from the Content tab into a clean, one-page LaTeX document.
// Compiles with Tectonic (XeTeX) and stays readable by applicant tracking systems.

import { dateRange } from "@/lib/utils";

interface Entry {
  section: string;
  title: string;
  organization: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  current: boolean;
  url: string | null;
  description: string | null;
}

export interface ResumeForLatex {
  fullName: string | null;
  title: string;
  headline: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  website: string | null;
  linkedin: string | null;
  github: string | null;
  summary: string | null;
  entries: Entry[];
  skillGroups: { name: string; skills: string[] }[];
}

/** Escapes text so LaTeX prints it as is. */
export function tex(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/\\/g, "\u0000")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/\u0000/g, "\\textbackslash{}")
    .replace(/\s+/g, " ")
    .trim();
}

function link(url: string | null | undefined): string {
  if (!url) return "";
  const href = /^https?:\/\//.test(url) ? url : `https://${url}`;
  const label = url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  return `\\href{${href.replace(/([%#\\])/g, "\\$1")}}{${tex(label)}}`;
}

function bullets(description: string | null): string {
  const lines = (description ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return "";
  // "{}" keeps a line that starts with "[" from being read as an \item label.
  const items = lines.map((l) => `  \\item ${tex(l.replace(/^[-•*]\s*/, "")).replace(/^\[/, "{}[")}`);
  return `\\begin{itemize}\n${items.join("\n")}\n\\end{itemize}\n`;
}

function entryBlock(e: Entry): string {
  const sameMonth = !e.current && e.startDate && e.startDate === e.endDate;
  const dates = tex(dateRange(e.startDate, sameMonth ? null : e.endDate, e.current).replace("–", "--"));
  let head: string;
  if (e.section === "project" || e.section === "award" || e.section === "certification") {
    head = `\\heading{\\textbf{${tex(e.title)}}}{${dates}}\n`;
    const right = e.location ? tex(e.location) : link(e.url);
    if (e.organization || right) head += `\\subheading{${tex(e.organization)}}{${right}}\n`;
  } else if (e.organization) {
    head = `\\heading{\\textbf{${tex(e.organization)}}}{${tex(e.location)}}\n\\subheading{${tex(e.title)}}{${dates}}\n`;
  } else {
    head = `\\heading{\\textbf{${tex(e.title)}}}{${dates}}\n`;
    if (e.location) head += `\\subheading{}{${tex(e.location)}}\n`;
  }
  return head + bullets(e.description);
}

const SECTIONS: { key: string; title: string }[] = [
  { key: "education", title: "Education" },
  { key: "experience", title: "Experience" },
  { key: "project", title: "Projects" },
  { key: "skills", title: "Skills" },
  { key: "volunteer", title: "Leadership \\& Activities" },
  { key: "award", title: "Awards" },
  { key: "certification", title: "Certifications" },
];

export const PREAMBLE = String.raw`% Resume made with Job Finder. Edit anything; compile with Tectonic (XeTeX).
\documentclass[11pt,letterpaper]{article}
\usepackage[margin=0.5in]{geometry}
\usepackage{enumitem}
\usepackage{titlesec}
\usepackage{xcolor}
\usepackage{needspace}
\usepackage[hidelinks]{hyperref}

\pagestyle{empty}
\setlength{\parindent}{0pt}
\setlength{\parskip}{0pt}
\definecolor{accent}{HTML}{1F3A5F}
\titleformat{\section}{\color{accent}\large\bfseries}{}{0pt}{}[\nobreak\vspace{1pt}\nobreak{\color{accent}\titlerule}\nobreak]
\titlespacing*{\section}{0pt}{8pt}{3pt}
\newcommand{\sectionbreak}{\Needspace{5\baselineskip}} % no section title alone at the bottom of a page
\setlist[itemize]{leftmargin=1.3em, itemsep=0.5pt, topsep=1.5pt, parsep=0pt, partopsep=0pt}

% \heading{left}{right} and \subheading{left}{right}: right side flush right,
% moved to the next line only when it doesn't fit.
\newcommand{\rightpart}[1]{{\unskip\nobreak\hfil\penalty50\hskip1em\hbox{}\nobreak\hfil\mbox{#1}%
  \parfillskip=0pt\finalhyphendemerits=0\par}}
\newcommand{\heading}[2]{\noindent#1\rightpart{#2}}
\newcommand{\subheading}[2]{\noindent\textit{#1}\rightpart{\textit{#2}}}
\newcommand{\entrygap}{\vspace{3pt}}
`;

export function resumeToLatex(r: ResumeForLatex): string {
  const name = tex(r.fullName || r.title);
  const contact = [
    tex(r.location),
    r.email ? `\\href{mailto:${r.email}}{${tex(r.email)}}` : "",
    tex(r.phone),
    link(r.linkedin),
    link(r.github),
    link(r.website),
  ].filter(Boolean);

  const out: string[] = [PREAMBLE, "\\begin{document}", "", "\\begin{center}", `  {\\LARGE\\bfseries ${name}}\\\\[3pt]`];
  if (r.headline) out.push(`  ${tex(r.headline)}\\\\[2pt]`);
  if (contact.length) out.push(`  \\small ${contact.join(" \\,$\\cdot$\\, ")}`);
  out.push("\\end{center}", "");

  if (r.summary?.trim()) out.push("\\section{Summary}", tex(r.summary), "");

  for (const s of SECTIONS) {
    if (s.key === "skills") {
      if (!r.skillGroups.length) continue;
      out.push("\\section{Skills}");
      for (const g of r.skillGroups) out.push(`\\textbf{${tex(g.name)}:} ${tex(g.skills.join(", "))}\\par`);
      out.push("");
      continue;
    }
    const entries = r.entries.filter((e) => e.section === s.key);
    if (!entries.length) continue;
    out.push(`\\section{${s.title}}`);
    out.push(entries.map(entryBlock).join("\\entrygap\n"));
  }

  out.push("\\end{document}", "");
  return out.join("\n");
}

/** A starting point when there's no resume content yet. */
export function blankLatex(name = "Your Name"): string {
  return `${PREAMBLE}\\begin{document}

\\begin{center}
  {\\LARGE\\bfseries ${tex(name)}}\\\\[3pt]
  \\small City, ST \\,$\\cdot$\\, you@example.com \\,$\\cdot$\\, (555) 555-5555
\\end{center}

\\section{Education}
\\heading{\\textbf{University Name}}{City, ST}
\\subheading{B.A. in Your Major}{Expected May 2027}

\\section{Experience}
\\heading{\\textbf{Company}}{City, ST}
\\subheading{Your Role}{Jun 2026 -- Aug 2026}
\\begin{itemize}
  \\item What you did, how you did it, and what changed because of it.
\\end{itemize}

\\section{Skills}
\\textbf{Technical:} Python, SQL\\par

\\end{document}
`;
}

/** A plain one-page cover letter, for application forms that want a file. */
export function letterToLatex(l: {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  content: string;
  date?: Date;
}): string {
  const date = (l.date ?? new Date()).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const contact = [tex(l.location), l.email ? tex(l.email) : "", tex(l.phone)].filter(Boolean).join(" \\,$\\cdot$\\, ");
  const paragraphs = l.content
    .split(/\n\s*\n/)
    .map((p) => p.split("\n").map((line) => tex(line)).join("\\\\\n"))
    .filter(Boolean);
  return String.raw`\documentclass[11pt,letterpaper]{article}
\usepackage[margin=1in]{geometry}
\usepackage[hidelinks]{hyperref}
\pagestyle{empty}
\setlength{\parindent}{0pt}
\setlength{\parskip}{10pt}
\begin{document}
` + (l.fullName ? `{\\large\\bfseries ${tex(l.fullName)}}\\\\\n${contact ? `\\small ${contact}\n` : ""}\n\\vspace{12pt}\n\n` : "") +
    `${date}\n\n${paragraphs.join("\n\n")}\n\n\\end{document}\n`;
}
