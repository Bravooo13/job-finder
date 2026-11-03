# Every platform in the registry

Generated from `platforms/registry.json`. automation: full = fill and submit by settings; fill = fill, owner submits; manual = owner applies.

| id | name | category | automation | confidence | feed | sign-in |
| --- | --- | --- | --- | --- | --- | --- |
| workday | Workday Recruiting | ats-enterprise | fill | verified | json-post | required |
| oracle | Oracle Recruiting Cloud (Fusion HCM) | ats-enterprise | fill | documented | json-get | optional |
| taleo | Oracle Taleo Enterprise | ats-enterprise | fill | pattern | html | required |
| successfactors | SAP SuccessFactors Recruiting | ats-enterprise | fill | pattern | html | required |
| icims | iCIMS | ats-enterprise | fill | pattern | html | required |
| phenom | Phenom People (career site) | career-site | full | pattern | json | none |
| eightfold | Eightfold AI (career site) | career-site | fill | pattern | json-get | optional |
| avature | Avature | career-site | fill | pattern | html | optional |
| cornerstone | Cornerstone OnDemand (CSOD) | ats-enterprise | fill | pattern | json | required |
| brassring | Infinite BrassRing (formerly IBM Kenexa) | ats-enterprise | fill | pattern | json-post | required |
| ukg | UKG Pro Recruiting (UltiPro) | hcm-payroll | fill | pattern | json-post | optional |
| dayforce | Dayforce (Ceridian) | hcm-payroll | fill | pattern | html | required |
| adp | ADP Workforce Now / ADP Recruiting | hcm-payroll | fill | pattern | json-get | optional |
| paylocity | Paylocity Recruiting | hcm-payroll | full | pattern | html | none |
| paycom | Paycom | hcm-payroll | fill | pattern | html | optional |
| paycor | Paycor Recruiting | hcm-payroll | fill | pattern | html | optional |
| isolved | iSolved Hire (ApplicantPro) | hcm-payroll | full | pattern | html | none |
| trinet | TriNet Hire | hcm-payroll | full | pattern | html | none |
| hibob | HiBob (Bob Hiring) | hcm-payroll | full | pattern | html | none |
| deel | Deel ATS | hcm-payroll | full | pattern | html | none |
| rippling | Rippling Recruiting | hcm-payroll | full | documented | json-get | none |
| greenhouse | Greenhouse | ats-mid | full | verified | json-get | none |
| lever | Lever | ats-mid | full | verified | json-get | none |
| ashby | Ashby | ats-mid | full | verified | json-get | none |
| smartrecruiters | SmartRecruiters | ats-mid | fill | verified | json-get | none |
| jobvite | Jobvite | ats-mid | full | pattern | html | none |
| workable | Workable | ats-mid | full | documented | json-post | none |
| bamboohr | BambooHR | ats-smb | full | documented | json-get | none |
| jazzhr | JazzHR | ats-smb | full | documented | html | none |
| breezy | Breezy HR | ats-smb | full | documented | json-get | none |
| recruitee | Recruitee (Tellent) | ats-smb | full | documented | json-get | none |
| teamtailor | Teamtailor | ats-smb | full | documented | html | optional |
| personio | Personio | ats-smb | full | documented | xml | none |
| pinpoint | Pinpoint | ats-smb | full | documented | json-get | none |
| comeet | Comeet | ats-mid | full | pattern | json-get | none |
| dover | Dover | ats-smb | full | pattern | html | none |
| gem | Gem ATS | ats-mid | full | pattern | html | none |
| rival | Rival | ats-smb | full | pattern | html | none |
| polymer | Polymer | ats-smb | full | pattern | html | none |
| kula | Kula | ats-smb | full | pattern | html | none |
| trakstar | Trakstar Hire (Recruiterbox) | ats-smb | full | pattern | html | none |
| freshteam | Freshteam | ats-smb | full | pattern | html | none |
| zoho | Zoho Recruit | ats-smb | full | pattern | html | optional |
| manatal | Manatal | ats-smb | full | pattern | html | none |
| hirehive | HireHive | ats-smb | full | pattern | html | none |
| jobscore | JobScore | ats-smb | full | pattern | json-get | none |
| hiringthing | HiringThing | ats-smb | full | pattern | html | none |
| careerplug | CareerPlug | ats-smb | full | pattern | html | none |
| join | JOIN | ats-smb | full | pattern | html | none |
| gohire | GoHire | ats-smb | full | pattern | html | none |
| recooty | Recooty | ats-smb | full | pattern | html | none |
| hireology | Hireology | ats-smb | full | pattern | html | none |
| hirebridge | Hirebridge | ats-smb | fill | pattern | html | none |
| pageup | PageUp | ats-enterprise | fill | pattern | html | optional |
| talentreef | talentReef (Mitratech) | hourly | fill | pattern | html | none |
| paradox | Paradox (Olivia) | hourly | manual | pattern | none | none |
| fountain | Fountain | hourly | fill | pattern | html | none |
| harri | Harri | hourly | fill | pattern | html | required |
| werecruit | WeRecruit | ats-smb | full | pattern | html | none |
| bullhorn | Bullhorn (staffing agencies) | staffing | full | pattern | json-get | none |
| jobdiva | JobDiva (staffing) | staffing | fill | pattern | html | none |
| ceipal | CEIPAL (staffing) | staffing | full | pattern | html | none |
| hrmos | HRMOS (Japan) | ats-regional | full | pattern | html | none |
| gupy | Gupy (Brazil) | ats-regional | fill | pattern | json-get | required |
| custom | Company's own careers site | career-site | fill | pattern | html | none |
| linkedin | LinkedIn Jobs / Easy Apply | job-board | manual | verified | html | required |
| indeed | Indeed / Indeed Apply | job-board | manual | pattern | html | required |
| handshake | Handshake | job-board | manual | verified | html | required |
| simplify | Simplify lists (GitHub) | job-board | full | verified | json-get | none |
| wellfound | Wellfound (AngelList Talent) | job-board | manual | pattern | html | required |
| ycombinator | Y Combinator Work at a Startup | job-board | manual | pattern | html | required |
| glassdoor | Glassdoor | job-board | manual | pattern | none | required |
| ziprecruiter | ZipRecruiter | job-board | manual | pattern | none | required |
| dice | Dice | job-board | manual | pattern | html | required |
| builtin | Built In | job-board | full | pattern | html | none |

---

# Phenom People (career site) (`phenom`)

- Category: career-site. Automation: **full**. Confidence: pattern.
- Hosts: `\.phenompeople\.com$`
- Example link: `https://jobs.{company}.com/us/en/job/{id}`
- Job feed (json): `https://jobs.{company}.com/widgets`. Career site in front of Workday/SuccessFactors/Taleo: apply button leads to the real ATS. Follow it.
- Applying: redirect, sign-in none. Apply goes to the underlying ATS.
- Notes: Detect by the page's phApp/phenom scripts; then route by the apply link.

---

# Eightfold AI (career site) (`eightfold`)

- Category: career-site. Automation: **fill**. Confidence: pattern.
- Hosts: `\.eightfold\.ai$`
- Example link: `https://{company}.eightfold.ai/careers?pid={id}`
- Job feed (json-get): `https://{company}.eightfold.ai/api/apply/v2/jobs?domain={domain}&start=0&num=10&query={q}`. Some tenants use /api/pcsx/search instead.
- Applying: single-page, sign-in optional. Its own apply form or hands off to Workday etc.

---

# Avature (`avature`)

- Category: career-site. Automation: **fill**. Confidence: pattern.
- Hosts: `\.avature\.net$`
- Example link: `https://{company}.avature.net/careers/JobDetail/{slug}/{id}`
- Job feed (html): `https://{company}.avature.net/careers/SearchJobs`. RSS at /careers/SearchJobs/feed on many tenants.
- Applying: multi-step, sign-in optional.

---

# Cornerstone OnDemand (CSOD) (`cornerstone`)

- Category: ats-enterprise. Automation: **fill**. Confidence: pattern.
- Hosts: `\.csod\.com$`
- Example link: `https://{company}.csod.com/ux/ats/careersite/{site}/home/requisition/{id}`
- Job feed (json): `https://{company}.csod.com/services/x/career-site/v1/search`. Needs a token from the page; read the page instead.
- Applying: multi-step, sign-in required.

---

# Infinite BrassRing (formerly IBM Kenexa) (`brassring`)

- Category: ats-enterprise. Automation: **fill**. Confidence: pattern.
- Hosts: `\.brassring\.com$`
- Example link: `https://sjobs.brassring.com/TGnewUI/Search/Home/Home?partnerid={p}&siteid={s}#jobDetails={id}`
- Job feed (json-post): `https://sjobs.brassring.com/TgNewUI/Search/Ajax/MatchedJobs`. Session cookies from the search page.
- Applying: multi-step, sign-in required.

---

# UKG Pro Recruiting (UltiPro) (`ukg`)

- Category: hcm-payroll. Automation: **fill**. Confidence: pattern.
- Hosts: `recruiting\.ultipro\.com$`, `recruiting2\.ultipro\.com$`
- Example link: `https://recruiting.ultipro.com/{TENANT}/JobBoard/{boardGuid}/OpportunityDetail?opportunityId={id}`
- Job feed (json-post): `https://recruiting.ultipro.com/{TENANT}/JobBoard/{boardGuid}/JobBoardView/LoadSearchResults`. {"opportunitySearch":{"Top":50,"Skip":0,"QueryString":""}}
- Applying: multi-step, sign-in optional.

---

# Dayforce (Ceridian) (`dayforce`)

- Category: hcm-payroll. Automation: **fill**. Confidence: pattern.
- Hosts: `jobs\.dayforcehcm\.com$`, `\.dayforcehcm\.com$`
- Example link: `https://jobs.dayforcehcm.com/en-US/{company}/CANDIDATEPORTAL/jobs/{id}`
- Job feed (html): `https://jobs.dayforcehcm.com/en-US/{company}/CANDIDATEPORTAL`
- Applying: multi-step, sign-in required.

---

# ADP Workforce Now / ADP Recruiting (`adp`)

- Category: hcm-payroll. Automation: **fill**. Confidence: pattern.
- Hosts: `workforcenow\.adp\.com$`, `recruiting\.adp\.com$`, `myjobs\.adp\.com$`
- Example link: `https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid={cid}&jobId={id}`
- Job feed (json-get): `https://workforcenow.adp.com/mascsr/default/careercenter/public/events/staffing/v1/job-requisitions?cid={cid}&timeStamp={ms}&lang=en_US&$top=20`
- Applying: multi-step, sign-in optional.

---

# Paylocity Recruiting (`paylocity`)

- Category: hcm-payroll. Automation: **full**. Confidence: pattern.
- Hosts: `recruiting\.paylocity\.com$`
- Example link: `https://recruiting.paylocity.com/Recruiting/Jobs/Details/{id}`
- Job feed (html): `https://recruiting.paylocity.com/recruiting/jobs/All/{companyGuid}`. Page embeds window.pageData JSON with all jobs.
- Applying: single-page, sign-in none.

---

# Paycom (`paycom`)

- Category: hcm-payroll. Automation: **fill**. Confidence: pattern.
- Hosts: `\.paycomonline\.net$`
- Example link: `https://www.paycomonline.net/v4/ats/web.php/jobs/ViewJobDetails?job={id}&clientkey={key}`
- Job feed (html): `https://www.paycomonline.net/v4/ats/web.php/jobs?clientkey={key}`
- Applying: multi-step, sign-in optional.

---

# Paycor Recruiting (`paycor`)

- Category: hcm-payroll. Automation: **fill**. Confidence: pattern.
- Hosts: `recruitingbypaycor\.com$`, `\.paycor\.com$`
- Example link: `https://recruitingbypaycor.com/career/JobIntroduction.action?clientId={c}&id={id}`
- Applying: multi-step, sign-in optional.

---

# iSolved Hire (ApplicantPro) (`isolved`)

- Category: hcm-payroll. Automation: **full**. Confidence: pattern.
- Hosts: `\.isolvedhire\.com$`, `\.applicantpro\.com$`
- Example link: `https://{company}.isolvedhire.com/jobs/{id}`
- Job feed (html): `https://{company}.isolvedhire.com/jobs/`
- Applying: single-page, sign-in none.

---

# TriNet Hire (`trinet`)

- Category: hcm-payroll. Automation: **full**. Confidence: pattern.
- Hosts: `\.trinethire\.com$`
- Example link: `https://app.trinethire.com/companies/{id}/jobs`
- Applying: single-page, sign-in none.

---

# HiBob (Bob Hiring) (`hibob`)

- Category: hcm-payroll. Automation: **full**. Confidence: pattern.
- Hosts: `\.hibob\.com$`
- Example link: `https://{company}.careers.hibob.com/jobs/{id}`
- Applying: single-page, sign-in none.

---

# Deel ATS (`deel`)

- Category: hcm-payroll. Automation: **full**. Confidence: pattern.
- Hosts: `jobs\.deel\.com$`
- Example link: `https://jobs.deel.com/{company}/{id}`
- Applying: single-page, sign-in none.

---

# Rippling Recruiting (`rippling`)

- Category: hcm-payroll. Automation: **full**. Confidence: documented.
- Hosts: `ats\.rippling\.com$`
- Example link: `https://ats.rippling.com/{company}/jobs/{uuid}`
- Job feed (json-get): `https://api.rippling.com/platform/api/ats/v1/board/{company}/jobs`. Board page also embeds __NEXT_DATA__ JSON.
- Applying: single-page, sign-in none.

---

# JazzHR (`jazzhr`)

- Category: ats-smb. Automation: **full**. Confidence: documented.
- Hosts: `\.applytojob\.com$`
- Example link: `https://{company}.applytojob.com/apply/{id}/{slug}`
- Job feed (html): `https://{company}.applytojob.com/apply`. Widget JSON: https://app.jazz.co/widgets/json/{company}? (varies)
- Applying: single-page, sign-in none.

---

# Breezy HR (`breezy`)

- Category: ats-smb. Automation: **full**. Confidence: documented.
- Hosts: `\.breezy\.hr$`
- Example link: `https://{company}.breezy.hr/p/{id}-{slug}`
- Job feed (json-get): `https://{company}.breezy.hr/json`
- Applying: single-page, sign-in none.

---

# Recruitee (Tellent) (`recruitee`)

- Category: ats-smb. Automation: **full**. Confidence: documented.
- Hosts: `\.recruitee\.com$`
- Example link: `https://{company}.recruitee.com/o/{slug}`
- Job feed (json-get): `https://{company}.recruitee.com/api/offers/`
- Applying: single-page, sign-in none.

---

# Teamtailor (`teamtailor`)

- Category: ats-smb. Automation: **full**. Confidence: documented.
- Hosts: `\.teamtailor\.com$`
- Example link: `https://{company}.teamtailor.com/jobs/{id}-{slug}`
- Job feed (html): `https://{company}.teamtailor.com/jobs`. RSS: /jobs.rss
- Applying: single-page, sign-in optional.

---

# Personio (`personio`)

- Category: ats-smb. Automation: **full**. Confidence: documented.
- Hosts: `\.jobs\.personio\.(de|com)$`
- Example link: `https://{company}.jobs.personio.de/job/{id}`
- Job feed (xml): `https://{company}.jobs.personio.de/xml?language=en`
- Applying: single-page, sign-in none.

---

# Pinpoint (`pinpoint`)

- Category: ats-smb. Automation: **full**. Confidence: documented.
- Hosts: `\.pinpointhq\.com$`
- Example link: `https://{company}.pinpointhq.com/en/postings/{uuid}`
- Job feed (json-get): `https://{company}.pinpointhq.com/postings.json`
- Applying: single-page, sign-in none.

---

# Comeet (`comeet`)

- Category: ats-mid. Automation: **full**. Confidence: pattern.
- Hosts: `\.comeet\.(co|com)$`
- Example link: `https://www.comeet.com/jobs/{company}/{uid}/{slug}/{posUid}`
- Job feed (json-get): `https://www.comeet.co/careers-api/2.0/company/{uid}/positions?token={token}`. Token is in the careers page.
- Applying: single-page, sign-in none.

---

# Dover (`dover`)

- Category: ats-smb. Automation: **full**. Confidence: pattern.
- Hosts: `app\.dover\.(io|com)$`
- Example link: `https://app.dover.com/apply/{company}/{uuid}`
- Applying: single-page, sign-in none.

---

# Gem ATS (`gem`)

- Category: ats-mid. Automation: **full**. Confidence: pattern.
- Hosts: `jobs\.gem\.com$`
- Example link: `https://jobs.gem.com/{company}/{id}`
- Applying: single-page, sign-in none.

---

# Rival (`rival`)

- Category: ats-smb. Automation: **full**. Confidence: pattern.
- Hosts: `\.rivalhr\.com$`, `jobs\.rival\.co$`
- Example link: ``
- Applying: single-page, sign-in none.

---

# Polymer (`polymer`)

- Category: ats-smb. Automation: **full**. Confidence: pattern.
- Hosts: `jobs\.polymer\.co$`
- Example link: `https://jobs.polymer.co/{company}/{id}`
- Applying: single-page, sign-in none.

---

# Kula (`kula`)

- Category: ats-smb. Automation: **full**. Confidence: pattern.
- Hosts: `\.kula\.ai$`
- Example link: ``
- Applying: single-page, sign-in none.

---

# Trakstar Hire (Recruiterbox) (`trakstar`)

- Category: ats-smb. Automation: **full**. Confidence: pattern.
- Hosts: `\.hire\.trakstar\.com$`, `\.recruiterbox\.com$`
- Example link: `https://{company}.hire.trakstar.com/jobs/{id}`
- Applying: single-page, sign-in none.

---

# Freshteam (`freshteam`)

- Category: ats-smb. Automation: **full**. Confidence: pattern.
- Hosts: `\.freshteam\.com$`
- Example link: `https://{company}.freshteam.com/jobs/{id}/{slug}`
- Applying: single-page, sign-in none.

---

# Zoho Recruit (`zoho`)

- Category: ats-smb. Automation: **full**. Confidence: pattern.
- Hosts: `\.zohorecruit\.(com|eu|in)$`
- Example link: `https://{company}.zohorecruit.com/jobs/Careers/{id}`
- Applying: single-page, sign-in optional.

---

# Manatal (`manatal`)

- Category: ats-smb. Automation: **full**. Confidence: pattern.
- Hosts: `careers-page\.com$`, `\.manatal\.com$`
- Example link: `https://www.careers-page.com/{company}/job/{id}`
- Applying: single-page, sign-in none.

---

# HireHive (`hirehive`)

- Category: ats-smb. Automation: **full**. Confidence: pattern.
- Hosts: `\.hirehive\.com$`
- Example link: `https://{company}.hirehive.com/{slug}`
- Applying: single-page, sign-in none.

---

# JobScore (`jobscore`)

- Category: ats-smb. Automation: **full**. Confidence: pattern.
- Hosts: `careers\.jobscore\.com$`
- Example link: `https://careers.jobscore.com/careers/{company}/jobs/{slug}`
- Job feed (json-get): `https://careers.jobscore.com/jobs/{company}/feed.json`
- Applying: single-page, sign-in none.

---

# HiringThing (`hiringthing`)

- Category: ats-smb. Automation: **full**. Confidence: pattern.
- Hosts: `\.hiringthing\.com$`
- Example link: ``
- Applying: single-page, sign-in none.

---

# CareerPlug (`careerplug`)

- Category: ats-smb. Automation: **full**. Confidence: pattern.
- Hosts: `\.careerplug\.com$`
- Example link: ``
- Applying: single-page, sign-in none.

---

# JOIN (`join`)

- Category: ats-smb. Automation: **full**. Confidence: pattern.
- Hosts: `join\.com$`
- Example link: `https://join.com/companies/{company}/{id}`
- Applying: single-page, sign-in none.

---

# GoHire (`gohire`)

- Category: ats-smb. Automation: **full**. Confidence: pattern.
- Hosts: `jobs\.gohire\.io$`
- Example link: ``
- Applying: single-page, sign-in none.

---

# Recooty (`recooty`)

- Category: ats-smb. Automation: **full**. Confidence: pattern.
- Hosts: `\.recooty\.com$`
- Example link: ``
- Applying: single-page, sign-in none.

---

# Hireology (`hireology`)

- Category: ats-smb. Automation: **full**. Confidence: pattern.
- Hosts: `careers\.hireology\.com$`
- Example link: ``
- Applying: single-page, sign-in none.

---

# Hirebridge (`hirebridge`)

- Category: ats-smb. Automation: **fill**. Confidence: pattern.
- Hosts: `\.hirebridge\.com$`
- Example link: ``
- Applying: multi-step, sign-in none.

---

# PageUp (`pageup`)

- Category: ats-enterprise. Automation: **fill**. Confidence: pattern.
- Hosts: `\.pageuppeople\.com$`
- Example link: `https://careers.pageuppeople.com/{id}/cw/en-us/job/{job}`
- Applying: multi-step, sign-in optional.

---

# talentReef (Mitratech) (`talentreef`)

- Category: hourly. Automation: **fill**. Confidence: pattern.
- Hosts: `\.talentreef\.com$`
- Example link: ``
- Applying: multi-step, sign-in none.

---

# Paradox (Olivia) (`paradox`)

- Category: hourly. Automation: **manual**. Confidence: pattern.
- Hosts: `\.paradox\.ai$`
- Example link: ``
- Applying: chat, sign-in none.

---

# Fountain (`fountain`)

- Category: hourly. Automation: **fill**. Confidence: pattern.
- Hosts: `\.fountain\.com$`
- Example link: ``
- Applying: multi-step, sign-in none.

---

# Harri (`harri`)

- Category: hourly. Automation: **fill**. Confidence: pattern.
- Hosts: `harri\.com$`
- Example link: ``
- Applying: multi-step, sign-in required.

---

# WeRecruit (`werecruit`)

- Category: ats-smb. Automation: **full**. Confidence: pattern.
- Hosts: `\.werecruit\.io$`
- Example link: ``
- Applying: single-page, sign-in none.

---

# Bullhorn (staffing agencies) (`bullhorn`)

- Category: staffing. Automation: **full**. Confidence: pattern.
- Hosts: `\.bullhornstaffing\.com$`, `\.bullhorn\.com$`
- Example link: ``
- Job feed (json-get): `https://public-rest{N}.bullhornstaffing.com/rest-services/{corpToken}/search/JobOrder?query=isOpen:1&fields=id,title`. corpToken from the agency's job board page.
- Applying: single-page, sign-in none.

---

# JobDiva (staffing) (`jobdiva`)

- Category: staffing. Automation: **fill**. Confidence: pattern.
- Hosts: `\.jobdiva\.com$`
- Example link: ``
- Applying: multi-step, sign-in none.

---

# CEIPAL (staffing) (`ceipal`)

- Category: staffing. Automation: **full**. Confidence: pattern.
- Hosts: `\.ceipal\.com$`
- Example link: ``
- Applying: single-page, sign-in none.

---

# HRMOS (Japan) (`hrmos`)

- Category: ats-regional. Automation: **full**. Confidence: pattern.
- Hosts: `hrmos\.co$`
- Example link: `https://hrmos.co/pages/{company}/jobs/{id}`
- Applying: single-page, sign-in none.

---

# Gupy (Brazil) (`gupy`)

- Category: ats-regional. Automation: **fill**. Confidence: pattern.
- Hosts: `\.gupy\.io$`
- Example link: `https://{company}.gupy.io/jobs/{id}`
- Job feed (json-get): `https://{company}.gupy.io/api/job?name=&offset=0&limit=100`
- Applying: multi-step, sign-in required.

---

# Company's own careers site (`custom`)

- Category: career-site. Automation: **fill**. Confidence: pattern.
- Hosts: none
- Example link: ``
- Applying: varies, sign-in none.

---

# Indeed / Indeed Apply (`indeed`)

- Category: job-board. Automation: **manual**. Confidence: pattern.
- Hosts: `(^|\.)indeed\.com$`
- Example link: `https://www.indeed.com/viewjob?jk={id}`
- Applying: indeed-apply, sign-in required. Terms forbid automation.

---

# Simplify lists (GitHub) (`simplify`)

- Category: job-board. Automation: **full**. Confidence: verified.
- Hosts: `simplify\.jobs$`, `github\.com/SimplifyJobs`
- Example link: ``
- Job feed (json-get): `https://raw.githubusercontent.com/SimplifyJobs/{repo}/dev/.github/scripts/listings.json`. repo: Summer2027-Internships, New-Grad-Positions; each URL points at the company's ATS.
- Applying: redirect, sign-in none.

---

# Wellfound (AngelList Talent) (`wellfound`)

- Category: job-board. Automation: **manual**. Confidence: pattern.
- Hosts: `(^|\.)wellfound\.com$`
- Example link: `https://wellfound.com/jobs/{id}`
- Applying: in-app, sign-in required.

---

# Y Combinator Work at a Startup (`ycombinator`)

- Category: job-board. Automation: **manual**. Confidence: pattern.
- Hosts: `workatastartup\.com$`, `ycombinator\.com$`
- Example link: `https://www.ycombinator.com/companies/{slug}/jobs/{id}`
- Applying: in-app, sign-in required.

---

# Glassdoor (`glassdoor`)

- Category: job-board. Automation: **manual**. Confidence: pattern.
- Hosts: `(^|\.)glassdoor\.com$`
- Example link: ``
- Applying: redirect, sign-in required.

---

# ZipRecruiter (`ziprecruiter`)

- Category: job-board. Automation: **manual**. Confidence: pattern.
- Hosts: `(^|\.)ziprecruiter\.com$`
- Example link: ``
- Applying: in-app, sign-in required.

---

# Dice (`dice`)

- Category: job-board. Automation: **manual**. Confidence: pattern.
- Hosts: `(^|\.)dice\.com$`
- Example link: ``
- Applying: in-app, sign-in required.

---

# Built In (`builtin`)

- Category: job-board. Automation: **full**. Confidence: pattern.
- Hosts: `(^|\.)builtin(chicago|nyc|sf|la|boston|seattle|austin|colorado)?\.(com|org)$`
- Example link: ``
- Applying: redirect, sign-in none.
- Notes: Apply buttons lead to the company's ATS.
