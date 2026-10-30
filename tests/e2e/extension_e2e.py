# End-to-end test of the grab API, the extension's LinkedIn grabber (on a mock
# LinkedIn page) and its application filler (on a mock Greenhouse form).
#
# It WRITES to the database (jobs, My answers), so run it against a scratch
# copy, never your real data:
#   cp data/job-finder.db /tmp/jf-test.db
#   DATABASE_URL=file:/tmp/jf-test.db npx next dev --turbopack -H 127.0.0.1 -p 3740
#   JOB_FINDER_URL=http://127.0.0.1:3740 python3 tests/e2e/extension_e2e.py
# Needs Python Playwright with Chromium. A resume must exist and compile
# (Tectonic installed) for the resume-upload check.
import asyncio, json, os, sys, tempfile, urllib.request
from pathlib import Path
from playwright.async_api import async_playwright

BASE = os.environ.get("JOB_FINDER_URL", "http://127.0.0.1:3740").rstrip("/")
EXT = str(Path(__file__).resolve().parents[2] / "extension")
S = tempfile.mkdtemp(prefix="jf-e2e-")
os.makedirs(f"{S}/shots4", exist_ok=True)
fails = []
def check(cond, msg):
    print(("ok   " if cond else "FAIL ") + msg)
    if not cond: fails.append(msg)

def api(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"origin": BASE, **({"content-type": "application/json"} if body is not None else {})})  # as the owner's browser
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")

# ---------------------------------------------------------------- grab API
jobs = [
    {"url": "https://www.linkedin.com/jobs/view/4100000001/", "title": "Data Science Intern (Summer 2027)", "company": "Northern Trust",
     "location": "Chicago, IL", "postedAt": "3 days ago", "industry": "Financial Services",
     "description": "Join our analytics team. Python, SQL. Northern Trust will not sponsor applicants for U.S. work visa status.",
     "applyUrl": "https://boards.greenhouse.io/e2etestco/jobs/555"},
    {"url": "https://app.joinhandshake.com/jobs/11175450", "title": "Quantitative Research Intern", "company": "E2E Capital",
     "location": "Remote", "workplace": "Remote", "workAuth": "US work authorization not required", "postedAt": "yesterday",
     "description": "Statistics and Python for trading research."},
]
st, r = api("POST", "/api/grab", {"source": "linkedin", "pageUrl": "https://www.linkedin.com/jobs/search/", "by": "agent", "jobs": jobs[:1]})
check(st == 200 and r["added"] == 1, f"grab adds a LinkedIn job ({st} {r and {k: r[k] for k in ('received','added','duplicates')} })")
st, r2 = api("POST", "/api/grab", {"source": "handshake", "by": "agent", "jobs": jobs[1:]})
check(st == 200 and r2["added"] == 1, "grab adds a Handshake job")
st, r3 = api("POST", "/api/grab", {"source": "linkedin", "by": "agent", "jobs": jobs[:1]})
check(st == 200 and r3["added"] == 0, f"re-sending is not a new job ({r3})")
st, found = api("GET", "/api/found?q=E2E%20Capital&status=all")
j = found["jobs"][0] if found and found.get("jobs") else {}
check(j.get("visa") == "opt_cpt" and j.get("industry"), f"Handshake work-auth line → opt_cpt ({j.get('visa')}, {j.get('industry')})")
check("Work authorization" in (api("GET", f"/api/found/{j.get('id')}")[1].get("description") or ""), "work-auth line kept in the description")
st, found = api("GET", "/api/found?q=Northern%20Trust&status=all&source=linkedin")
nt = found["jobs"][0] if found and found.get("jobs") else {}
check(nt.get("visa") == "no_sponsorship" and "will not sponsor" in (nt.get("visaNote") or ""), f"no-sponsorship note ({nt.get('visaNote')})")
st, found = api("GET", "/api/found?visa=friendly&status=all&q=E2E")
check(any(x["company"] == "E2E Capital" for x in found["jobs"]), "visa=friendly filter includes the OPT/CPT job")
st, bad = api("POST", "/api/grab", {"source": "linkedin", "jobs": [{"title": "x"}]})
check(st == 400, f"invalid grab is rejected ({st})")

# page grab with JSON-LD
html = """<html><head><script type="application/ld+json">{"@type":"JobPosting","title":"Economics Analyst Intern","url":"https://e2e-co.example/jobs/9",
"hiringOrganization":{"name":"E2E Consulting"},"jobLocation":{"address":{"addressLocality":"Chicago","addressRegion":"IL","addressCountry":"US"}},
"description":"Economic consulting internship. Open to students on CPT or OPT."}</script></head><body>Careers</body></html>"""
st, pg = api("POST", "/api/grab/page", {"url": "https://e2e-co.example/careers", "html": html, "useAi": False, "by": "agent"})
check(st == 200 and pg["added"] == 1, f"careers page JSON-LD → 1 job ({st} {pg and pg.get('added')})")

# middleware: cross-site browser request is blocked, other hosts too
req = urllib.request.Request(BASE + "/api/found", headers={"origin": "https://evil.example", "sec-fetch-site": "cross-site"})
try:
    urllib.request.urlopen(req, timeout=30); code = 200
except urllib.error.HTTPError as e:
    code = e.code
check(code == 403, f"cross-site API request blocked ({code})")
req = urllib.request.Request(BASE + "/api/found", headers={"host": "evil.example"})
try:
    urllib.request.urlopen(req, timeout=30); code = 200
except urllib.error.HTTPError as e:
    code = e.code
check(code in (400, 403), f"other Host blocked ({code})")

# ------------------------------------------------- profile for the form test
st, prof = api("GET", "/api/apply/profile")
prof = prof.get("profile", prof)
prof.update({"authorizedToWork": "yes", "needsSponsorshipNow": "no", "needsSponsorshipLater": "yes", "visaStatus": "F-1 student (CPT/OPT)",
             "usCitizen": "no", "permanentResident": "no"})
st, saved = api("PUT", "/api/apply/profile", prof)
check(st == 200, f"profile saved ({st})")

FORM = """<!doctype html><html><head><title>Job Application for Data Analyst Intern at E2E Test Co</title></head><body>
<h1>Data Analyst Intern</h1>
<form id="application" onsubmit="window.submitted=true; return false;">
<label for="first_name">First Name *</label><input id="first_name" name="first_name" required>
<label for="last_name">Last Name *</label><input id="last_name" name="last_name" required>
<label for="email">Email *</label><input id="email" type="email" required>
<label for="phone">Phone</label><input id="phone" type="tel">
<label for="resume">Resume/CV</label><input id="resume" type="file" accept=".pdf">
<label for="li">LinkedIn Profile</label><input id="li">
<label for="auth">Are you legally authorized to work in the United States? *</label>
<select id="auth" required><option value="">Select...</option><option>Yes</option><option>No</option></select>
<fieldset><legend>Will you now or in the future require sponsorship for employment visa status (e.g., H-1B visa status)? *</legend>
<label><input type="radio" name="spons" value="1"> Yes</label><label><input type="radio" name="spons" value="0"> No</label></fieldset>
<label for="why">Why do you want to work at E2E Test Co?</label><textarea id="why"></textarea>
<label for="gender">Gender</label><select id="gender"><option value="">Select...</option><option>Male</option><option>Female</option><option>Decline To Self Identify</option></select>
<label><input type="checkbox" id="consent" required> I certify that the information provided is true.</label>
<button type="submit" id="submit">Submit application</button>
</form></body></html>"""

LI_SEARCH = """<!doctype html><html><body><main><div componentkey="SearchResultsMainContent" style="height:300px;overflow:auto">
<div componentkey="job-card-component-ref-4199999991"><a href="/jobs/view/4199999991/">Data Analyst Intern</a><div>Acme Analytics</div><div>Chicago, IL (Hybrid)</div><div>2 days ago</div></div>
<div componentkey="job-card-component-ref-4199999992"><a href="/jobs/view/4199999992/">Quant Research Intern</a><div>Beta Trading</div><div>New York, NY</div></div>
</div></main></body></html>"""
def li_detail(title, company):
    return f"""<section><h2 class="top-card-layout__title">{title}</h2><a class="topcard__org-name-link">{company}</a>
<span class="topcard__flavor--bullet">Chicago, IL</span><span class="posted-time-ago__text">2 days ago</span>
<a data-tracking-control-name="public_jobs_apply-link-offsite_sign-up-modal" href="https://www.linkedin.com/jobs/view/externalApply/1?url=https%3A%2F%2Fjobs.lever.co%2Fe2eacme%2Fabc-123&urlHash=x">Apply</a>
<div class="show-more-less-html__markup"><p>We are open to candidates requiring visa sponsorship.</p><ul><li>SQL</li><li>Python</li></ul></div>
<ul><li class="description__job-criteria-item"><h3>Employment type</h3><span>Internship</span></li>
<li class="description__job-criteria-item"><h3>Industries</h3><span>Financial Services</span></li></ul></section>"""

async def main():
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(f"{S}/chrome-profile-e2e4", headless=True, channel="chromium",
            args=[f"--disable-extensions-except={EXT}", f"--load-extension={EXT}"])
        sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event("serviceworker", timeout=20000)
        await sw.evaluate(f"chrome.storage.local.set({{ baseUrl: '{BASE}' }})")

        async def route_li(route):
            url = route.request.url
            if "/jobs-guest/jobs/api/jobPosting/4199999991" in url:
                return await route.fulfill(status=200, content_type="text/html", body=li_detail("Data Analyst Intern", "Acme Analytics"))
            if "/jobs-guest/jobs/api/jobPosting/4199999992" in url:
                return await route.fulfill(status=200, content_type="text/html", body=li_detail("Quant Research Intern", "Beta Trading"))
            if "/jobs/search" in url:
                return await route.fulfill(status=200, content_type="text/html", body=LI_SEARCH)
            return await route.fulfill(status=404, body="")
        await ctx.route("https://www.linkedin.com/**", route_li)
        await ctx.route("https://boards.greenhouse.io/**", lambda r: r.fulfill(status=200, content_type="text/html", body=FORM))

        page = await ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        # LinkedIn grab
        await page.goto("https://www.linkedin.com/jobs/search/?keywords=data")
        await page.wait_for_selector("#job-finder-helper", state="attached", timeout=15000)
        await page.evaluate("window.postMessage({ jobFinder: 'grab', options: { pages: 1 } }, '*')")
        status = None
        for _ in range(120):
            await page.wait_for_timeout(500)
            raw = await page.evaluate("document.documentElement.dataset.jobFinderStatus || ''")
            status = json.loads(raw) if raw else None
            if status and status.get("state") in ("done", "error") and status.get("action") == "grab": break
        check(status and status.get("state") == "done" and status["result"]["added"] == 2, f"LinkedIn grab via extension: {status and status.get('message')}")
        st, f = api("GET", "/api/found?q=Acme%20Analytics&status=all")
        a = f["jobs"][0] if f.get("jobs") else {}
        check(a.get("visa") == "sponsors" and a.get("applyUrl") == "https://jobs.lever.co/e2eacme/abc-123" and a.get("jobType") == "internship",
              f"LinkedIn details: visa={a.get('visa')} applyUrl={a.get('applyUrl')} type={a.get('jobType')} sourceIndustry={a.get('sourceIndustry')}")

        # Application form
        await page.goto("https://boards.greenhouse.io/e2etestco/jobs/555")
        await page.wait_for_selector("#job-finder-helper", state="attached", timeout=15000)
        await page.evaluate("window.postMessage({ jobFinder: 'fill' }, '*')")
        for _ in range(240):
            await page.wait_for_timeout(500)
            raw = await page.evaluate("document.documentElement.dataset.jobFinderStatus || ''")
            status = json.loads(raw) if raw else None
            if status and status.get("action") == "fill" and status.get("state") in ("done", "error"): break
        print("   fill:", status and status.get("message"))
        check(status and status.get("state") == "done", "fill finished")
        v = await page.evaluate("""() => ({
            first: document.querySelector('#first_name').value, last: document.querySelector('#last_name').value,
            email: document.querySelector('#email').value, auth: document.querySelector('#auth').value,
            spons: [...document.querySelectorAll('input[name=spons]')].find(r => r.checked)?.parentElement.textContent.trim(),
            gender: document.querySelector('#gender').value, consent: document.querySelector('#consent').checked,
            files: document.querySelector('#resume').files.length, fileName: document.querySelector('#resume').files[0]?.name,
            why: document.querySelector('#why').value, submitted: Boolean(window.submitted),
            outline: getComputedStyle(document.querySelector('#auth')).outlineColor })""")
        print("   form:", {k: v[k] for k in ("auth", "spons", "gender", "consent", "files", "submitted")})
        check(bool(v["first"]) and bool(v["email"]), "contact filled from the profile")
        check(v["auth"] == "Yes", "authorized to work → Yes")
        check(v["spons"] == "Yes", "now-or-future sponsorship → Yes")
        check(v["gender"] == "Decline To Self Identify", "EEO declines")
        check(not v["consent"], "consent left for the owner")
        check(v["files"] == 1 and v["fileName"].endswith(".pdf"), f"resume attached ({v['fileName']})")
        check(not v["submitted"], "never submits")
        await page.screenshot(path=f"{S}/shots4/e2e-form.png", full_page=True)
        check(not errors, f"no page errors {errors[:3]}")
        await ctx.close()

asyncio.run(main())
print("\n" + ("ALL PASSED" if not fails else f"{len(fails)} FAILED: {fails}"))
sys.exit(1 if fails else 0)
