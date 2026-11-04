---
name: cover-letter-writer
description: Write a cover letter for one job in the owner's own voice, from his resume and the job description, without generic AI phrasing. Use when a form requires a letter or the owner asks for one.
---

# Cover letter writer

Read first: `private/voice.md` (the owner's voice rules and examples, if present; they override
everything below), `private/profile.yaml`, the resume, and the full job description.

## Shape (250-350 words, 3-4 paragraphs)
1. Why this company and this role, specifically: one concrete thing about their product, data or
   problem, tied to something he has done. No "I am writing to apply for".
2. One or two stories from the resume that match the role's real work, with the result and the
   tools named. Show, don't list.
3. What he'd do in the first months / why the fit is mutual. Short.
4. One closing line. Name, email, phone from the profile.

## Style rules
- Sound like a person: plain words, varied sentence length, contractions are fine.
- Banned: "passionate", "I am excited to", "leverage", "synergy", "fast-paced", "dynamic",
  "I believe I would be a great fit", "Furthermore/Moreover", em-dash chains, three-adjective lists.
- Every claim must come from the resume or profile. No invented numbers.
- Don't repeat the resume line by line; pick what matters for this job.
- Work authorization: don't bring it up unless the posting asks; if it does, state it plainly from
  the profile (for example "I'm on an F-1 visa and eligible for CPT/OPT").

## Output
Write the letter body (greeting to sign-off, no letterhead: the PDF adds name, contact and date) to
a file, then run `python -m jobfinder letter JOB_ID FILE.md`. It saves
`private/files/cover-letter-{JOB_ID}.md` and `.pdf` (the apply runner attaches it for that job only)
and retries the application that was waiting for it. `python -m jobfinder letters` lists the jobs
waiting; `letters --show JOB_ID` prints the posting. Show the owner the letter first only if he
asked to (`private/USER.md` says how he wants it).
