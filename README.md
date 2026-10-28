# Job Finder

A personal job search dashboard. Track every application, keep one master
profile and spin off tailored resumes for each job, and pull job details
straight from a posting link.

Everything runs on your own computer. Your jobs and resumes live in a single
SQLite file under `data/`, which never leaves your machine.

## Features

**Dashboard**: applications this week and month, response rate, interviews and
offers, a weekly activity chart, your pipeline by status, a year-long
application calendar, recently added jobs and upcoming apply-by dates.

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
- A master profile with contact info, summary, experience, education,
  projects, certifications, volunteering, awards and grouped skills.
- "Tailor a resume" on any job copies your master profile and links the copy
  to that job, so you can trim it for the role.
- A clean, printable resume page. Use your browser's *Save as PDF*.

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

## Roadmap

- [ ] Automations: daily searches across company boards (Greenhouse, Lever,
      Ashby, Workday) with no limit on companies, matched to your resume
- [ ] Jobs map: see openings by city, e.g. everything in Chicago
- [ ] LinkedIn and Handshake: add jobs from your own browser session, plus job
      alert emails
- [ ] AI matching with Claude: match scores, tailored resume suggestions and
      cover letters
- [ ] Interview tracking: stages, interviewers and prep questions
- [ ] Tasks and time tracking
- [ ] Your LinkedIn connections at each company
- [ ] Optional accounts for a hosted version

## Tech

Next.js 15 (App Router, server actions), React 19, TypeScript, Tailwind CSS 4,
Radix UI, Drizzle ORM with SQLite (libSQL) and Nivo charts.

| Command | What it does |
| --- | --- |
| `npm run dev` | Start in development mode on port 3737 |
| `npm run build` then `npm start` | Production build and server |
| `npm run typecheck` | Type-check the project |
| `npm run db:generate` | Create a migration after changing `src/lib/db/schema.ts` |
| `npm run db:studio` | Browse the database in Drizzle Studio |

## Credits

Some UI components and job-board parsing logic were adapted from
[JobSync](https://github.com/Gsync/jobsync) (MIT). See
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

## License

[MIT](./LICENSE)
