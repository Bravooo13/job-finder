# Oracle Taleo Enterprise (`taleo`)

- Category: ats-enterprise. Automation: **fill**. Confidence: pattern.
- Hosts: `\.taleo\.net$`
- Example link: `https://{company}.taleo.net/careersection/{section}/jobdetail.ftl?job={id}`
- Job feed (html): `https://{company}.taleo.net/careersection/{section}/jobsearch.ftl`. Legacy; REST rest/jobboard/searchjobs is POST JSON on some tenants.
- Applying: multi-step, sign-in required. Account + password, many pages, frequent timeouts.

## How to handle it

- Old multi-page form with an account per company. Fill only after the owner signs in; stop at the review page.
