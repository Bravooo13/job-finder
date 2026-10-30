# Job Finder MCP server

Gives an AI agent (Claude Code, Claude Desktop, any MCP client) the same actions
the Job Finder assistant uses inside the app: find and triage jobs, ask the
specialist agents, make resume versions and cover letters, queue Auto apply,
track jobs and change settings. It talks to Job Finder on this computer
(http://127.0.0.1:3737), so keep the app running.

The tool list comes from the app (`GET /api/actions`), so a new action shows up
here by itself, and every call follows **Settings → What AI may do**: allowed
actions run, "Ask me first" ones wait in **Activity → Waiting for you** (the
tool answers "Waiting for the owner…"), and "Never" ones aren't listed at all.
Everything an outside AI does is in the activity log under "Outside AI", with
the client's name.

No install step: it's one file with no dependencies (Node 20+).

## Add it

Claude Code:

```bash
claude mcp add job-finder -- node "$HOME/Desktop/Job-Finder/mcp/server.mjs"
```

Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "job-finder": {
      "command": "node",
      "args": ["/Users/YOU/Desktop/Job-Finder/mcp/server.mjs"]
    }
  }
}
```

Replace `YOU` with your Mac user name. Set `JOB_FINDER_URL` if Job Finder runs
somewhere else.

## Tools

Run `job_finder_status` first: it says whether the AI, My answers and the
browser helper are set up, what waits for you, today's AI spending and what AIs
may do. The main tools:

| Tool | What |
| --- | --- |
| `search_found_jobs`, `get_found_job` | Found jobs with the Found-jobs filters (visa, industry, role, level, state, posted…) |
| `grab_linkedin`, `grab_linkedin_status`, `send_grabbed_jobs`, `grab_page` | Add jobs from LinkedIn, from what you read on a site, or from a careers page |
| `find_company_boards`, `add_company_board`, `list_searches`, `run_search`, `create_search` | Company boards and saved searches |
| `save_found_job`, `dismiss_found_job` | Save to My jobs; hide |
| `ask_agent` | Ask a specialist: resume-tailor, cover-letter, job-fit, interview-prep, outreach, apply-writer, compare, latex |
| `list_resumes`, `make_resume_version` | Resume versions by industry; make one (the LaTeX editor tailors it) |
| `write_cover_letter`, `list_cover_letters`, `write_application_answer` | Letters and written answers |
| `get_apply_profile`, `update_apply_profile`, `answer_application_fields` | My answers; answers for a form's fields |
| `auto_apply`, `auto_apply_status`, `auto_apply_action`, `approve_application` | Queue applications, follow them, act on one (approving asks you first by default) |
| `update_auto_apply_settings` | Auto apply settings (changing submit or consent asks you first by default) |
| `list_my_jobs`, `get_my_job`, `update_my_job`, `mark_applied`, `apply_queue` | Tracked jobs |
| `list_waiting`, `list_activity` | What waits for you (and how you decided); who did what |
| `get_resume_pdf`, `get_cover_letter_pdf` | Save the PDF to a temp file and return its path, for uploading (these two run in the MCP server itself) |

AIs can't change their own permissions: there is no tool for that. The MCP
server never submits anything itself. Auto apply runs in your Chrome through the
extension and submits only as your Auto apply settings allow. See ../CLAUDE.md
for the procedures.
