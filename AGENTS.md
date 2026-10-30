# AGENTS.md

Instructions for AI coding and browsing agents working on or with Job Finder
live in [CLAUDE.md](./CLAUDE.md): what the app is, how it's built, how to run,
test and deploy it, the agent API and MCP tools, and the procedures for
grabbing jobs and filling applications. Read it first.

Personal context about the owner is in `USER.md` (local only, not in git).

Hard rules, repeated here:
- Never submit an application, create an account, accept terms or type a
  password for the owner yourself. Stop at Submit and ask. To apply in bulk,
  queue the jobs for Auto apply (`auto_apply`), which submits only as the
  owner's own settings allow; see `.claude/skills/job-applier/SKILL.md`.
- Follow Job Finder's permissions (Settings → What AI may do). A tool reply of
  "Waiting for the owner" means it's in his Waiting for you list: don't retry
  or work around it, and never try to change the permissions.
- Never commit personal data (USER.md, data/, resumes, .env).
- Read LinkedIn and Handshake at a human pace, only pages the owner would open.
