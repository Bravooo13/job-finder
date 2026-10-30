# End-to-end test of Auto apply: Job Finder's queue + the extension's worker on a
# mock Greenhouse form built with the real React Select library.
#
# It WRITES to the database, so run it against a scratch database, never your real data.
# A mock Claude API (started here on port 3799) writes the cover letter, so start the app with:
#   DATABASE_URL=file:/tmp/jf-auto.db ANTHROPIC_BASE_URL=http://127.0.0.1:3799 ANTHROPIC_API_KEY=test \
#     npx next dev --turbopack -H 127.0.0.1 -p 3741
#   JOB_FINDER_URL=http://127.0.0.1:3741 FIXTURE_DIR=/path/to/built/fixture RESUME_PDF=/path/to/a.pdf \
#     python3 tests/e2e/auto_apply_e2e.py
# FIXTURE_DIR holds form.html and app.js: build them with tests/e2e/fixtures/build.sh /tmp/jf-fixture.
# RESUME_PDF is any small PDF. Needs Python Playwright with Chromium and openssl.
import asyncio, json, os, ssl, subprocess, sys, tempfile, threading, time, urllib.request, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.async_api import async_playwright

BASE = os.environ.get("JOB_FINDER_URL", "http://127.0.0.1:3741").rstrip("/")
EXT = str(Path(__file__).resolve().parents[2] / "extension")
FIX = Path(os.environ["FIXTURE_DIR"])
RESUME = Path(os.environ["RESUME_PDF"])
S = tempfile.mkdtemp(prefix="jf-auto-")
fails = []
def check(cond, msg):
    print(("ok   " if cond else "FAIL ") + msg)
    if not cond: fails.append(msg)

def api(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"content-type": "application/json"} if body is not None else {})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")

def upload(path, name, data):
    b = uuid.uuid4().hex
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\nContent-Type: application/pdf\r\n\r\n").encode() + data + f"\r\n--{b}--\r\n".encode()
    req = urllib.request.Request(BASE + path, method="POST", data=body, headers={"content-type": f"multipart/form-data; boundary={b}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status, json.loads(r.read())

# ------------------------------------------------------------------ setup
st, _ = api("PUT", "/api/apply/profile", {
    "firstName": "Alex", "lastName": "Doe", "email": "alex@example.edu", "phone": "(555) 010-0100", "city": "Chicago", "state": "Illinois",
    "country": "United States", "school": "University of Chicago", "degree": "M.S.", "major": "Applied Data Science", "gpa": "3.43",
    "graduation": "2028-05", "authorizedToWork": "yes", "needsSponsorshipNow": "no", "needsSponsorshipLater": "yes",
    "visaStatus": "F-1 student (CPT/OPT)", "usCitizen": "no", "permanentResident": "no", "usPerson": "no", "over18": "yes"})
check(st == 200, f"profile saved ({st})")
st, rf = upload("/api/apply/resume-file", "Alex-Doe-Resume.pdf", RESUME.read_bytes())
check(st == 200 and rf["file"]["name"] == "Alex-Doe-Resume.pdf", f"resume PDF uploaded ({st})")
st, _ = api("PUT", "/api/apply/auto/settings", {"submit": "sure", "consent": False, "pauseSeconds": 5, "keepTabs": True})
check(st == 200, "auto settings saved")
st, g = api("POST", "/api/grab", {"source": "web", "by": "agent", "jobs": [
    {"url": "https://job-boards.greenhouse.io/e2eco/jobs/777", "title": "Data Analyst Intern", "company": "E2E Co", "location": "Chicago, IL"},
    {"url": "https://job-boards.greenhouse.io/e2eco/jobs/779", "title": "Data Science Intern", "company": "E2E Co", "location": "Chicago, IL",
     "description": "Build data pipelines and models for our analytics team. Python and SQL. Summer 2027 in Chicago."},
    {"url": "https://www.linkedin.com/jobs/view/4999999999/", "title": "Analyst", "company": "LinkedIn Only Co", "location": "Chicago, IL"}]})
check(st == 200 and g["added"] == 3, f"test jobs added ({g})")
found = {j["title"]: j["id"] for j in api("GET", "/api/found?q=E2E%20Co&status=all")[1]["jobs"]}
li = api("GET", "/api/found?q=LinkedIn%20Only&status=all")[1]["jobs"][0]["id"]

# The mock form is served over HTTPS on this machine, and Chromium is told that
# job-boards.greenhouse.io lives here (tabs the extension opens skip Playwright's routing).
submits = []
class Form(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        js = self.path.split("?")[0].endswith("app.js")
        body = (FIX / ("app.js" if js else "form.html")).read_bytes()
        self.send_response(200)
        self.send_header("content-type", "application/javascript" if js else "text/html; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def do_POST(self):
        data = self.rfile.read(int(self.headers.get("content-length") or 0))
        if self.path.endswith("/__submit"): submits.append(json.loads(data or b"{}"))
        self.send_response(200); self.send_header("content-length", "2"); self.end_headers(); self.wfile.write(b"ok")
# A stand-in for the Claude API: a cover letter for the Cover letter writer, nothing for the rest.
LETTER = ("Dear Hiring Manager,\n\nLast spring I rebuilt a messy sales dataset before a single model could run, and the patterns it "
          "finally showed were worth every hour. That habit of starting from the data is what I would bring to E2E Co.\n\n"
          "At my last internship I built the pipelines my team used every week.\n\nBest,\nAlex Doe\n===NOTES===\nLed with the data story.")
claude_calls = []
class Claude(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("content-length") or 0)) or b"{}")
        claude_calls.append(body.get("model"))
        text = LETTER if "cover letter" in json.dumps(body.get("system", "")).lower() and "write the cover letter" in json.dumps(body.get("messages", "")).lower() else '{"answers": []}'
        events = [{"type": "message_start", "message": {"model": body.get("model")}},
                  {"type": "content_block_delta", "delta": {"type": "text_delta", "text": text}},
                  {"type": "message_delta", "delta": {"stop_reason": "end_turn"}}, {"type": "message_stop"}]
        out = "".join(f"event: {e['type']}\ndata: {json.dumps(e)}\n\n" for e in events).encode()
        self.send_response(200); self.send_header("content-type", "text/event-stream"); self.send_header("content-length", str(len(out))); self.end_headers(); self.wfile.write(out)
claude = ThreadingHTTPServer(("127.0.0.1", 3799), Claude)
threading.Thread(target=claude.serve_forever, daemon=True).start()

subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", f"{S}/k.pem", "-out", f"{S}/c.pem", "-days", "1", "-subj", "/CN=job-boards.greenhouse.io"], check=True, capture_output=True)
server = ThreadingHTTPServer(("127.0.0.1", 0), Form)
tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); tls.load_cert_chain(f"{S}/c.pem", f"{S}/k.pem")
server.socket = tls.wrap_socket(server.socket, server_side=True)
PORT = server.server_address[1]
threading.Thread(target=server.serve_forever, daemon=True).start()

async def main():
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(f"{S}/profile", headless=True, channel="chromium", ignore_https_errors=True,
            args=[f"--disable-extensions-except={EXT}", f"--load-extension={EXT}", "--no-proxy-server", "--ignore-certificate-errors",
                  f"--host-resolver-rules=MAP job-boards.greenhouse.io:443 127.0.0.1:{PORT}"])
        sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event("serviceworker", timeout=20000)
        await sw.evaluate(f"chrome.storage.local.set({{ baseUrl: '{BASE}' }})")
        errors = []
        ctx.on("page", lambda pg: pg.on("pageerror", lambda e: errors.append(str(e))))

        async def run(task_id, until=("held", "needs_you", "submitted", "failed", "canceled"), timeout=150):
            await sw.evaluate("tick()")
            t0 = time.time()
            while time.time() - t0 < timeout:
                await asyncio.sleep(2)
                st, t = api("GET", f"/api/apply/auto/{task_id}")
                if t and t.get("status") in until: return t
                if t and t.get("status") == "queued" and time.time() - t0 > 8: await sw.evaluate("tick()")
            return api("GET", f"/api/apply/auto/{task_id}")[1]

        # A LinkedIn-only job has no form to fill: it's flagged, not queued.
        st, q = api("POST", "/api/apply/auto", {"foundIds": [li], "by": "agent"})
        check(st == 200 and not q["queued"] and "linkedin.com" in q["skipped"][0]["reason"], f"LinkedIn-only job flagged ({q['skipped']})")

        # 1. Consent left for you: everything else filled, then it waits for your tick.
        st, q = api("POST", "/api/apply/auto", {"foundIds": [found["Data Analyst Intern"]], "by": "agent"})
        check(st == 200 and len(q["queued"]) == 1 and "embed/job_app?for=e2eco&token=777" in q["queued"][0]["url"], f"queued with Greenhouse's form link ({q['queued']})")
        tid = q["queued"][0]["id"]
        t = await run(tid)
        print("   1:", t["status"], "|", t["summary"])
        check(t["status"] == "needs_you", "without consent it needs you")
        check(any("certify" in n for n in t["needs"]) and any("consent" in n.lower() for n in t["needs"]), f"needs: the two consent questions ({t['needs']})")
        ans = {a["label"].rstrip("*").strip(): a["value"] for a in t["answers"]}
        for label, want in [("Location (City)", "Chicago, Illinois, United States"), ("School", "University of Chicago"), ("Degree", "Master's Degree"),
                            ("Discipline", "Data Science"), ("End date month", "May"), ("End date year", "2028"), ("What is your overall, total GPA?", "3.0-3.49"),
                            ("Country", "United States +1")]:
            check(ans.get(label) == want, f"{label} → {ans.get(label)!r}")
        q1 = next((v for k, v in ans.items() if k.startswith("Are you legally authorized")), None)
        q2 = next((v for k, v in ans.items() if k.startswith("Will you now or in the future")), None)
        sms = next((v for k, v in ans.items() if k.startswith("We would like to contact you via SMS")), None)
        race = next((v for k, v in ans.items() if k.startswith("Which racial")), None)
        check(q1 == "No" and q2 == "Yes" and sms == "No", f"authorization No, sponsorship Yes, SMS No ({q1}, {q2}, {sms})")
        check(race == "I don't wish to answer", f"multi-select EEO declines ({race})")
        check((ans.get("Resume/CV") or "").startswith("Alex-Doe-Resume.pdf"), f"your uploaded resume attached ({ans.get('Resume/CV')})")
        check(not submits, "nothing submitted")

        # 2. You allow consent: retry, and it submits.
        api("PUT", "/api/apply/auto/settings", {"consent": True})
        api("POST", f"/api/apply/auto/{tid}", {"action": "retry"})
        t = await run(tid)
        print("   2:", t["status"], "|", t["summary"])
        check(t["status"] == "submitted", "with consent allowed it submits")
        sub = submits[-1] if submits else {}
        check(sub.get("gdpr") is True and sub.get("values", {}).get("question_5") == "Yes", f"consent ticked and certified ({sub.get('gdpr')}, {sub.get('values', {}).get('question_5')})")
        check(sub.get("text", {}).get("first_name") == "Alex" and sub.get("file") == "Alex-Doe-Resume.pdf", "the form got your name and resume")
        applied = api("GET", "/api/jobs?status=applied")[1]
        check(any(j["title"] == "Data Analyst Intern" for j in (applied if isinstance(applied, list) else applied.get("jobs", []))), "job marked applied in My jobs")

        # 3. A wording that needs a check: held for your OK, then you approve and it submits.
        st, q = api("POST", "/api/apply/auto", {"foundIds": [found["Data Science Intern"]], "by": "agent"})
        tid3 = q["queued"][0]["id"]
        t = await run(tid3)
        print("   3:", t["status"], "|", t["summary"], t["checks"])
        check(t["status"] == "held" and any("without sponsorship" in c for c in t["checks"]), "unclear wording held for your OK")
        check(any(c.startswith("Cover Letter") and "(AI)" in c for c in t["checks"]), f"the written cover letter is held for you to read ({t['checks']})")
        check("claude-haiku-5-5" in claude_calls, f"written with the application model ({set(claude_calls)})")
        st, _ = api("GET", f"/api/apply/cover-letter?foundId={found['Data Science Intern']}")
        check(st != 404, f"the letter is saved on the Cover letters page (PDF request: {st}, 409/422 means no LaTeX here)")
        n_before = len(submits)
        api("POST", f"/api/apply/auto/{tid3}", {"action": "approve"})
        t = await run(tid3)
        print("   3b:", t["status"], "|", t["summary"])
        check(t["status"] == "submitted" and len(submits) == n_before + 1, "approved → submitted")
        check("Last spring I rebuilt" in (submits[-1].get("text", {}).get("question_8") or ""), "the cover letter went into the form")
        st, again = api("POST", "/api/apply/auto", {"foundIds": [found["Data Science Intern"]]})
        check(not again["queued"] and "Already applied" in again["skipped"][0]["reason"], f"an applied job isn't queued again ({again['skipped']})")
        check(not errors, f"no page errors {errors[:3]}")
        await ctx.close()

asyncio.run(main())
print("\n" + ("ALL PASSED" if not fails else f"{len(fails)} FAILED: {fails}"))
sys.exit(1 if fails else 0)
