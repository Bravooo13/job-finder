# Greenhouse (`greenhouse`)

- Category: ats-mid. Automation: **full**. Confidence: verified.
- Hosts: `(^|\.)greenhouse\.io$`, `boards\.greenhouse\.io$`, `job-boards(\.eu)?\.greenhouse\.io$`
- Example link: `https://job-boards.greenhouse.io/{token}/jobs/{id}  (also company sites with ?gh_jid={id})`
- Job feed (json-get): `https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true`. Questions per job: /v1/boards/{token}/jobs/{id}?questions=true
- Applying: single-page, sign-in none. Form at https://job-boards.greenhouse.io/embed/job_app?for={token}&token={id}. React Select dropdowns (type with real key presses), education rows school--N/degree--N/discipline--N, MyGreenhouse autofill rebuilds them, invisible reCAPTCHA, sometimes an emailed 8-character security code after Submit.
- Notes: ~24% of large employers; most startups and tech companies.

## Lessons from live runs

- Apply on `https://job-boards.greenhouse.io/embed/job_app?for={token}&token={id}`. Company sites with `?gh_jid=` embed the same form.
- Dropdowns are React Select: click, type with real key presses (`delay=25`), wait for `[role=option]`, click the best match. Setting `.value` does nothing.
- Long lists (School, Discipline, Location) are type-to-search: there is no full option list to read; type the value and pick.
- Attach the resume FIRST and wait 2-5 s: Greenhouse parses it and rebuilds the education rows (`school--0` becomes `school--1`) with its own guesses. Read the form again, then fill over the guesses.
- A signed-in MyGreenhouse account autofills contact and education a few seconds after load and again when a dropdown opens. Let it finish, then fill over it with the profile. Fields it clears later are refilled (twice at most).
- The reCAPTCHA is the invisible kind (a badge in the corner). It is not a box to tick. A real challenge after Submit goes to the owner.
- After Submit, some companies email an 8-character security code. The page shows a code field: that is "needs you", tab left open. Never type the code.
- "Thank you for your interest" is printed on many forms before Submit. Only a NEW thank-you (or a URL change to /confirmation) counts as submitted.
- Questions per job, before opening the form: `GET boards-api.greenhouse.io/v1/boards/{token}/jobs/{id}?questions=true`.
