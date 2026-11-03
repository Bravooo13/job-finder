"""Builds platforms/registry.json: every application platform Job Finder knows.

confidence:
  verified  - used live by Job Finder v1 (feeds and/or forms)
  documented - a public, no-login endpoint or URL scheme that is widely documented
  pattern   - recognised by its host; check the feed/form on first use and update this file
automation (what the apply driver may do on its own):
  full      - one-page form, no account: fill, check, submit by your settings
  fill      - fill and stop for you (account, several pages, or heavy anti-bot)
  manual    - open it for you; you apply (terms forbid automation, or login-only flows)
"""
import json, pathlib

P = []
def add(id, name, category, hosts, example, feed, apply, automation, confidence, notes=""):
    P.append(dict(id=id, name=name, category=category, hosts=hosts, example=example, feed=feed,
                  apply=apply, automation=automation, confidence=confidence, notes=notes))

def feed(type, url=None, notes=""):
    return {"type": type, "url": url, "notes": notes}

def form(flow, signIn="none", notes=""):
    return {"flow": flow, "signIn": signIn, "notes": notes}

# ------------------------------------------------------------ enterprise ATS
add("workday", "Workday Recruiting", "ats-enterprise",
    [r"\.myworkdayjobs\.com$", r"\.myworkdaysite\.com$", r"\.myworkday\.com$"],
    "https://{tenant}.wd5.myworkdayjobs.com/{site}/job/{location}/{title}_{reqId}",
    feed("json-post", "https://{tenant}.{wdN}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs",
         'POST {"appliedFacets":{},"limit":20,"offset":0,"searchText":""}; detail: GET .../wday/cxs/{tenant}/{site}{externalPath}'),
    form("multi-step", "required", "Create account/sign in per company (email + password + email verification), then 5-7 pages: My Information, My Experience (resume parse), Application Questions, Voluntary Disclosures, Self Identify, Review. data-automation-id attributes are stable selectors."),
    "fill", "verified",
    "~46% of large employers. The owner signs in once per company in the persistent browser profile; the driver then fills page by page and stops at Review.")
add("oracle", "Oracle Recruiting Cloud (Fusion HCM)", "ats-enterprise",
    [r"\.fa\.[a-z0-9]+\.oraclecloud\.com$", r"\.oraclecloud\.com$"],
    "https://{tenant}.fa.{dc}.oraclecloud.com/hcmUI/CandidateExperience/en/sites/{siteNumber}/job/{id}",
    feed("json-get", "https://{tenant}.fa.{dc}.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations&finder=findReqs;siteNumber={siteNumber},limit=25,offset=0,keyword=\"{q}\"",
         "Public, no login. siteNumber is in the careers URL (CX_1 etc.)."),
    form("multi-step", "optional", "Email first, then a one-time code by email to continue (passwordless); then several pages."),
    "fill", "documented", "~8% of large employers. Some use a custom careers domain in front.")
add("taleo", "Oracle Taleo Enterprise", "ats-enterprise",
    [r"\.taleo\.net$"], "https://{company}.taleo.net/careersection/{section}/jobdetail.ftl?job={id}",
    feed("html", "https://{company}.taleo.net/careersection/{section}/jobsearch.ftl", "Legacy; REST rest/jobboard/searchjobs is POST JSON on some tenants."),
    form("multi-step", "required", "Account + password, many pages, frequent timeouts."), "fill", "pattern")
add("successfactors", "SAP SuccessFactors Recruiting", "ats-enterprise",
    [r"\.successfactors\.(com|eu)$", r"jobs\.sap\.com$", r"\.sapsf\.(com|eu)$"],
    "https://career{N}.successfactors.com/career?company={companyId}&career_job_req_id={id}",
    feed("html", "https://career{N}.successfactors.com/career?company={companyId}&career_ns=job_listing_summary",
         "Many companies front it with a Recruiting Marketing site (jobs.{company}.com) with sitemap.xml/RSS."),
    form("multi-step", "required", "Account per company; resume parse; questionnaire pages."), "fill", "pattern")
add("icims", "iCIMS", "ats-enterprise", [r"\.icims\.com$"],
    "https://careers-{company}.icims.com/jobs/{id}/{slug}/job",
    feed("html", "https://careers-{company}.icims.com/jobs/search?ss=1&in_iframe=1&pr={page}", "Listing in an iframe; add in_iframe=1 to get the plain page."),
    form("multi-step", "required", "Email/login step, then profile and questions in an iframe."), "fill", "pattern")
add("phenom", "Phenom People (career site)", "career-site",
    [r"\.phenompeople\.com$"], "https://jobs.{company}.com/us/en/job/{id}",
    feed("json", "https://jobs.{company}.com/widgets", "Career site in front of Workday/SuccessFactors/Taleo: apply button leads to the real ATS. Follow it."),
    form("redirect", "none", "Apply goes to the underlying ATS."), "full", "pattern", "Detect by the page's phApp/phenom scripts; then route by the apply link.")
add("eightfold", "Eightfold AI (career site)", "career-site", [r"\.eightfold\.ai$"],
    "https://{company}.eightfold.ai/careers?pid={id}",
    feed("json-get", "https://{company}.eightfold.ai/api/apply/v2/jobs?domain={domain}&start=0&num=10&query={q}", "Some tenants use /api/pcsx/search instead."),
    form("single-page", "optional", "Its own apply form or hands off to Workday etc."), "fill", "pattern")
add("avature", "Avature", "career-site", [r"\.avature\.net$"], "https://{company}.avature.net/careers/JobDetail/{slug}/{id}",
    feed("html", "https://{company}.avature.net/careers/SearchJobs", "RSS at /careers/SearchJobs/feed on many tenants."),
    form("multi-step", "optional"), "fill", "pattern")
add("cornerstone", "Cornerstone OnDemand (CSOD)", "ats-enterprise", [r"\.csod\.com$"],
    "https://{company}.csod.com/ux/ats/careersite/{site}/home/requisition/{id}",
    feed("json", "https://{company}.csod.com/services/x/career-site/v1/search", "Needs a token from the page; read the page instead."),
    form("multi-step", "required"), "fill", "pattern")
add("brassring", "Infinite BrassRing (formerly IBM Kenexa)", "ats-enterprise", [r"\.brassring\.com$"],
    "https://sjobs.brassring.com/TGnewUI/Search/Home/Home?partnerid={p}&siteid={s}#jobDetails={id}",
    feed("json-post", "https://sjobs.brassring.com/TgNewUI/Search/Ajax/MatchedJobs", "Session cookies from the search page."),
    form("multi-step", "required"), "fill", "pattern")
add("ukg", "UKG Pro Recruiting (UltiPro)", "hcm-payroll", [r"recruiting\.ultipro\.com$", r"recruiting2\.ultipro\.com$"],
    "https://recruiting.ultipro.com/{TENANT}/JobBoard/{boardGuid}/OpportunityDetail?opportunityId={id}",
    feed("json-post", "https://recruiting.ultipro.com/{TENANT}/JobBoard/{boardGuid}/JobBoardView/LoadSearchResults", '{"opportunitySearch":{"Top":50,"Skip":0,"QueryString":""}}'),
    form("multi-step", "optional"), "fill", "pattern")
add("dayforce", "Dayforce (Ceridian)", "hcm-payroll", [r"jobs\.dayforcehcm\.com$", r"\.dayforcehcm\.com$"],
    "https://jobs.dayforcehcm.com/en-US/{company}/CANDIDATEPORTAL/jobs/{id}",
    feed("html", "https://jobs.dayforcehcm.com/en-US/{company}/CANDIDATEPORTAL"), form("multi-step", "required"), "fill", "pattern")
add("adp", "ADP Workforce Now / ADP Recruiting", "hcm-payroll", [r"workforcenow\.adp\.com$", r"recruiting\.adp\.com$", r"myjobs\.adp\.com$"],
    "https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid={cid}&jobId={id}",
    feed("json-get", "https://workforcenow.adp.com/mascsr/default/careercenter/public/events/staffing/v1/job-requisitions?cid={cid}&timeStamp={ms}&lang=en_US&$top=20"),
    form("multi-step", "optional"), "fill", "pattern")
add("paylocity", "Paylocity Recruiting", "hcm-payroll", [r"recruiting\.paylocity\.com$"],
    "https://recruiting.paylocity.com/Recruiting/Jobs/Details/{id}",
    feed("html", "https://recruiting.paylocity.com/recruiting/jobs/All/{companyGuid}", "Page embeds window.pageData JSON with all jobs."),
    form("single-page", "none"), "full", "pattern")
add("paycom", "Paycom", "hcm-payroll", [r"\.paycomonline\.net$"], "https://www.paycomonline.net/v4/ats/web.php/jobs/ViewJobDetails?job={id}&clientkey={key}",
    feed("html", "https://www.paycomonline.net/v4/ats/web.php/jobs?clientkey={key}"), form("multi-step", "optional"), "fill", "pattern")
add("paycor", "Paycor Recruiting", "hcm-payroll", [r"recruitingbypaycor\.com$", r"\.paycor\.com$"], "https://recruitingbypaycor.com/career/JobIntroduction.action?clientId={c}&id={id}",
    feed("html"), form("multi-step", "optional"), "fill", "pattern")
add("isolved", "iSolved Hire (ApplicantPro)", "hcm-payroll", [r"\.isolvedhire\.com$", r"\.applicantpro\.com$"], "https://{company}.isolvedhire.com/jobs/{id}",
    feed("html", "https://{company}.isolvedhire.com/jobs/"), form("single-page", "none"), "full", "pattern")
add("trinet", "TriNet Hire", "hcm-payroll", [r"\.trinethire\.com$"], "https://app.trinethire.com/companies/{id}/jobs", feed("html"), form("single-page"), "full", "pattern")
add("hibob", "HiBob (Bob Hiring)", "hcm-payroll", [r"\.hibob\.com$"], "https://{company}.careers.hibob.com/jobs/{id}", feed("html"), form("single-page"), "full", "pattern")
add("deel", "Deel ATS", "hcm-payroll", [r"jobs\.deel\.com$"], "https://jobs.deel.com/{company}/{id}", feed("html"), form("single-page"), "full", "pattern")
add("rippling", "Rippling Recruiting", "hcm-payroll", [r"ats\.rippling\.com$"],
    "https://ats.rippling.com/{company}/jobs/{uuid}",
    feed("json-get", "https://api.rippling.com/platform/api/ats/v1/board/{company}/jobs", "Board page also embeds __NEXT_DATA__ JSON."),
    form("single-page", "none"), "full", "documented")

# ------------------------------------------------------------ mid-market / tech ATS
add("greenhouse", "Greenhouse", "ats-mid",
    [r"(^|\.)greenhouse\.io$", r"boards\.greenhouse\.io$", r"job-boards(\.eu)?\.greenhouse\.io$"],
    "https://job-boards.greenhouse.io/{token}/jobs/{id}  (also company sites with ?gh_jid={id})",
    feed("json-get", "https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true", "Questions per job: /v1/boards/{token}/jobs/{id}?questions=true"),
    form("single-page", "none", "Form at https://job-boards.greenhouse.io/embed/job_app?for={token}&token={id}. React Select dropdowns (type with real key presses), education rows school--N/degree--N/discipline--N, MyGreenhouse autofill rebuilds them, invisible reCAPTCHA, sometimes an emailed 8-character security code after Submit."),
    "full", "verified", "~24% of large employers; most startups and tech companies.")
add("lever", "Lever", "ats-mid", [r"jobs(\.eu)?\.lever\.co$"],
    "https://jobs.lever.co/{token}/{uuid}",
    feed("json-get", "https://api.lever.co/v0/postings/{token}?mode=json", "EU: api.eu.lever.co"),
    form("single-page", "none", "Apply page: https://jobs.lever.co/{token}/{uuid}/apply. Plain inputs, cards[...] custom questions, hCaptcha on some."),
    "full", "verified")
add("ashby", "Ashby", "ats-mid", [r"jobs\.ashbyhq\.com$"],
    "https://jobs.ashbyhq.com/{token}/{uuid}",
    feed("json-get", "https://api.ashbyhq.com/posting-api/job-board/{token}?includeCompensation=true"),
    form("single-page", "none", "https://jobs.ashbyhq.com/{token}/{uuid}/application. Yes/No are buttons, file upload with resume parse, custom location combobox."),
    "full", "verified")
add("smartrecruiters", "SmartRecruiters", "ats-mid", [r"(jobs|careers)\.smartrecruiters\.com$"],
    "https://jobs.smartrecruiters.com/{Company}/{id}",
    feed("json-get", "https://api.smartrecruiters.com/v1/companies/{Company}/postings?limit=100&offset=0", "Detail: /v1/companies/{Company}/postings/{id}"),
    form("multi-step", "none", "One-click apply app (oneclick-ui), 2-3 steps, resume parse; optional sign-in."),
    "fill", "verified")
add("jobvite", "Jobvite", "ats-mid", [r"jobs\.jobvite\.com$", r"\.jobvite\.com$"],
    "https://jobs.jobvite.com/{company}/job/{id}",
    feed("html", "https://jobs.jobvite.com/{company}/jobs", "XML feed for customers: https://app.jobvite.com/CompanyJobs/Xml.aspx?c={companyId}"),
    form("single-page", "none"), "full", "pattern")
add("workable", "Workable", "ats-mid", [r"apply\.workable\.com$", r"\.workable\.com$"],
    "https://apply.workable.com/{account}/j/{shortcode}/",
    feed("json-post", "https://apply.workable.com/api/v3/accounts/{account}/jobs", '{"query":"","location":[],"department":[],"worktype":[],"remote":[]}; detail /api/v2/accounts/{account}/jobs/{shortcode}'),
    form("single-page", "none", "/apply page; may show a reCAPTCHA."), "full", "documented")
add("bamboohr", "BambooHR", "ats-smb", [r"\.bamboohr\.com$"],
    "https://{company}.bamboohr.com/careers/{id}",
    feed("json-get", "https://{company}.bamboohr.com/careers/list", "Detail: /careers/{id}/detail"),
    form("single-page", "none"), "full", "documented")
add("jazzhr", "JazzHR", "ats-smb", [r"\.applytojob\.com$"],
    "https://{company}.applytojob.com/apply/{id}/{slug}",
    feed("html", "https://{company}.applytojob.com/apply", "Widget JSON: https://app.jazz.co/widgets/json/{company}? (varies)"),
    form("single-page", "none"), "full", "documented")
add("breezy", "Breezy HR", "ats-smb", [r"\.breezy\.hr$"],
    "https://{company}.breezy.hr/p/{id}-{slug}",
    feed("json-get", "https://{company}.breezy.hr/json"), form("single-page", "none"), "full", "documented")
add("recruitee", "Recruitee (Tellent)", "ats-smb", [r"\.recruitee\.com$"],
    "https://{company}.recruitee.com/o/{slug}",
    feed("json-get", "https://{company}.recruitee.com/api/offers/"), form("single-page", "none"), "full", "documented")
add("teamtailor", "Teamtailor", "ats-smb", [r"\.teamtailor\.com$"],
    "https://{company}.teamtailor.com/jobs/{id}-{slug}",
    feed("html", "https://{company}.teamtailor.com/jobs", "RSS: /jobs.rss"), form("single-page", "optional"), "full", "documented")
add("personio", "Personio", "ats-smb", [r"\.jobs\.personio\.(de|com)$"],
    "https://{company}.jobs.personio.de/job/{id}",
    feed("xml", "https://{company}.jobs.personio.de/xml?language=en"), form("single-page", "none"), "full", "documented")
add("pinpoint", "Pinpoint", "ats-smb", [r"\.pinpointhq\.com$"],
    "https://{company}.pinpointhq.com/en/postings/{uuid}",
    feed("json-get", "https://{company}.pinpointhq.com/postings.json"), form("single-page", "none"), "full", "documented")
add("comeet", "Comeet", "ats-mid", [r"\.comeet\.(co|com)$"], "https://www.comeet.com/jobs/{company}/{uid}/{slug}/{posUid}",
    feed("json-get", "https://www.comeet.co/careers-api/2.0/company/{uid}/positions?token={token}", "Token is in the careers page."), form("single-page"), "full", "pattern")
add("dover", "Dover", "ats-smb", [r"app\.dover\.(io|com)$"], "https://app.dover.com/apply/{company}/{uuid}", feed("html"), form("single-page"), "full", "pattern")
add("gem", "Gem ATS", "ats-mid", [r"jobs\.gem\.com$"], "https://jobs.gem.com/{company}/{id}", feed("html"), form("single-page"), "full", "pattern")
add("rival", "Rival", "ats-smb", [r"\.rivalhr\.com$", r"jobs\.rival\.co$"], "", feed("html"), form("single-page"), "full", "pattern")
add("polymer", "Polymer", "ats-smb", [r"jobs\.polymer\.co$"], "https://jobs.polymer.co/{company}/{id}", feed("html"), form("single-page"), "full", "pattern")
add("kula", "Kula", "ats-smb", [r"\.kula\.ai$"], "", feed("html"), form("single-page"), "full", "pattern")
add("trakstar", "Trakstar Hire (Recruiterbox)", "ats-smb", [r"\.hire\.trakstar\.com$", r"\.recruiterbox\.com$"], "https://{company}.hire.trakstar.com/jobs/{id}", feed("html"), form("single-page"), "full", "pattern")
add("freshteam", "Freshteam", "ats-smb", [r"\.freshteam\.com$"], "https://{company}.freshteam.com/jobs/{id}/{slug}", feed("html"), form("single-page"), "full", "pattern")
add("zoho", "Zoho Recruit", "ats-smb", [r"\.zohorecruit\.(com|eu|in)$"], "https://{company}.zohorecruit.com/jobs/Careers/{id}", feed("html"), form("single-page", "optional"), "full", "pattern")
add("manatal", "Manatal", "ats-smb", [r"careers-page\.com$", r"\.manatal\.com$"], "https://www.careers-page.com/{company}/job/{id}", feed("html"), form("single-page"), "full", "pattern")
add("hirehive", "HireHive", "ats-smb", [r"\.hirehive\.com$"], "https://{company}.hirehive.com/{slug}", feed("html"), form("single-page"), "full", "pattern")
add("jobscore", "JobScore", "ats-smb", [r"careers\.jobscore\.com$"], "https://careers.jobscore.com/careers/{company}/jobs/{slug}", feed("json-get", "https://careers.jobscore.com/jobs/{company}/feed.json"), form("single-page"), "full", "pattern")
add("hiringthing", "HiringThing", "ats-smb", [r"\.hiringthing\.com$"], "", feed("html"), form("single-page"), "full", "pattern")
add("careerplug", "CareerPlug", "ats-smb", [r"\.careerplug\.com$"], "", feed("html"), form("single-page"), "full", "pattern")
add("join", "JOIN", "ats-smb", [r"join\.com$"], "https://join.com/companies/{company}/{id}", feed("html"), form("single-page"), "full", "pattern")
add("gohire", "GoHire", "ats-smb", [r"jobs\.gohire\.io$"], "", feed("html"), form("single-page"), "full", "pattern")
add("recooty", "Recooty", "ats-smb", [r"\.recooty\.com$"], "", feed("html"), form("single-page"), "full", "pattern")
add("hireology", "Hireology", "ats-smb", [r"careers\.hireology\.com$"], "", feed("html"), form("single-page"), "full", "pattern")
add("hirebridge", "Hirebridge", "ats-smb", [r"\.hirebridge\.com$"], "", feed("html"), form("multi-step"), "fill", "pattern")
add("pageup", "PageUp", "ats-enterprise", [r"\.pageuppeople\.com$"], "https://careers.pageuppeople.com/{id}/cw/en-us/job/{job}", feed("html", "", "RSS: /{id}/cw/en-us/rss"), form("multi-step", "optional"), "fill", "pattern")
add("talentreef", "talentReef (Mitratech)", "hourly", [r"\.talentreef\.com$"], "", feed("html"), form("multi-step"), "fill", "pattern")
add("paradox", "Paradox (Olivia)", "hourly", [r"\.paradox\.ai$"], "", feed("none", None, "Conversational chat apply."), form("chat", "none"), "manual", "pattern")
add("fountain", "Fountain", "hourly", [r"\.fountain\.com$"], "", feed("html"), form("multi-step"), "fill", "pattern")
add("harri", "Harri", "hourly", [r"harri\.com$"], "", feed("html"), form("multi-step", "required"), "fill", "pattern")
add("werecruit", "WeRecruit", "ats-smb", [r"\.werecruit\.io$"], "", feed("html"), form("single-page"), "full", "pattern")
add("bullhorn", "Bullhorn (staffing agencies)", "staffing", [r"\.bullhornstaffing\.com$", r"\.bullhorn\.com$"], "", feed("json-get", "https://public-rest{N}.bullhornstaffing.com/rest-services/{corpToken}/search/JobOrder?query=isOpen:1&fields=id,title", "corpToken from the agency's job board page."), form("single-page"), "full", "pattern")
add("jobdiva", "JobDiva (staffing)", "staffing", [r"\.jobdiva\.com$"], "", feed("html"), form("multi-step"), "fill", "pattern")
add("ceipal", "CEIPAL (staffing)", "staffing", [r"\.ceipal\.com$"], "", feed("html"), form("single-page"), "full", "pattern")
add("hrmos", "HRMOS (Japan)", "ats-regional", [r"hrmos\.co$"], "https://hrmos.co/pages/{company}/jobs/{id}", feed("html"), form("single-page"), "full", "pattern")
add("gupy", "Gupy (Brazil)", "ats-regional", [r"\.gupy\.io$"], "https://{company}.gupy.io/jobs/{id}", feed("json-get", "https://{company}.gupy.io/api/job?name=&offset=0&limit=100"), form("multi-step", "required"), "fill", "pattern")
add("custom", "Company's own careers site", "career-site", [], "", feed("html", None, "Read schema.org JobPosting JSON-LD; follow 'Apply' to the real ATS."), form("varies"), "fill", "pattern")

# ------------------------------------------------------------ job boards (sources, not forms)
add("linkedin", "LinkedIn Jobs / Easy Apply", "job-board", [r"(^|\.)linkedin\.com$"],
    "https://www.linkedin.com/jobs/view/{id}/",
    feed("html", "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords={q}&location={place}&f_TPR=r604800&start=0",
         "Guest pages, one request every 1.3-2.3 s, stop on 429/999. Detail: /jobs-guest/jobs/api/jobPosting/{id}"),
    form("easy-apply", "required", "LinkedIn's terms forbid automated applying. Use the company's own apply link when there is one."),
    "manual", "verified")
add("indeed", "Indeed / Indeed Apply", "job-board", [r"(^|\.)indeed\.com$"], "https://www.indeed.com/viewjob?jk={id}",
    feed("html", None, "Heavy anti-bot; read only pages the owner opens."), form("indeed-apply", "required", "Terms forbid automation."), "manual", "pattern")
add("handshake", "Handshake", "job-board", [r"\.joinhandshake\.com$"], "https://{school}.joinhandshake.com/jobs/{id}",
    feed("html", None, "Signed in as the student; read cards one at a time."), form("in-app", "required"), "manual", "verified")
add("simplify", "Simplify lists (GitHub)", "job-board", [r"simplify\.jobs$", r"github\.com/SimplifyJobs"], "",
    feed("json-get", "https://raw.githubusercontent.com/SimplifyJobs/{repo}/dev/.github/scripts/listings.json", "repo: Summer2027-Internships, New-Grad-Positions; each URL points at the company's ATS."),
    form("redirect"), "full", "verified")
add("wellfound", "Wellfound (AngelList Talent)", "job-board", [r"(^|\.)wellfound\.com$"], "https://wellfound.com/jobs/{id}", feed("html"), form("in-app", "required"), "manual", "pattern")
add("ycombinator", "Y Combinator Work at a Startup", "job-board", [r"workatastartup\.com$", r"ycombinator\.com$"], "https://www.ycombinator.com/companies/{slug}/jobs/{id}", feed("html"), form("in-app", "required"), "manual", "pattern")
add("glassdoor", "Glassdoor", "job-board", [r"(^|\.)glassdoor\.com$"], "", feed("none"), form("redirect", "required"), "manual", "pattern")
add("ziprecruiter", "ZipRecruiter", "job-board", [r"(^|\.)ziprecruiter\.com$"], "", feed("none"), form("in-app", "required"), "manual", "pattern")
add("dice", "Dice", "job-board", [r"(^|\.)dice\.com$"], "", feed("html"), form("in-app", "required"), "manual", "pattern")
add("builtin", "Built In", "job-board", [r"(^|\.)builtin(chicago|nyc|sf|la|boston|seattle|austin|colorado)?\.(com|org)$"], "", feed("html"), form("redirect"), "full", "pattern", "Apply buttons lead to the company's ATS.")

out = {"version": 1, "count": len(P), "doc": __doc__.strip(), "platforms": P}
path = pathlib.Path(__file__).resolve().parents[1] / "platforms" / "registry.json"
path.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
print(f"wrote {len(P)} platforms to {path}")
