---
name: auto-apply
description: Apply to jobs with the jobfinder toolkit in a real browser (Playwright or Selenium) - queue, check questions first, answer once, send, then follow up on submitted / unsure / needs-you. Use when asked to apply to jobs or to check on applications.
---

# Auto apply

```bash
python -m jobfinder status                  # what's where
python -m jobfinder queue JOB_ID JOB_ID ... # queued, checked first (settings: check_first)
python -m jobfinder apply --limit 10        # runs the queue in a visible browser
python -m jobfinder send-ready              # send every checked, complete application
python -m jobfinder act APP_ID ACTION       # approve | send | retry | cancel | remove | submitted | reopen
python -m jobfinder dashboard               # private/output/dashboard.html
```

## Before the first run
- `private/profile.yaml` filled (contact, school, degree, major, GPA, graduation, work
  authorization, EEO choices). Say which empty fields will stop forms.
- `private/files/resume.pdf` present (and `cover-letter-{JOB_ID}.pdf` for jobs that need one).
- `private/settings.yaml`: `submit` (sure = submit only when every answer came from the profile;
  review = always hold; fill = never submit; always), `consent` (tick "I certify" boxes), `check_first`,
  `pause_seconds`, `driver`, `headless` (keep false: the owner finishes what needs him there).
  **Only the owner changes `submit` and `consent`.**

## The loop
1. **Pick** (from `job-triage`). If you chose them, list them and get a yes. One or two roles per
   company; respect stated limits.
2. **Queue.** `queue` refuses LinkedIn/Indeed/Handshake-only links (apply there yourself), skips
   video or email-only postings and manual platforms (`--force` only on the owner's word), and
   rewrites Greenhouse/Lever/Ashby links to their form pages.
3. **Check first.** `apply` fills each form without Submit: complete ones become `ready`, the rest
   `needs_you` with the exact questions.
4. **Answer once** (`application-answers`): save facts with `answer`, ask the owner the rest in one
   message, then `act APP_ID retry`.
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

## The owner's, never yours
Passwords, creating accounts, sign-ins (Workday, Taleo, iCIMS...), CAPTCHAs, emailed codes, consent
boxes unless `consent: true`, changing `submit`/`consent`, approving held answers without his yes,
`reopen`. Leave the window open and tell him what to do there.
