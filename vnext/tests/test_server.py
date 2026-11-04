import json
import threading
import urllib.request
from http.server import ThreadingHTTPServer

import pytest


def _post(port, body, token, origin=None, host=None):
    req = urllib.request.Request(f"http://127.0.0.1:{port}/api/to-apply", data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "X-Job-Finder-Token": token, **({"Origin": origin} if origin else {}), **({"Host": host} if host else {})})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, None


def test_to_apply_buttons(private):
    import importlib

    from jobfinder import dashboard, server, store
    importlib.reload(dashboard); importlib.reload(server)

    jid, _ = store.upsert_job({"url": "https://example.com/j/3", "title": "Data Intern", "company": "Acme", "location": "Chicago, IL"})
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.make_handler("tok", 0))
    port = httpd.server_address[1]
    httpd.RequestHandlerClass = server.make_handler("tok", port)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        page = urllib.request.urlopen(f"http://127.0.0.1:{port}/").read().decode()
        assert '"live": true' in page
        assert _post(port, {"add": [jid]}, "tok", origin=f"http://127.0.0.1:{port}") == (200, {"ok": True, "jobs": {jid: "saved"}})
        assert store.jobs("id=?", (jid,))[0]["status"] == "saved"
        assert _post(port, {"remove": [jid]}, "wrong")[0] == 403
        assert _post(port, {"remove": [jid]}, "tok", origin="https://evil.example")[0] == 403
        assert _post(port, {"remove": [jid]}, "tok", host="evil.example")[0] == 403
        assert _post(port, {"remove": [jid]}, "tok") == (200, {"ok": True, "jobs": {jid: "new"}})
        store.set_job_status(jid, "applied")
        assert _post(port, {"add": [jid]}, "tok")[1]["jobs"][jid] == "applied", "applied jobs stay applied"
    finally:
        httpd.shutdown()
