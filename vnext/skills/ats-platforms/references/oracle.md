# Oracle Recruiting Cloud (Fusion HCM) (`oracle`)

- Category: ats-enterprise. Automation: **fill**. Confidence: documented.
- Hosts: `\.fa\.[a-z0-9]+\.oraclecloud\.com$`, `\.oraclecloud\.com$`
- Example link: `https://{tenant}.fa.{dc}.oraclecloud.com/hcmUI/CandidateExperience/en/sites/{siteNumber}/job/{id}`
- Job feed (json-get): `https://{tenant}.fa.{dc}.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations&finder=findReqs;siteNumber={siteNumber},limit=25,offset=0,keyword="{q}"`. Public, no login. siteNumber is in the careers URL (CX_1 etc.).
- Applying: multi-step, sign-in optional. Email first, then a one-time code by email to continue (passwordless); then several pages.
- Notes: ~8% of large employers. Some use a custom careers domain in front.

## How to handle it

- Oracle Recruiting Cloud (Candidate Experience): email first, then a one-time code by email (owner's). Feed: `GET {host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList&finder=findReqs;siteNumber={site}`.
