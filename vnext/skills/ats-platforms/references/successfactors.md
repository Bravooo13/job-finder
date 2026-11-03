# SAP SuccessFactors Recruiting (`successfactors`)

- Category: ats-enterprise. Automation: **fill**. Confidence: pattern.
- Hosts: `\.successfactors\.(com|eu)$`, `jobs\.sap\.com$`, `\.sapsf\.(com|eu)$`
- Example link: `https://career{N}.successfactors.com/career?company={companyId}&career_job_req_id={id}`
- Job feed (html): `https://career{N}.successfactors.com/career?company={companyId}&career_ns=job_listing_summary`. Many companies front it with a Recruiting Marketing site (jobs.{company}.com) with sitemap.xml/RSS.
- Applying: multi-step, sign-in required. Account per company; resume parse; questionnaire pages.

## How to handle it

- SAP SuccessFactors career sites need an account per company; multi-page. Fill after sign-in, stop before submit.
