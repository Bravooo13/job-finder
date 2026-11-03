# Lever (`lever`)

- Category: ats-mid. Automation: **full**. Confidence: verified.
- Hosts: `jobs(\.eu)?\.lever\.co$`
- Example link: `https://jobs.lever.co/{token}/{uuid}`
- Job feed (json-get): `https://api.lever.co/v0/postings/{token}?mode=json`. EU: api.eu.lever.co
- Applying: single-page, sign-in none. Apply page: https://jobs.lever.co/{token}/{uuid}/apply. Plain inputs, cards[...] custom questions, hCaptcha on some.

## How to handle it

- Form at `https://jobs.lever.co/{company}/{id}/apply`. One page; plain inputs, `cards[...]` custom questions, a resume upload that parses into name/email/phone.
- An hCaptcha may show on Submit for some companies: owner's.
- Feed: `GET api.lever.co/v0/postings/{company}?mode=json` (EU: api.eu.lever.co).
