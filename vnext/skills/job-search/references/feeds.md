# Public job feeds (what `jobfinder/feeds.py` calls)

All are the job-seeker feeds behind company careers pages: no key, no login.

| Platform | Request | Board id |
| --- | --- | --- |
| Greenhouse | `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` | token from `job-boards.greenhouse.io/{token}` |
| Lever | `GET https://api.lever.co/v0/postings/{company}?mode=json` | `jobs.lever.co/{company}` |
| Ashby | `GET https://api.ashbyhq.com/posting-api/job-board/{org}?includeCompensation=true` | `jobs.ashbyhq.com/{org}` |
| SmartRecruiters | `GET https://api.smartrecruiters.com/v1/companies/{id}/postings?limit=100&offset=N` | `jobs.smartrecruiters.com/{id}` |
| Workday | `POST https://{tenant}.{wdN}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs` body `{"appliedFacets":{},"limit":20,"offset":0,"searchText":"data"}` | host + tenant + site from the job link |
| Workable | `POST https://apply.workable.com/api/v3/accounts/{account}/jobs` body `{"query":"","location":[],"department":[],"worktype":[],"remote":[]}` | `apply.workable.com/{account}` |
| Recruitee | `GET https://{company}.recruitee.com/api/offers/` | subdomain |
| Breezy | `GET https://{company}.breezy.hr/json` | subdomain |
| BambooHR | `GET https://{company}.bamboohr.com/careers/list` | subdomain |
| Pinpoint | `GET https://{company}.pinpointhq.com/postings.json` | subdomain |
| Personio | `GET https://{company}.jobs.personio.de/xml` (XML) | subdomain |
| Simplify | `GET https://raw.githubusercontent.com/SimplifyJobs/{Summer2027-Internships,New-Grad-Positions}/dev/.github/scripts/listings.json` | every listing's URL also teaches a board |
| LinkedIn (guest) | `GET https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=&location=&f_TPR=r604800&start=0` (~10 cards) and `/jobs-guest/jobs/api/jobPosting/{id}` | paced, stops on 429/999 |
| Any careers page | schema.org `JobPosting` JSON-LD in the HTML | `grab URL` |

Adding a feed: a function `feed_x(board) -> list[dict]` in `jobfinder/feeds.py` returning
`{url, title, company, location, description, posted_at, apply_url, platform}`, register it in
`FEEDS`, add the host pattern to `BOARD_PATTERNS`, and set `feed` in `platforms/registry.json`.
