# Job Finder

A personal job search dashboard. Import your resume, let saved searches scan
thousands of company job boards for roles that fit it, grab jobs from LinkedIn
and Handshake with a Chrome extension, filter by industry and visa
friendliness (sponsorship, OPT/CPT, H-1B history), compare jobs side by side,
tailor LaTeX resumes and cover letters with AI agents, fill (and, if you let
it, submit) application forms from your saved answers, and track every
application from saved to offer.

You can do everything yourself, or hand it to AI: the **Job Finder assistant**
inside the app, or an outside AI (Claude Code, Claude Desktop) through the MCP
server. Both use the same set of actions, follow the same permissions (**Settings
→ What AI may do**: Do it, Ask me first or Never, plus a daily AI spending limit),
and show up in one **Activity** log. See [CLAUDE.md](./CLAUDE.md).

Everything runs on your own computer. Your jobs and resumes live in a single
SQLite file under `data/`, which never leaves your machine.

## Features

**Dashboard**: applications this week and month, response rate, interviews and
offers, a weekly activity chart, your pipeline by status, a year-long
application calendar, recently added jobs and upcoming apply-by dates.

**Searches (automations)**
- Describe what you want: job titles, level (internships, entry level), places
  and your skills. Job Finder checks every company board it knows, with no cap
  on companies, and scores each posting 0–100 against your resume.
- About 3,600 company boards are built in (Greenhouse, Lever, Ashby), and you
  can add any company on Greenhouse, Lever, Ashby, Workday or SmartRecruiters
  by name or careers link.
- Simplify's internship and new-grad lists are scanned too, and every job link
  that points at a company's own board teaches Job Finder that board, so small
  companies get scanned directly from then on.
- Title matching understands word forms ("data scientist" finds "Data Science
  Intern"), skips senior roles, notices "5+ years of experience", and flags
  postings that say they don't sponsor visas.
- Runs daily at the hour you pick (while the app is open) or on demand, with
  live progress and run history.

**Found jobs**: a review queue of everything your searches and grabs found,
best matches first. Each job is sorted into an industry and a role type, and
its visa wording is read: sponsors, open to OPT/CPT, no sponsorship, or US
citizens only, with the sentence that says so. Filter by visa (including "F-1
friendly" and known H-1B sponsors from USCIS data), industry, role, level, job
type, workplace, state, posting date, source and years asked. Save, dismiss,
or tick a few and compare them.

**Browser helper (Chrome extension)**: on LinkedIn and Handshake, "Grab jobs
on this page" reads each job at a human pace and sends it to Found jobs, with
the company's own application link. On any careers page it reads the job data
or learns the company's job board. See [extension/README.md](./extension/README.md).

**Compare**: two to six jobs side by side (fit, visa outlook, H-1B history,
level, years asked, place, pay, posting age) and an AI agent that ranks them
and plans your applications.

**Apply**: your saved jobs waiting to be sent, with what's ready (tailored
resume, PDF, cover letter, written answers). *My answers* holds your standard
answers (contact, education, work authorization, availability, EEO choices,
your own Q&A). On an application form the browser helper fills every field it
can, attaches your resume and cover letter, drafts open questions with AI and
colors what needs a look. You review and press Submit yourself.

**Auto apply**: tick jobs in *To apply* or *Found jobs* and press Auto apply.
The browser helper opens each application in a background tab of your Chrome,
fills it from your answers and your resume, and then, as you choose, submits it
when every answer came from your answers (holding anything guessed or written
by AI for your OK), always waits for your OK, or only fills it. Consent and "I
certify" boxes are ticked only if you turn that on. It never creates accounts,
types passwords or solves CAPTCHAs: those applications wait for you, with a
list of exactly what's missing. AI agents can queue a batch with one tool call.

**Map**: a drawn US map with states shaded by how many jobs they have and a
bubble per city; click a state or a city to list its jobs. A street map is one
click away.

**Jobs**
- Paste a job link and Job Finder fills in the title, company, location,
  salary, job type and full description. It reads the public job feeds of
  Greenhouse, Lever, Ashby and Workday directly, and understands any company
  career page that publishes standard job data (schema.org `JobPosting`, the
  same data Google for Jobs uses).
- It warns you when a link is already saved.
- 11 statuses from New to Offer Accepted, changeable right from the list.
- Search, filter by status and workplace, sort, and export to CSV.
- A notes timeline on each job.

**Profile and resumes**
- Import your resume from PDF or Word and it's split into contact info,
  education, experience, projects, skills and more, ready to edit.
- A master profile with contact info, summary, experience, education,
  projects, certifications, volunteering, awards and grouped skills.
- "Tailor a resume" on any job copies your master profile and links the copy
  to that job, so you can trim it for the role.
- A clean, printable resume page. Use your browser's *Save as PDF*.

**Resume studio (LaTeX)**
- Every resume has a LaTeX & PDF tab: a code editor on the left, the compiled
  PDF on the right. Build the LaTeX from your resume content, start from a
  template or upload your own `.tex`. Edits save as you type; press ⌘S to
  compile.
- PDFs are made by [Tectonic](https://tectonic-typesetting.github.io/), which
  Job Finder downloads into `data/bin` the first time (or uses your own copy).
- **New industry version** copies a resume and has the AI rework it for a field
  (data science, quant, consulting, …) or a saved job. You review the result
  and press *Apply to editor*. Compile errors have an *Ask AI to fix it* button.

**Cover letters**: pick one of your jobs (or paste a job description) and a
resume, and the cover letter writer drafts a letter in your voice. Ask for
changes in the chat next to it ("make the opening punchier"), edit it yourself,
then copy it, download it or print it to PDF. Every letter and its chat is
saved.

**AI agents**: ten agents, each with its own instructions, that read your
resume, the job and your notes about yourself:

| Agent | What it does |
| --- | --- |
| Job Finder assistant | Runs your search end to end with Job Finder's actions as tools: finds and sorts jobs, asks the other agents for resumes and letters, queues Auto apply |
| Job scout | Searches LinkedIn, company boards and careers pages, then shortlists |
| Resume tailor | Rewrites bullets for a job or industry, finds keyword gaps, says what to cut |
| LaTeX editor | Edits the LaTeX resume: industry versions, one-page fixes, compile errors |
| Cover letter writer | Writes and revises cover letters with strict rules against generic AI phrasing |
| Interview coach | Prep sheets, mock interviews one question at a time, technical drills, STAR stories |
| Job fit reviewer | A frank fit score, gaps, red flags (sponsorship, years required) and how to apply |
| Networking messages | LinkedIn notes, alumni and recruiter messages, referral asks, follow-ups, thank-yous |
| Application answers | Short answers for application forms ("Why this company?") in your voice |
| Job comparer | Ranks several jobs and explains the trade-offs: fit, visa, pay, location, growth |

Use them on the AI agents page, in a resume's AI chat tab, next to each cover
letter, or from a job ("Check fit", "Interview prep"). Chats are saved. You can
edit each agent's instructions in Settings.

**Who does what (Activity)**: you and AI use the same actions. In **Settings →
What AI may do** you choose, per kind of action (find jobs, ask agents, write
resumes and letters, queue Auto apply, update My jobs, change settings, approve
held applications), whether an AI may *do it*, must *ask you first* or may
*never* do it, and set a daily AI spending limit. The rules apply to the Job
Finder assistant, the Job scout and outside AIs over MCP. **Activity** shows
what waits for your OK (with Approve and Decline), everything you, the AIs, the
browser helper and schedules did, and today's AI spending by agent.

**AI models**: use Claude with your own API key (stored encrypted on your
computer) or a free local model through [Ollama](https://ollama.com). Switch
any time in Settings.

**Comfort**: light, dark and system themes, and a layout that works on phones.

## Getting started

You need [Node.js](https://nodejs.org) 20 or newer.

**On a Mac:** double-click `Start Job Finder.command`. It installs everything
on the first run, prepares the database and opens http://localhost:3737.

**Anywhere:**

```bash
npm install
npm run dev
```

Then open http://localhost:3737. The database is created automatically.

Copy `.env.example` to `.env` if you want to change where the data file lives.

**AI setup:** open Settings and either paste a Claude API key from
[console.anthropic.com](https://console.anthropic.com/settings/keys) or pick a
model from Ollama running on your computer. Add a few lines under *About you*
(goals, visa needs, writing voice) so every agent knows them.

**Browser helper:** open `chrome://extensions`, turn on Developer mode, click
*Load unpacked* and pick the `extension` folder. Then fill **Apply → My
answers** (work authorization especially) so forms are answered the way you
want.

## Roadmap

- [x] Automations: daily searches across company boards (Greenhouse, Lever,
      Ashby, Workday) with no limit on companies, matched to your resume
- [x] Jobs map: see openings by city, e.g. everything in Chicago
- [x] Resume import from PDF and Word
- [x] LinkedIn and Handshake: add jobs from your own browser session (Chrome
      extension)
- [x] Industry and visa filters (sponsorship, OPT/CPT, H-1B history)
- [x] Apply helper: fill application forms from your saved answers
- [x] Compare jobs side by side
- [x] Agent API and MCP server
- [x] One set of actions for you and for AI: the Job Finder assistant, permissions,
      Waiting for you, an activity log and a daily AI spending limit
- [ ] Job alert emails
- [x] AI agents with Claude or Ollama: resume tailoring, LaTeX editing, cover
      letters, interview prep, job fit and networking messages
- [x] LaTeX resume editor with live PDF preview (Tectonic)
- [ ] AI match scores on found jobs
- [ ] Interview tracking: stages, interviewers and prep questions
- [ ] Tasks and time tracking
- [ ] Your LinkedIn connections at each company
- [ ] Optional accounts for a hosted version

## Tech

Next.js 15 (App Router, server actions), React 19, TypeScript, Tailwind CSS 4,
Radix UI, Drizzle ORM with SQLite (libSQL), Nivo charts, d3-geo and us-atlas
(drawn map), Leaflet (street map), CodeMirror and Tectonic.

Everything is local: job boards are read straight from their public feeds by
your own computer, cities are placed with a bundled copy of GeoNames, the US
map is drawn from bundled Census shapes, and street-map tiles come from CARTO.
The app only listens on this computer (127.0.0.1). The only things sent elsewhere are your AI requests,
to Anthropic when you use Claude (nothing leaves your computer with Ollama).

### API

The main endpoints are below; [CLAUDE.md](./CLAUDE.md) has the full list.

| Endpoint | What it does |
| --- | --- |
| `POST /api/resumes/import` | Multipart `file` (PDF, DOCX, TXT): creates a resume |
| `GET /api/companies?q=` | Finds a company's job boards by name or careers URL |
| `POST /api/companies` | `{ provider, token, host?, site? }`: checks and adds a board |
| `GET /api/searches` | Your searches and their latest runs |
| `POST /api/searches` | Creates a search (`name`, `titles`, `keywords`, `locations`, `levels`, …) |
| `POST /api/searches/:id/run` | Starts a search in the background |
| `GET /api/jobs/export` | Your tracked jobs as CSV |
| `GET /api/found` | Found jobs with the same filters as the page |
| `POST /api/grab`, `POST /api/grab/page` | Add jobs read in the browser; read a careers page |
| `POST /api/apply/fill` | Answers for an application form's fields |
| `GET /api/apply/resume` | The resume PDF to upload for a job |
| `GET /api/actions`, `POST /api/actions/:name` | Everything an AI can do, and running one (follows What AI may do) |
| `GET /api/control` | What waits for you and today's AI spending |
| `POST /api/ai/chat` | `{ agent, message, threadId?, context }`: streams an agent's reply as NDJSON |
| `GET /api/settings`, `PUT /api/settings` | AI provider and model, notes about you (never the API key) |
| `POST /api/latex/compile` | `{ latex }`: returns the PDF, or `{ error, log }` |
| `GET /api/latex/status`, `POST /api/latex/install` | Check for or install Tectonic |

### Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start in development mode on port 3737 |
| `npm run build` then `npm start` | Production build and server |
| `npm run typecheck` | Type-check the project |
| `npm test` | Unit tests |
| `npm run mcp` | The MCP server for AI agents ([mcp/README.md](./mcp/README.md)) |
| `npm run db:generate` | Create a migration after changing `src/lib/db/schema.ts` |
| `npm run db:studio` | Browse the database in Drizzle Studio |

## Credits

Some UI components, job-board parsing logic and the company board directory
were adapted from [JobSync](https://github.com/Gsync/jobsync) (MIT). City data
is from [GeoNames](https://www.geonames.org/) (CC BY 4.0). See
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

## License

[MIT](./LICENSE)
