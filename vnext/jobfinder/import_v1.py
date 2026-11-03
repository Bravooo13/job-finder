"""Brings your data over from Job Finder v1 (the Next.js app): My info, Auto apply settings, learned
boards, found jobs, My jobs, saved answers and applications. Reads a COPY of data/job-finder.db and
writes into private/. Safe to run again: rows already there are kept."""
from __future__ import annotations

import json
import shutil
import sqlite3
import tempfile
import time
from pathlib import Path

import yaml

from . import classify, config, store

DONE = {"applied", "interview", "offer", "offer_accepted", "offer_declined", "rejected", "withdrawn"}


def _date(ms) -> str | None:
    try:
        return time.strftime("%Y-%m-%d", time.gmtime(int(ms) / 1000)) if ms else None
    except (TypeError, ValueError):
        return None


def _tables(con) -> set[str]:
    return {r[0] for r in con.execute("select name from sqlite_master where type='table'")}


def run(db_path: str) -> str:
    src = Path(db_path).expanduser()
    tmp = Path(tempfile.mkdtemp()) / "v1.db"
    shutil.copy(src, tmp)  # never open the live file
    for ext in ("-wal", "-shm"):
        if Path(f"{src}{ext}").exists():
            shutil.copy(f"{src}{ext}", f"{tmp}{ext}")
    con = sqlite3.connect(tmp)
    con.row_factory = sqlite3.Row
    have = _tables(con)
    config.ensure_private()
    out: list[str] = []

    get = lambda k: con.execute("select value from settings where key=?", (k,)).fetchone() if "settings" in have else None  # noqa: E731
    row = get("apply.profile")
    if row:
        prof = json.loads(row["value"])
        config.save_profile(prof)
        out.append(f"profile ({sum(1 for v in prof.values() if v)} fields)")
    row = get("apply.auto")
    if row:
        a = json.loads(row["value"])
        sett = config.settings()
        sett.update({"submit": a.get("submit", "sure"), "consent": bool(a.get("consent")), "check_first": a.get("checkFirst", True), "pause_seconds": a.get("pauseSeconds", 20)})
        (config.PRIVATE / "settings.yaml").write_text(yaml.safe_dump(sett, sort_keys=False))
        out.append("settings")

    # Older v1 databases lack later columns, so every row is read as a dict with .get().
    rows = lambda sql: (dict(r) for r in con.execute(sql))  # noqa: E731
    n = 0
    if "company_boards" in have:
        for r in rows("select * from company_boards"):
            n += store.add_board({"platform": r.get("provider"), "token": r.get("token"), "host": r.get("host"), "site": r.get("site") or None, "name": r.get("name")}, r.get("origin") or "v1")
    out.append(f"{n} boards")

    by_v1_job: dict[str, str] = {}
    n = 0
    for r in rows("select * from discovered_jobs where status != 'dismissed'") if "discovered_jobs" in have else []:
        if not r.get("visa"):  # older v1 databases weren't classified yet
            r["visa"], r["visa_note"] = classify.visa(r.get("description") or "")
            r["level"], r["state"] = classify.level(r.get("title") or "", r.get("description") or ""), classify.state(r.get("location") or "")
        jid, new = store.upsert_job({
            "url": r["url"], "apply_url": r.get("apply_url"), "platform": r.get("provider"), "source": r.get("provider"), "company": r.get("company"), "title": r.get("title"),
            "location": r.get("location"), "description": r.get("description"), "posted_at": _date(r.get("posted_at")), "score": r.get("score") or 0,
            "reasons": [], "visa": r.get("visa") or "unknown", "visa_note": r.get("visa_note"), "level": r.get("level"), "state": r.get("state"),
        })
        n += new
        if r.get("status") == "saved":
            store.set_job_status(jid, "saved")
        if r.get("job_id"):
            by_v1_job[r["job_id"]] = jid
    out.append(f"{n} found jobs")

    n = 0
    for r in rows("select j.*, c.name as company_name from jobs j left join companies c on c.id = j.company_id") if {"jobs", "companies"} <= have else []:
        url = r.get("apply_url") or r.get("url")
        if not url:
            continue
        jid, new = store.upsert_job({"url": r.get("url") or url, "apply_url": r.get("apply_url"), "company": r.get("company_name"), "title": r.get("title"), "location": r.get("location"),
                                     "description": r.get("description"), "visa": r.get("visa") or "unknown", "visa_note": r.get("visa_note"), "source": "v1"})
        store.set_job_status(jid, "applied" if r.get("status") in DONE else "saved")
        by_v1_job[r["id"]] = jid
        n += 1
    out.append(f"{n} tracked jobs")

    n = 0
    if "apply_answers" in have:
        for r in rows("select * from apply_answers"):
            store.save_answer(r["question"], r["answer"], by_v1_job.get(r.get("job_id") or ""), "ai" if r.get("source") == "ai" else "you")
            n += 1
    out.append(f"{n} saved answers")

    n = 0
    if "apply_tasks" in have:
        cols = {c[1] for c in con.execute("pragma table_info(apply_tasks)")}
        with store.db() as dst:
            for d in rows("select * from apply_tasks"):
                pressed = d.get("submit_pressed_at") if "submit_pressed_at" in cols else None
                dst.execute(
                    "insert or ignore into applications(id,job_id,url,title,company,status,check_only,submit_pressed_at,page_note,summary,needs,checks,answers,attempts,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (str(d["id"]).replace("-", "")[:12], by_v1_job.get(d.get("job_id") or ""), d["url"], d.get("title"), d.get("company"), d.get("status") or "queued", d.get("check_only") or 0,
                     pressed / 1000 if pressed else None, d.get("page_note"), d.get("summary"), d.get("needs") or "[]", d.get("checks") or "[]", d.get("answers") or "[]",
                     d.get("attempts") or 0, (d.get("created_at") or 0) / 1000, (d.get("updated_at") or 0) / 1000),
                )
                n += 1
    out.append(f"{n} applications")
    store.log("you", "import-v1", "Imported from Job Finder v1: " + ", ".join(out))
    return "Imported " + ", ".join(out) + f" into {config.PRIVATE}"
