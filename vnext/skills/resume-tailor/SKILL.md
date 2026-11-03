---
name: resume-tailor
description: Make a tailored resume version (for a field such as fintech or healthcare, or for one job) from the owner's master resume, truthfully. Use when asked to tailor a resume or before applying in a new field.
---

# Resume tailor

Inputs: the master resume (`private/resume.tex` or `private/resume.md`; the PDF at
`private/files/resume.pdf`), the job description (`python -m jobfinder jobs` shows ids; the
description is in the database, or open the posting), and `private/profile.yaml`.

## Rules
- Never invent: no new employers, titles, dates, degrees, numbers or tools the owner didn't use.
  You may reorder, cut, merge, and reword bullets so the job's words appear where they are true.
- Keep one page for intern/new-grad roles. Keep the master's section order unless the field wants
  projects first.
- Lead each bullet with what he did and the result; keep real numbers; drop filler ("responsible for").
- Mirror 5-10 of the posting's key terms (tools, methods, domain) only where they are true.
- Field versions (`resume-fintech.pdf`) are reused for every job in that field; one-job versions
  only for top choices.

## Output
1. The tailored source next to the master (`private/resume-{field}.tex` or `.md`).
2. A PDF in `private/files/` (`resume-{field}.pdf`; LaTeX: `tectonic resume-{field}.tex`, or any
   LaTeX/Markdown→PDF tool you have). To use it for applications, copy it to
   `private/files/resume.pdf` or tell the owner which file to use.
3. A 3-line note to the owner: what you emphasized, what you cut, anything he should check.
