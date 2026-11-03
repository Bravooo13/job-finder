# LinkedIn Jobs / Easy Apply (`linkedin`)

- Category: job-board. Automation: **manual**. Confidence: verified.
- Hosts: `(^|\.)linkedin\.com$`
- Example link: `https://www.linkedin.com/jobs/view/{id}/`
- Job feed (html): `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords={q}&location={place}&f_TPR=r604800&start=0`. Guest pages, one request every 1.3-2.3 s, stop on 429/999. Detail: /jobs-guest/jobs/api/jobPosting/{id}
- Applying: easy-apply, sign-in required. LinkedIn's terms forbid automated applying. Use the company's own apply link when there is one.

## How to handle it

- Never automate applying (Easy Apply) and keep reading at a human pace: one job at a time, 1.3-2.3 s apart, stop on HTTP 429/999. Use LinkedIn only to FIND jobs; follow the company's own apply link.
