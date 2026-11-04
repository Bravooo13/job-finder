"""SQLite store: found jobs, applications (with the Submit lock), saved answers, activity."""
from __future__ import annotations

import json
import re
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
create table if not exists h1b (
  company_key text primary key, name text, fiscal_year integer, initial_approvals integer default 0,
  total_approvals integer default 0, denials integer default 0, naics text, state text, city text
);
create table if not exists job_events (
  id integer primary key autoincrement, job_id text not null, at real, status text, note text
);
create index if not exists job_events_job on job_events(job_id);
"""
# Columns added after the first release; db() adds any that an older database lacks.
JOB_COLUMNS = {"industry": "text", "role_type": "text", "job_type": "text", "workplace": "text", "years": "integer",
               "pay": "text", "company_key": "text", "class_version": "integer default 0", "note": "text"}
# My jobs, after applying: the tracker.
TRACK = ["new", "saved", "applied", "interview", "offer", "rejected", "withdrawn", "dismissed"]
TRACK_LABELS = {"new": "New", "saved": "Saved", "applied": "Applied", "interview": "Interviewing", "offer": "Offer",
                "rejected": "Rejected", "withdrawn": "Withdrew", "dismissed": "Dismissed"}
_migrated = False


@contextmanager
def db() -> Iterator[sqlite3.Connection]:
    config.ensure_private()
    con = sqlite3.connect(config.DB_PATH)
    con.row_factory = sqlite3.Row
    global _migrated
    if not _migrated:
        con.executescript(SCHEMA)
        have = {r[1] for r in con.execute("pragma table_info(jobs)")}
        for col, typ in JOB_COLUMNS.items():
            if col not in have:
                con.execute(f"alter table jobs add column {col} {typ}")
        con.execute("create index if not exists jobs_company_key on jobs(company_key)")
        con.commit()
        _migrated = True
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


def set_job_status(job_id: str, status: str, note: Optional[str] = None, at: Optional[float] = None) -> None:
    """Sets a job's status; a change (or a note) is kept in its history (job_events)."""
    now = time.time()
    with db() as con:
        old = con.execute("select status from jobs where id=?", (job_id,)).fetchone()
        if old is None:
            raise KeyError(job_id)
        con.execute("update jobs set status=?, updated_at=? where id=?", (status, now, job_id))
        if old["status"] != status or note:
            con.execute("insert into job_events(job_id, at, status, note) values (?,?,?,?)", (job_id, at or now, status, note))


def add_note(job_id: str, note: str, at: Optional[float] = None) -> None:
    with db() as con:
        con.execute("insert into job_events(job_id, at, status, note) values (?,?,null,?)", (job_id, at or time.time(), note))


def job_events(job_ids: Optional[list[str]] = None) -> list[dict[str, Any]]:
    with db() as con:
        if job_ids is None:
            return [dict(r) for r in con.execute("select * from job_events order by at")]
        out = []
        for i in range(0, len(job_ids), 500):
            chunk = job_ids[i:i + 500]
            out += [dict(r) for r in con.execute(f"select * from job_events where job_id in ({','.join('?' * len(chunk))}) order by at", chunk)]
        return out


def find_job(text: str) -> list[dict[str, Any]]:
    """A job by id, else jobs you're tracking (saved or later) whose company or title contains the text."""
    rows = jobs("id=?", (text,), limit=1)
    if rows:
        return rows
    like = f"%{text}%"
    return jobs("status not in ('new','dismissed') and (company like ? or title like ?)", (like, like), order="updated_at desc", limit=10)


# ------------------------------------------------------------ classification and H-1B data

def reclassify(force: bool = False) -> int:
    """Classifies jobs saved before the current rules (industry, role type, job type, workplace, years, pay)."""
    from . import classify

    with db() as con:
        naics = {r["company_key"]: r["naics"] for r in con.execute("select company_key, naics from h1b where naics is not null")}
        rows = con.execute("select id, title, company, location, description from jobs" + ("" if force else " where coalesce(class_version,0) < ?"),
                           () if force else (classify.CLASS_VERSION,)).fetchall()
        for r in rows:
            key = classify.company_key(r["company"])
            c = classify.full(r["title"] or "", r["company"] or "", r["location"] or "", r["description"] or "", naics.get(key))
            con.execute("update jobs set industry=?, role_type=?, job_type=?, workplace=?, years=?, pay=?, company_key=?, class_version=? where id=?",
                        (c["industry"], c["role_type"], c["job_type"], c["workplace"], c["years"], c["pay"], c["company_key"], classify.CLASS_VERSION, r["id"]))
        return len(rows)


def import_h1b(path: str) -> dict[str, Any]:
    """Imports a USCIS H-1B Employer Data Hub file (any year's CSV). Keeps the newest year per employer;
    several files (years) can be imported one after another."""
    import csv

    from . import classify

    with open(path, newline="", encoding="utf-8-sig", errors="replace") as fh:
        rd = csv.reader(fh)
        header = [h.strip().lower() for h in next(rd)]
        col = lambda rx: next((i for i, h in enumerate(header) if re.search(rx, h)), -1)  # noqa: E731
        i_name, i_year, i_naics, i_state, i_city = col(r"employer|petitioner name"), col(r"fiscal year"), col(r"naics"), col(r"^state$|petitioner state"), col(r"^city$|petitioner city")
        appr = [i for i, h in enumerate(header) if "approval" in h]
        init = [i for i, h in enumerate(header) if re.search(r"(initial|new employment) approval", h)]
        den = [i for i, h in enumerate(header) if "denial" in h]
        if i_name < 0 or not appr:
            raise ValueError("This doesn't look like a USCIS H-1B Employer Data Hub file (no Employer or Approval columns).")
        num = lambda s: int(float(re.sub(r"[^\d.]", "", s) or 0))  # noqa: E731
        agg: dict[str, dict] = {}
        rows = 0
        for cells in rd:
            if len(cells) <= max(appr) or not cells[i_name].strip():
                continue
            rows += 1
            year = num(cells[i_year]) if i_year >= 0 else 0
            total, initial, denials = sum(num(cells[i]) for i in appr), sum(num(cells[i]) for i in init), sum(num(cells[i]) for i in den)
            for key in classify.company_key_variants(cells[i_name]):
                a = agg.get(key)
                if a and a["year"] == year:
                    a["total"] += total; a["initial"] += initial; a["denials"] += denials  # noqa: E702
                elif not a or year > a["year"]:
                    agg[key] = {"name": cells[i_name].strip(), "year": year, "total": total, "initial": initial, "denials": denials,
                                "naics": cells[i_naics].strip() if i_naics >= 0 else "", "state": cells[i_state].strip() if i_state >= 0 else "",
                                "city": cells[i_city].strip() if i_city >= 0 else ""}
    with db() as con:
        for key, a in agg.items():
            if a["total"] <= 0:
                continue
            con.execute("""insert into h1b(company_key,name,fiscal_year,initial_approvals,total_approvals,denials,naics,state,city) values (?,?,?,?,?,?,?,?,?)
                           on conflict(company_key) do update set name=excluded.name, fiscal_year=excluded.fiscal_year, initial_approvals=excluded.initial_approvals,
                           total_approvals=excluded.total_approvals, denials=excluded.denials, naics=excluded.naics, state=excluded.state, city=excluded.city
                           where excluded.fiscal_year >= h1b.fiscal_year""",
                        (key, a["name"], a["year"], a["initial"], a["total"], a["denials"], a["naics"] or None, a["state"] or None, a["city"] or None))
        # Industry may now be known from the filings' NAICS codes.
        con.execute("update jobs set class_version=0 where coalesce(industry,'other')='other'")
    years = {a["year"] for a in agg.values() if a["year"]}
    log("you", "h1b", f"H-1B data: {len(agg)} employers from {rows} rows (FY{max(years) if years else '?'})")
    return {"rows": rows, "employers": len(agg), "fiscal_year": max(years) if years else None}


def h1b_for(keys: list[str]) -> dict[str, dict[str, Any]]:
    """H-1B history by company key (the job's company_key, then looser forms of it)."""
    from . import classify

    with db() as con:
        table = {r["company_key"]: dict(r) for r in con.execute("select * from h1b")}
    out = {}
    for k in set(keys):
        if not k:
            continue
        hit = table.get(k) or next((table[v] for v in classify.company_key_variants(k) if v in table), None)
        if hit:
            out[k] = hit
    return out


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
