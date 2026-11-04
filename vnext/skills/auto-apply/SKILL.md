---
name: auto-apply
description: Apply to jobs with the jobfinder toolkit in a real browser (Playwright or Selenium) - queue, check questions first, answer once, send, then follow up on submitted / unsure / needs-you. Use when asked to apply to jobs or to check on applications.
---

# Auto apply

```bash
python -m jobfinder status                  # what's where
python -m jobfinder queue JOB_ID JOB_ID ... # queued, checked first (settings: check_first)
python -m jobfinder queue --saved           # everything on the owner's To apply list not queued yet
python -m jobfinder apply --limit 10        # runs the queue in a visible browser
python -m jobfinder send-ready              # send every checked, complete application
python -m jobfinder act APP_ID ACTION       # approve | send | retry | cancel | remove | submitted | reopen
python -m jobfinder letters [--show JOB]    # applications waiting for a cover letter / that job's description
python -m jobfinder letter JOB_ID FILE.md   # save the letter as the job's PDF; retries the application
python -m jobfinder dashboard               # private/output/dashboard.html
```

## Before the first run
- `private/profile.yaml` filled (contact, school, degree, major, GPA, graduation, work
  authorization, EEO choices). Say which empty fields will stop forms.
- `private/files/resume.pdf` present (`transcript.pdf` too if forms ask for one). Cover letters are
  written per job when a form needs one (step 4).
- `private/settings.yaml`: `submit` (sure = submit only when every answer came from the profile;
  review = always hold; fill = never submit; always), `consent` (tick "I certify" boxes), `check_first`,
  `pause_seconds`, `driver`, `headless` (keep false: the owner finishes what needs him there),
  `cover_letters` (required = write one when the form requires it; always = whenever the form takes
  one; never).
  **Only the owner changes `submit` and `consent`.**

## The loop
1. **Pick.** "Apply to my list" = the owner's To apply list: `to-apply` shows it and
   `queue --saved` queues every job on it that isn't in Auto apply yet (a job with any application,
   even a canceled one, is left alone). "Apply to the ones you think fit" = pick them yourself
   (`job-triage`, "Picking for him"), `save` them, then `queue --saved`. One or two roles per
   company; respect stated limits.
2. **Queue.** `queue` refuses LinkedIn/Indeed/Handshake-only links (apply there yourself), skips
   video or email-only postings and manual platforms (`--force` only on the owner's word), and
   rewrites Greenhouse/Lever/Ashby links to their form pages.
3. **Check first.** `apply` fills each form without Submit: complete ones become `ready`, the rest
   `needs_you` with the exact questions.
4. **Answer once** (`application-answers`): save facts with `answer`, ask the owner the rest in one
   message, then `act APP_ID retry`.
   **Cover letters:** a form that needs one stops as `needs_you` with "Write a cover letter for this
   job". For each in `letters`: read the posting (`letters --show JOB_ID`), write the letter with the
   `cover-letter-writer` skill, save it to a file, and run `letter JOB_ID FILE.md`. That builds
   `private/files/cover-letter-{JOB_ID}.pdf` and puts the application back in the queue; the next
   `apply` attaches it. Don't wait for the owner unless he asked to see letters first.
5. **Send.** `send-ready` puts ready ones back in the queue to submit; run `apply` again.
6. **Report** by status (below). The dashboard shows the same.

## Statuses
| Status | Means | You do |
| --- | --- | --- |
| queued (Waiting) | in line | run `apply` |
| ready (Ready to send) | checked, complete, not sent | `send-ready` |
| held (Waiting for your OK) | guessed or AI-written answers | show `checks`; `act approve` only on the owner's yes |
| needs_you | questions, sign-in, emailed code, CAPTCHA, upload | show `needs` exactly; the tab stays open |
| unsure (Sent? Check) | Submit pressed, no thank-you seen | ask him to check email; `act submitted` when he confirms; only he says `reopen` |
| submitted | thank-you seen; job marked applied | done |
| failed | an error before Submit | read the summary; `retry` |

## The Submit lock
Once Submit was pressed, the application is never pressed again on its own: no thank-you →
`unsure`; `retry`, `send` and `approve` raise an error. A duplicate application looks bad and many
companies already have it (they often email a code first). Never queue the same job twice "to be
sure".

## Workday
With `accounts: true` the runner makes the company's Workday account itself (his email, a new
password per site in the Keychain, `private/accounts.yaml` lists them) and signs in on later visits.
If Workday emails a verification link, the application stops as needs_you: he clicks the link, then
`act APP_ID retry`. Workday is filled page by page and stops at Review for him to submit.

## The owner's, never yours
Accounts and passwords unless `accounts: true`, sign-ins on other sites (Taleo, iCIMS...), CAPTCHAs,
emailed codes and verification links, consent boxes unless `consent: true`, changing
`submit`/`consent`/`accounts`, approving held answers without his yes, `reopen`. Leave the window
open and tell him what to do there.
