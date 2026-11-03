# iCIMS (`icims`)

- Category: ats-enterprise. Automation: **fill**. Confidence: pattern.
- Hosts: `\.icims\.com$`
- Example link: `https://careers-{company}.icims.com/jobs/{id}/{slug}/job`
- Job feed (html): `https://careers-{company}.icims.com/jobs/search?ss=1&in_iframe=1&pr={page}`. Listing in an iframe; add in_iframe=1 to get the plain page.
- Applying: multi-step, sign-in required. Email/login step, then profile and questions in an iframe.

## How to handle it

- The form lives in an iframe; add `in_iframe=1` to the URL to get it as a plain page. Starts with an email/login step: owner's.
