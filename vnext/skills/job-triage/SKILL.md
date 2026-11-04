---
name: job-triage
description: Sort found jobs for an international (F-1 OPT/CPT) or any candidate - scores, visa signals, level, place - and save or dismiss them with the jobfinder toolkit. Use after a job search or when asked which jobs to apply to.
---

# Job triage

```bash
python -m jobfinder jobs --visa friendly --min 60 --status new --limit 40
python -m jobfinder save JOB_ID ...   # add to the owner's To apply list
python -m jobfinder unsave JOB_ID ... # take off the list
python -m jobfinder dismiss JOB_ID    # never show again
python -m jobfinder to-apply          # the list, and where each job is
```

## Score (0-100, `jobfinder/match.py`)
Title match against the search titles, keywords from the search and resume, level (intern / entry /
new grad), place (city, state, remote). Red flags lower it: "5+ years", senior/staff/manager, a
level that doesn't fit. A score is a sorting aid, not a verdict: read the description.

## Visa signals (`jobfinder/classify.py`, the sentence that triggered it is kept as `visa_note`)
| Value | Means | Do |
| --- | --- | --- |
| `sponsors` | says it sponsors (H-1B, "visa sponsorship available") | good |
| `opt_cpt` | welcomes OPT/CPT or international students | good |
| `unknown` | says nothing | fine: most companies don't say; check H-1B history if it matters |
| `no_sponsorship` | "unable to sponsor", "must be authorized without sponsorship now or in the future" | dismiss for an F-1 candidate who needs H-1B later, unless the owner says internships are fine |
| `citizens_only` | US citizen, security clearance, ITAR "U.S. person" | dismiss for non-citizens |

"Visa-friendly" = sponsors + opt_cpt + unknown.

## Dismiss when
Citizens only or clearance; senior roles or 3-5+ years required for an intern/new-grad search; a
place the owner ruled out; video-only or email-only applications if he doesn't want them; a company
limit already reached (some allow 3 applications in 30 days).

## Output
A short list: title, company, place, score, visa, one line on why. When you go over jobs with the
owner, the ones he says yes to go on his **To apply** list (`save`); he can also add and remove
them himself with the buttons on the dashboard (`python -m jobfinder serve`, tab To apply). For a
request like "queue ten Chicago jobs", use `jobs --place Chicago --visa friendly --type internship
--min 75 --status new`, read them, and `save` the ten you'd pick.

## Picking for him
When he asks you to apply to jobs you think fit (his list is empty, or he says so), pick them
yourself with the rules above: visa-friendly (prefer known H-1B sponsors, `jobs --visa h1b`), his
level and places, score >= 75, read each description, at most two roles per company and about 10
per round. `save` your picks so they show on his list, then queue them (`auto-apply`) without
waiting for a yes, and tell him what you picked and why in your report.
