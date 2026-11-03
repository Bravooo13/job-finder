# Workday Recruiting (`workday`)

- Category: ats-enterprise. Automation: **fill**. Confidence: verified.
- Hosts: `\.myworkdayjobs\.com$`, `\.myworkdaysite\.com$`, `\.myworkday\.com$`
- Example link: `https://{tenant}.wd5.myworkdayjobs.com/{site}/job/{location}/{title}_{reqId}`
- Job feed (json-post): `https://{tenant}.{wdN}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs`. POST {"appliedFacets":{},"limit":20,"offset":0,"searchText":""}; detail: GET .../wday/cxs/{tenant}/{site}{externalPath}
- Applying: multi-step, sign-in required. Create account/sign in per company (email + password + email verification), then 5-7 pages: My Information, My Experience (resume parse), Application Questions, Voluntary Disclosures, Self Identify, Review. data-automation-id attributes are stable selectors.
- Notes: ~46% of large employers. The owner signs in once per company in the persistent browser profile; the driver then fills page by page and stops at Review.

## How to handle it

- Every company is its own tenant: the owner creates an account and signs in ONCE per company in the persistent browser profile (`private/browser-profile`). Never create the account or type the password.
- After sign-in: My Information → My Experience (resume parse) → Application Questions → Voluntary Disclosures → Self Identify → Review. Selectors: `data-automation-id` (`pageFooterNextButton`, `bottom-navigation-next-button`, `signInLink`, `createAccountLink`).
- The driver fills page by page and STOPS at Review (`may_submit = False`): the owner submits.
- Feed (no login): `POST https://{tenant}.{wdN}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs` with `{"appliedFacets":{},"limit":20,"offset":0,"searchText":""}`.
