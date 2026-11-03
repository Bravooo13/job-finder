"""Runs the real Playwright driver against the mock Greenhouse form (React Select, an education row
the site rebuilds after the resume upload, a code step after Submit, a silent Submit)."""
import json
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest
import yaml

pw = pytest.importorskip("playwright.sync_api")
FIX = Path(__file__).parent / "fixtures"
SUBMITS: list[dict] = []
PROFILE = {"firstName": "Alex", "lastName": "Doe", "email": "alex@example.edu", "phone": "312-555-0100", "city": "Chicago", "state": "Illinois", "country": "United States",
           "school": "University of Chicago", "degree": "M.S.", "major": "Data Science", "gpa": "3.43", "graduation": "2028-05", "authorizedToWork": "yes",
           "needsSponsorshipNow": "no", "needsSponsorshipLater": "yes", "visaStatus": "F-1", "usCitizen": "no", "custom": []}


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        name = "app.js" if self.path.split("?")[0].endswith("app.js") else "form.html"
        body = (FIX / name).read_bytes()
        self.send_response(200)
        self.send_header("content-type", "application/javascript" if name == "app.js" else "text/html")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        SUBMITS.append(json.loads(self.rfile.read(int(self.headers["content-length"]))))
        self.send_response(204)
        self.end_headers()


@pytest.fixture(scope="module")
def server():
    srv = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}"
    srv.shutdown()


def test_check_first_send_code_step_and_silent_submit(private, server):
    from jobfinder import config, store
    from jobfinder.apply import runner
    from jobfinder.apply.playwright_driver import PlaywrightDriver

    config.ensure_private()
    config.save_profile(PROFILE)
    (config.PRIVATE / "settings.yaml").write_text(yaml.safe_dump({**config.settings(), "consent": True, "submit": "sure", "pause_seconds": 0, "headless": True}))
    config.FILES.mkdir(parents=True, exist_ok=True)
    (config.FILES / "resume.pdf").write_bytes(b"%PDF-1.4\n%mock\n")

    def queue(token, check_only):
        url = f"{server}/embed/job_app?for=e2e&token={token}"
        jid, _ = store.upsert_job({"url": url, "title": "Data Analyst Intern", "company": "E2E Co", "platform": "greenhouse"})
        return store.queue_application({"id": jid, "title": "Data Analyst Intern", "company": "E2E Co"}, url, "greenhouse", check_only)

    good = queue(777, True)
    d = PlaywrightDriver(headless=True, profile_dir=private / "profile")
    try:
        runner.run_queue(d, limit=1, finish=False)
        app = store.application(good)
        assert app["status"] == "ready", (app["summary"], app["needs"], app["answers"])
        assert not SUBMITS, "check-first never submits"
        assert store.send_ready() == 1
        runner.run_queue(d, limit=1, finish=False)
        app = store.application(good)
        assert app["status"] == "submitted", app
        sent = SUBMITS[-1]
        assert sent["values"]["school--1"] == "University of Chicago", "the rebuilt education row was refilled"
        assert sent["values"]["degree--1"] == "Master's Degree"
        assert sent["values"]["question_1"] == "No" and sent["values"]["question_2"] == "Yes"
        assert sent["values"]["question_3"] == "3.0-3.49"
        assert sent["text"]["first_name"] == "Alex" and sent["file"] == "resume.pdf"

        code = queue(781, False)
        runner.run_queue(d, limit=1, finish=False)
        app = store.application(code)
        assert app["status"] == "needs_you" and "code" in app["summary"].lower(), (app["status"], app["summary"], app["page_note"])

        silent = queue(783, False)
        runner.run_queue(d, limit=1, finish=False)
        app = store.application(silent)
        assert app["status"] == "unsure", app
        with pytest.raises(store.LockedError):
            store.act(silent, "retry")
    finally:
        d.close()
