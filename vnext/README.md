# Job Finder vnext

Find jobs, sort them, and apply to them from your own computer with a real browser
(Playwright or Selenium). Plain Python, one SQLite file, a static HTML dashboard, and a set of
agent skills any Claude account can load. Your data stays in `private/`.

## Start

```bash
bash scripts/setup.sh && source .venv/bin/activate
# fill private/profile.yaml, private/searches.yaml; put your resume at private/files/resume.pdf
python -m jobfinder find --simplify
python -m jobfinder jobs --visa friendly --min 60
python -m jobfinder queue JOB_ID JOB_ID
python -m jobfinder apply            # checks every form first; nothing is submitted yet
python -m jobfinder status           # answer what's missing: python -m jobfinder answer "Question" "Answer"
python -m jobfinder send-ready && python -m jobfinder apply
python -m jobfinder dashboard        # open private/output/dashboard.html
```

Coming from v1: `python -m jobfinder import-v1 ../data/job-finder.db`.

## What it will never do for you

Type passwords, create accounts, solve CAPTCHAs, type emailed codes, or tick consent boxes
(unless you set `consent: true`). It never presses Submit twice on the same application.

## For AI agents

Start with `CLAUDE.md`, then `skills/README.md`.

Tests: `python -m pytest -q`.
