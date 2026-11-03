# Ashby (`ashby`)

- Category: ats-mid. Automation: **full**. Confidence: verified.
- Hosts: `jobs\.ashbyhq\.com$`
- Example link: `https://jobs.ashbyhq.com/{token}/{uuid}`
- Job feed (json-get): `https://api.ashbyhq.com/posting-api/job-board/{token}?includeCompensation=true`
- Applying: single-page, sign-in none. https://jobs.ashbyhq.com/{token}/{uuid}/application. Yes/No are buttons, file upload with resume parse, custom location combobox.

## How to handle it

- Form at `https://jobs.ashbyhq.com/{org}/{id}/application`. React app; Yes/No questions are BUTTON groups, not radios (the scanner reads them as `kind: buttons`).
- Resume upload autofills; wait and re-read like Greenhouse.
- Feed: `GET api.ashbyhq.com/posting-api/job-board/{org}?includeCompensation=true`.
