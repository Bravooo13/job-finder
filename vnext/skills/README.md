# Job Finder skills

Plain folders of instructions an AI agent follows to run the job search with the `jobfinder`
toolkit in this folder. They hold no personal data: the owner's facts live in `../private/`.

| Skill | Use it to |
| --- | --- |
| `job-search/` | find jobs: company boards, public ATS feeds, Simplify lists, LinkedIn guest search, careers pages |
| `job-triage/` | score and sort found jobs, read visa signals, save or dismiss |
| `resume-tailor/` | make a resume version for a field or one job, from the master resume |
| `cover-letter-writer/` | write a cover letter in the owner's voice |
| `application-answers/` | answer form questions from the profile; the work-authorization wordings |
| `auto-apply/` | queue, check first, answer once, send, follow up; the statuses and the Submit lock |
| `ats-platforms/` | how each applicant-tracking system works (75 in the registry; 14 in detail) |
| `browser-automation/` | Playwright and Selenium: profile, pacing, dropdowns, uploads, what stays the owner's |

## Loading them into a Claude account

- **Claude Code** (any computer): copy the folders into `~/.claude/skills/` (every project) or
  `.claude/skills/` inside this folder (this project only):
  `mkdir -p .claude/skills && cp -R skills/* .claude/skills/`
- **Claude apps (claude.ai, desktop)**: zip each skill folder (the folder itself, with `SKILL.md`
  at its top) and add it in Settings → Capabilities → Skills.
- **Any other agent**: give it `../CLAUDE.md` and the `SKILL.md` it needs; they are plain Markdown.

Personal rules (the owner's writing voice, his resume facts) belong in `../private/voice.md` and
`../private/profile.yaml`, which the skills tell the agent to read. Keep them out of these folders.
