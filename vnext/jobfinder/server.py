"""`python -m jobfinder serve`: the dashboard with working buttons, on this computer only.

The page is built fresh on every load. The one thing it can change is the To apply list
(POST /api/to-apply {"add": [...]} or {"remove": [...]}): it never applies, queues or submits.
Only 127.0.0.1 / localhost are answered, and a POST needs the page's token and a same-origin request.
"""
from __future__ import annotations

import json
import secrets
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from . import dashboard, store

AFTER = {"applied", "interview", "offer", "rejected", "withdrawn"}


def change_list(add: list[str], remove: list[str]) -> dict[str, str]:
    """Adds jobs to / takes them off the To apply list. Applied jobs are left as they are. -> {job id: status}."""
    out = {}
    for jid, status in [(j, "saved") for j in add] + [(j, "new") for j in remove]:
        rows = store.jobs("id=?", (jid,), limit=1)
        if not rows:
            continue
        cur = rows[0]["status"]
        if cur in AFTER or (status == "new" and cur != "saved"):
            out[jid] = cur
            continue
        if cur != status:
            store.set_job_status(jid, status)
            store.log("you", "to-apply", f"{'Added to' if status == 'saved' else 'Took off'} To apply: {rows[0]['title']} at {rows[0]['company']}")
        out[jid] = status
    return out


def make_handler(token: str, port: int):
    hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args: Any) -> None:  # quiet
            pass

        def _send(self, code: int, body: bytes, ctype: str) -> None:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _host_ok(self) -> bool:
            return self.headers.get("Host", "") in hosts

        def do_GET(self) -> None:
            if not self._host_ok():
                return self._send(403, b"Only this computer can open the dashboard.", "text/plain")
            if self.path.split("?")[0] in ("/", "/dashboard.html"):
                return self._send(200, dashboard.render(live=True, token=token).encode(), "text/html; charset=utf-8")
            self._send(404, b"Not found", "text/plain")

        def do_POST(self) -> None:
            origin = self.headers.get("Origin")
            if not self._host_ok() or (origin and origin.split("://", 1)[-1] not in hosts):
                return self._send(403, b'{"error": "cross-site request"}', "application/json")
            if self.headers.get("X-Job-Finder-Token") != token:
                return self._send(403, b'{"error": "reload the page"}', "application/json")
            if self.path != "/api/to-apply":
                return self._send(404, b'{"error": "not found"}', "application/json")
            try:
                n = min(int(self.headers.get("Content-Length") or 0), 100_000)
                body = json.loads(self.rfile.read(n) or b"{}")
                add = [str(x) for x in body.get("add") or []][:200]
                remove = [str(x) for x in body.get("remove") or []][:200]
            except (ValueError, AttributeError):
                return self._send(400, b'{"error": "bad request"}', "application/json")
            self._send(200, json.dumps({"ok": True, "jobs": change_list(add, remove)}).encode(), "application/json")

    return Handler


def serve(port: int = 3838, open_browser: bool = True) -> None:
    token = secrets.token_urlsafe(24)
    httpd = ThreadingHTTPServer(("127.0.0.1", port), make_handler(token, port))
    url = f"http://127.0.0.1:{port}/"
    print(f"Job Finder dashboard with buttons: {url}  (this computer only; Ctrl+C stops it)")
    if open_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
