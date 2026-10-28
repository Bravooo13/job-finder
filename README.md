# Job Finder

A personal job search dashboard. Import your resume, let saved searches scan
thousands of company job boards for roles that fit it, see where the jobs are on
a map, and track every application from saved to offer.

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
  can add any company on Greenhouse, Lever, Ashby or Workday by name or careers
  link.
- Title matching understands word forms ("data scientist" finds "Data Science
  Intern"), skips senior roles, notices "5+ years of experience", and flags
  postings that say they don't sponsor visas.
- Runs daily at the hour you pick (while the app is open) or on demand, with
  live progress and run history.

**Found jobs**: a review queue of everything your searches found, best
matches first. See why each job matched, read the description, then save it to
My jobs or dismiss it.

**Map**: every saved job and new find on a map, grouped by city. Search a city
(for example Chicago) to list the jobs within 25 miles.

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

- [x] Automations: daily searches across company boards (Greenhouse, Lever,
      Ashby, Workday) with no limit on companies, matched to your resume
- [x] Jobs map: see openings by city, e.g. everything in Chicago
- [x] Resume import from PDF and Word
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
Radix UI, Drizzle ORM with SQLite (libSQL), Nivo charts and Leaflet maps.

Everything is local: job boards are read straight from their public feeds by
your own computer, cities are placed with a bundled copy of GeoNames, and map
tiles come from CARTO.

### API

| Endpoint | What it does |
| --- | --- |
| `POST /api/resumes/import` | Multipart `file` (PDF, DOCX, TXT): creates a resume |
| `GET /api/companies?q=` | Finds a company's job boards by name or careers URL |
| `POST /api/companies` | `{ provider, token, host?, site? }`: checks and adds a board |
| `GET /api/searches` | Your searches and their latest runs |
| `POST /api/searches` | Creates a search (`name`, `titles`, `keywords`, `locations`, `levels`, …) |
| `POST /api/searches/:id/run` | Starts a search in the background |
| `GET /api/jobs/export` | Your tracked jobs as CSV |

### Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start in development mode on port 3737 |
| `npm run build` then `npm start` | Production build and server |
| `npm run typecheck` | Type-check the project |
| `npm run db:generate` | Create a migration after changing `src/lib/db/schema.ts` |
| `npm run db:studio` | Browse the database in Drizzle Studio |

## Credits

Some UI components, job-board parsing logic and the company board directory
were adapted from [JobSync](https://github.com/Gsync/jobsync) (MIT). City data
is from [GeoNames](https://www.geonames.org/) (CC BY 4.0). See
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

## License

[MIT](./LICENSE)
