---
name: job-triage
description: Sort found jobs for an international (F-1 OPT/CPT) or any candidate - scores, visa signals, level, place - and save or dismiss them with the jobfinder toolkit. Use after a job search or when asked which jobs to apply to.
---

# Job triage

```bash
python -m jobfinder jobs --visa friendly --min 60 --status new --limit 40
python -m jobfinder save JOB_ID       # keep it (queue-able)
python -m jobfinder dismiss JOB_ID    # never show again
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
A short list: title, company, place, score, visa, one line on why. If you picked the jobs yourself,
get the owner's yes before queuing (`auto-apply`).
