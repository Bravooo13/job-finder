# SmartRecruiters (`smartrecruiters`)

- Category: ats-mid. Automation: **fill**. Confidence: verified.
- Hosts: `(jobs|careers)\.smartrecruiters\.com$`
- Example link: `https://jobs.smartrecruiters.com/{Company}/{id}`
- Job feed (json-get): `https://api.smartrecruiters.com/v1/companies/{Company}/postings?limit=100&offset=0`. Detail: /v1/companies/{Company}/postings/{id}
- Applying: multi-step, sign-in none. One-click apply app (oneclick-ui), 2-3 steps, resume parse; optional sign-in.

## How to handle it

- Feed: `GET api.smartrecruiters.com/v1/companies/{id}/postings`. Apply: `jobs.smartrecruiters.com/{company}/{id}` → "I'm interested" → one-page form (sometimes a second page of screening questions).
- Treated as a step form: fill, Next, fill, stop or submit by settings.
