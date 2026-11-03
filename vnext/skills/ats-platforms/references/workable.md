# Workable (`workable`)

- Category: ats-mid. Automation: **full**. Confidence: documented.
- Hosts: `apply\.workable\.com$`, `\.workable\.com$`
- Example link: `https://apply.workable.com/{account}/j/{shortcode}/`
- Job feed (json-post): `https://apply.workable.com/api/v3/accounts/{account}/jobs`. {"query":"","location":[],"department":[],"worktype":[],"remote":[]}; detail /api/v2/accounts/{account}/jobs/{shortcode}
- Applying: single-page, sign-in none. /apply page; may show a reCAPTCHA.
