"""Writes the dashboard: one self-contained HTML file (no server) from the local data."""
from __future__ import annotations

import json
import time

from . import config, store


def snapshot() -> dict:
    jobs = store.jobs(limit=2000)
    apps = store.applications(limit=2000)
    slim_jobs = [{k: j.get(k) for k in ("id", "title", "company", "location", "url", "platform", "score", "visa", "visa_note", "level", "state", "status", "posted_at")} for j in jobs]
    slim_apps = [{k: a.get(k) for k in ("id", "job_id", "title", "company", "url", "platform", "status", "summary", "needs", "checks", "page_note", "updated_at", "check_only")} for a in apps]
    return {"generated": time.strftime("%Y-%m-%d %H:%M"), "generated_at": time.time(), "labels": store.LABELS, "jobs": slim_jobs, "applications": slim_apps, "activity": store.activity(60)}


def write(path=None):
    path = path or (config.OUTPUT / "dashboard.html")
    tpl = (config.ROOT / "dashboard" / "template.html").read_text()
    data = json.dumps(snapshot()).replace("</", "<\\/")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(tpl.replace("/*__DATA__*/null", data))
    return path
