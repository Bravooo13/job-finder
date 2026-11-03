"""SQLite store: found jobs, applications (with the Submit lock), saved answers, activity."""
from __future__ import annotations

import json
import sqlite3
import time
import uuid
from contextlib import contextmanager
from typing import Any, Iterator, Optional

from . import config

STATUSES = ["queued", "running", "submitting", "ready", "held", "needs_you", "unsure", "submitted", "failed", "canceled"]
OPEN = {"queued", "running", "submitting", "ready", "held", "needs_you", "unsure"}
WAITING = {"ready", "held", "needs_you", "unsure"}
LABELS = {
    "queued": "Waiting", "running": "Filling", "submitting": "Submitting", "ready": "Ready to send",
    "held": "Waiting for your OK", "needs_you": "Needs you", "unsure": "Sent? Check", "submitted": "Submitted",
    "failed": "Didn't work", "canceled": "Canceled",
}

SCHEMA = """
create table if not exists jobs (
  id text primary key, url text unique not null, apply_url text, platform text, source text,
  company text, title text, location text, description text, posted_at text,
  score integer default 0, reasons text default '[]', visa text default 'unknown', visa_note text,
  level text, state text, status text default 'new', created_at real, updated_at real
);
create table if not exists applications (
  id text primary key, job_id text, url text not null, platform text, title text, company text,
  status text not null default 'queued', check_only integer not null default 0, approved integer not null default 0,
  submit_pressed_at real, page_note text, summary text, needs text default '[]', checks text default '[]',
  answers text default '[]', attempts integer default 0, created_at real, updated_at real
);
create table if not exists answers (
  id integer primary key autoincrement, job_id text, question text not null, answer text not null,
  source text default 'you', created_at real
);
create table if not exists activity (
  id integer primary key autoincrement, at real, who text, action text, title text, detail text
);
create table if not exists boards (
  key text primary key, platform text not null, token text not null, host text, site text, name text, origin text, added_at real
);
create index if not exists applications_status on applications(status);
"""


@contextmanager
def db() -> Iterator[sqlite3.Connection]:
    config.ensure_private()
    con = sqlite3.connect(config.DB_PATH)
    con.row_factory = sqlite3.Row
    con.executescript(SCHEMA)
    try:
        yield con
        con.commit()
    finally:
        con.close()


def _row(r: Optional[sqlite3.Row]) -> Optional[dict[str, Any]]:
    if r is None:
        return None
    d = dict(r)
    for k in ("reasons", "needs", "checks", "answers"):
        if k in d and isinstance(d[k], str):
            d[k] = json.loads(d[k] or "[]")
    return d


def log(who: str, action: str, title: str, detail: Any = None) -> None:
    with db() as con:
        con.execute("insert into activity(at, who, action, title, detail) values (?,?,?,?,?)", (time.time(), who, action, title, json.dumps(detail) if detail is not None else None))


# ------------------------------------------------------------------ jobs

def upsert_job(j: dict[str, Any]) -> tuple[str, bool]:
    """Adds a posting (one row per URL). Returns (id, added)."""
    now = time.time()
    with db() as con:
        old = con.execute("select id from jobs where url=?", (j["url"],)).fetchone()
        if old:
            con.execute(
                "update jobs set title=coalesce(?,title), company=coalesce(?,company), location=coalesce(?,location), description=coalesce(?,description), apply_url=coalesce(?,apply_url), updated_at=? where id=?",
                (j.get("title"), j.get("company"), j.get("location"), j.get("description"), j.get("apply_url"), now, old["id"]),
            )
            return old["id"], False
        jid = uuid.uuid4().hex[:12]
        con.execute(
            "insert into jobs(id,url,apply_url,platform,source,company,title,location,description,posted_at,score,reasons,visa,visa_note,level,state,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (jid, j["url"], j.get("apply_url"), j.get("platform"), j.get("source"), j.get("company"), j.get("title"), j.get("location"), j.get("description"),
             j.get("posted_at"), j.get("score", 0), json.dumps(j.get("reasons", [])), j.get("visa", "unknown"), j.get("visa_note"), j.get("level"), j.get("state"), now, now),
        )
        return jid, True


def jobs(where: str = "1=1", args: tuple = (), order: str = "score desc, created_at desc", limit: int = 500) -> list[dict[str, Any]]:
    with db() as con:
        return [_row(r) for r in con.execute(f"select * from jobs where {where} order by {order} limit ?", (*args, limit))]


def set_job_status(job_id: str, status: str) -> None:
    with db() as con:
        con.execute("update jobs set status=?, updated_at=? where id=?", (status, time.time(), job_id))


# ------------------------------------------------------------ applications

class LockedError(Exception):
    """Submit was already pressed: the company may have the application."""


def queue_application(job: dict[str, Any], url: str, platform: str, check_only: bool) -> Optional[str]:
    with db() as con:
        open_ = con.execute(f"select id from applications where (job_id=? or url=?) and status in ({','.join('?' * len(OPEN))})", (job.get("id"), url, *OPEN)).fetchone()
        if open_:
            return None
        aid = uuid.uuid4().hex[:12]
        now = time.time()
        con.execute(
            "insert into applications(id,job_id,url,platform,title,company,status,check_only,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,?)",
            (aid, job.get("id"), url, platform, job.get("title"), job.get("company"), "queued", int(check_only), now, now),
        )
    log("you", "queue", f"Queued {job.get('title')} at {job.get('company')}{' (check first)' if check_only else ''}")
    return aid


def application(aid: str) -> Optional[dict[str, Any]]:
    with db() as con:
        return _row(con.execute("select * from applications where id=?", (aid,)).fetchone())


def applications(statuses: Optional[set[str]] = None, limit: int = 500) -> list[dict[str, Any]]:
    with db() as con:
        if statuses:
            q = f"select * from applications where status in ({','.join('?' * len(statuses))}) order by updated_at desc limit ?"
            return [_row(r) for r in con.execute(q, (*statuses, limit))]
        return [_row(r) for r in con.execute("select * from applications order by updated_at desc limit ?", (limit,))]


def claim_next() -> Optional[dict[str, Any]]:
    with db() as con:
        r = con.execute("select * from applications where status='queued' order by approved desc, created_at limit 1").fetchone()
        if not r:
            return None
        con.execute("update applications set status='running', attempts=attempts+1, summary='Filling the form…', updated_at=? where id=? and status='queued'", (time.time(), r["id"]))
        return _row(r)


def report(aid: str, status: str, **fields: Any) -> dict[str, Any]:
    """The driver's report. Converts held -> ready for check-only runs and held/failed after Submit -> unsure."""
    app = application(aid)
    if app is None:
        raise KeyError(aid)
    after_submit = app["status"] == "submitting" or bool(app.get("submit_pressed_at"))
    if app["check_only"] and status == "held" and not after_submit:
        status = "ready"
        fields["summary"] = "Checked: every required question has an answer. Ready to send."
    if after_submit and status in ("held", "failed"):
        status = "unsure"
        fields["summary"] = "Submit was pressed but no thank-you page showed. Check your email; then mark it submitted, or reopen it if it didn't go through."
    sets = {"status": status, "updated_at": time.time()}
    if status == "submitting":
        sets["submit_pressed_at"] = time.time()
    for k in ("summary", "page_note"):
        if fields.get(k) is not None:
            sets[k] = str(fields[k])[:2000]
    for k in ("needs", "checks", "answers"):
        if fields.get(k) is not None:
            sets[k] = json.dumps(fields[k])
    with db() as con:
        con.execute(f"update applications set {', '.join(f'{k}=?' for k in sets)} where id=?", (*sets.values(), aid))
    if status == "submitted" and app.get("job_id"):
        set_job_status(app["job_id"], "applied")
    if status != app["status"] and status in WAITING | {"submitted", "failed"}:
        log("driver", "report", f"{app['title']} at {app['company']}: {LABELS[status]}", {"id": aid})
    return application(aid)


def act(aid: str, action: str) -> dict[str, Any]:
    """Your buttons: approve, send, retry, cancel, remove, submitted, reopen."""
    app = application(aid)
    if app is None:
        raise KeyError(aid)
    what = f"{app['title']} at {app['company']}"
    if app["status"] == "unsure" and action in ("retry", "approve", "send"):
        raise LockedError(f"Submit was already pressed for {what}; the company may have it. Check your email, then 'submitted' or (your call) 'reopen'.")
    if action == "send" and app["status"] != "ready":
        raise LockedError(f"{what} isn't ready to send (it is {app['status']}).")
    now = time.time()
    with db() as con:
        if action == "remove":
            con.execute("delete from applications where id=?", (aid,))
        elif action == "cancel":
            con.execute("update applications set status='canceled', updated_at=? where id=?", (now, aid))
        elif action == "submitted":
            pass
        else:
            send = action in ("send", "reopen") or (action == "approve" and app["status"] == "ready")
            con.execute(
                "update applications set status='queued', approved=?, check_only=?, needs='[]', summary=?, updated_at=?"
                + (", submit_pressed_at=null, page_note=null" if action == "reopen" else "") + " where id=?",
                (int(action == "approve"), 0 if send else app["check_only"], "Waiting to be filled and submitted." if send or action == "approve" else "Waiting to try again.", now, aid),
            )
    if action == "submitted":
        report(aid, "submitted", summary="You confirmed it went through.")
    log("you", action, f"{action}: {what}")
    return application(aid) or app


def send_ready() -> int:
    ready = applications({"ready"})
    for a in ready:
        act(a["id"], "send")
    return len(ready)


# ------------------------------------------------------------------ boards

def add_board(b: dict[str, Any], origin: str = "you") -> bool:
    key = ":".join(x for x in (b["platform"], b["token"].lower(), b.get("site") or "") if x)
    with db() as con:
        cur = con.execute("insert or ignore into boards(key, platform, token, host, site, name, origin, added_at) values (?,?,?,?,?,?,?,?)",
                          (key, b["platform"], b["token"], b.get("host"), b.get("site"), b.get("name"), origin, time.time()))
        return cur.rowcount > 0


def boards() -> list[dict[str, Any]]:
    with db() as con:
        return [dict(r) for r in con.execute("select * from boards order by added_at")]


# ------------------------------------------------------------------ answers

def save_answer(question: str, answer: str, job_id: Optional[str] = None, source: str = "you") -> None:
    with db() as con:
        con.execute("delete from answers where question=? and coalesce(job_id,'')=coalesce(?,'')", (question, job_id))
        con.execute("insert into answers(job_id, question, answer, source, created_at) values (?,?,?,?,?)", (job_id, question, answer, source, time.time()))


def saved_answers(job_id: Optional[str]) -> list[dict[str, Any]]:
    with db() as con:
        rows = con.execute("select question, answer, source from answers where job_id=? or job_id is null order by (job_id is null), created_at desc", (job_id,)).fetchall()
        return [dict(r) for r in rows]


def activity(limit: int = 100) -> list[dict[str, Any]]:
    with db() as con:
        return [dict(r) for r in con.execute("select * from activity order by at desc limit ?", (limit,))]
