# Job Finder MCP server

Lets an AI agent use Job Finder through tools: search and triage found jobs,
send jobs it read in the browser, learn company job boards, run searches,
answer application forms from your saved answers, and queue applications for
Auto apply. It talks to Job Finder on
this computer (http://127.0.0.1:3737), so keep the app running.

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

| Tool | What |
| --- | --- |
| `job_finder_status` | Is the app running, is the AI set up, are My answers filled |
| `search_found_jobs` | Found jobs with the Found-jobs filters (visa, industry, role, level, state, posted…) |
| `get_found_job`, `save_found_job`, `dismiss_found_job` | One found job; save it to My jobs; hide it |
| `list_my_jobs`, `get_my_job`, `update_my_job` | Tracked jobs; change status, add a note |
| `send_grabbed_jobs` | Add jobs read from LinkedIn, Handshake, Indeed or a careers page |
| `grab_page` | Give a careers page: reads job data, learns the company's job board, AI fallback |
| `find_company_boards`, `add_company_board` | Find a company's Greenhouse/Lever/Ashby/Workday/SmartRecruiters board and add it |
| `list_searches`, `run_search` | Saved searches; start one |
| `apply_queue` | Saved jobs not applied yet, with what's ready |
| `get_apply_profile` | Your standard application answers |
| `answer_application_fields` | Answers for a form's fields, with confidence |
| `write_application_answer` | Drafts an open question's answer in your voice |
| `get_resume_pdf`, `get_cover_letter_pdf` | Saves the PDF to a temp file and returns its path, for uploading |
| `mark_applied` | Marks a job applied after you submit |
| `auto_apply` | Queue a batch for Auto apply (found job ids, My jobs ids or application URLs) |
| `auto_apply_status` | Each application's status, what only you can do, answers to check, and whether the browser helper is running |
| `auto_apply_action` | Retry, cancel, remove, or mark one submitted (approve only when you said so) |

The MCP server itself never submits anything. Auto apply runs in your Chrome
through the extension and submits only as your Auto apply settings allow
(Apply → Auto apply). See ../CLAUDE.md for the procedures.
