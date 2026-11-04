"""Command line: python -m jobfinder <command>. Run with no command for help.

  init                      create private/ with your profile, settings and searches to fill in
  find [--linkedin] [--simplify]   scan your boards (and Simplify / LinkedIn guest search) for your searches
  add-board URL_OR_PLATFORM:TOKEN   remember a company's job board (learned from any job link too)
  grab URL                  read a careers page (JSON-LD postings, linked boards) with a headless browser
  jobs [--visa friendly|h1b] [--min 60] [--status new] [--industry quant] [--role data-science]
       [--place Chicago] [--type internship] [--work remote] [--limit 30]
  save JOB_ID... / unsave JOB_ID... / dismiss JOB_ID...   add to your To apply list / take off / never show
  to-apply                  your To apply list (saved jobs) and where each one is
  queue JOB_ID... [--send]  queue applications (checked first unless --send or check_first: false)
  queue --saved [--send]    queue everything on your To apply list that isn't in Auto apply yet
  apply [--limit N] [--driver selenium]   run the queue in a real browser
  status                    applications by status, with what each needs
  act APP_ID ACTION         approve | send | retry | cancel | remove | submitted | reopen
  send-ready                send every checked application that is ready
  answer "QUESTION" "ANSWER" [--job JOB_ID] [--ai]   save an answer (every job unless --job)
  letters [--show JOB]      applications waiting for a cover letter (--show prints the job's description)
  letter JOB FILE.md        save a written letter as the job's PDF and retry the application that needed it
  accounts [--show]         job-site accounts made for you (--show prints the passwords from the Keychain)
  track JOB STATUS [--note TEXT] [--date YYYY-MM-DD]   after applying: interview | offer | rejected | withdrawn | applied
                            (JOB = a job id, or part of the company name or title of a job you're tracking)
  note JOB "TEXT"           add a note to a job's history
  h1b [FILE.csv ...] [--download]   import USCIS H-1B Employer Data Hub files (or download the newest ones)
  schedule [--hour 8] [--linkedin] [--off]   run `find --simplify` and rebuild the dashboard every day (macOS)
  classify [--all]          sort jobs into industry, role type, job type, workplace, years asked, pay
  dashboard                 write private/output/dashboard.html (open it in any browser)
  serve [--port 3838]       the dashboard with buttons (add to / take off your To apply list), this computer only
  platform URL              which platform a link belongs to and how it's handled
  import-v1 PATH/job-finder.db   bring My info, jobs, boards and answers over from Job Finder v1
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

from . import classify, config, feeds, match, platforms, store


def _ingest(postings: list[dict], origin: str) -> tuple[int, int]:
    searches = config.searches() or [{}]
    added = learned = 0
    for p in postings:
        if not p.get("url") or not p.get("title"):
            continue
        for b in feeds.boards_in_text(" ".join(x for x in [p.get("url"), p.get("apply_url")] if x)):
            learned += store.add_board({**b, "name": p.get("company")}, origin)
        visa, note = classify.visa(p.get("description", ""))
        if visa == "unknown" and p.get("visa_hint"):
            visa, note = p["visa_hint"], f"From {p.get('source')}"
        j = {**p, "platform": p.get("platform") or platforms.detect(p["url"])["id"], "visa": visa, "visa_note": note,
             "level": classify.level(p.get("title", ""), p.get("description", "")), "state": classify.state(p.get("location", ""))}
        best = max((match.score(j, s) for s in searches), key=lambda x: x[0])
        j["score"], j["reasons"] = best
        _, new = store.upsert_job(j)
        added += new
    store.log("you", "find", f"{origin}: {added} new jobs, {learned} boards learned")
    return added, learned


def cmd_find(a) -> None:
    total = 0
    for b in store.boards():
        try:
            got = feeds.scan_board(b)
        except Exception as e:  # noqa: BLE001
            print(f"  {b['platform']}:{b['token']}: {e}")
            continue
        n, _ = _ingest(got, f"{b['platform']}:{b['token']}")
        total += n
        print(f"  {b['platform']}:{b['token']}: {len(got)} postings, {n} new")
    if a.simplify:
        for repo in ("Summer2027-Internships", "New-Grad-Positions"):
            n, l = _ingest(feeds.simplify(repo), f"simplify:{repo}")
            total += n
            print(f"  Simplify {repo}: {n} new, {l} boards learned")
    if a.linkedin:
        for s in config.searches():
            for t in s.get("titles", [])[:3]:
                for place in s.get("locations", ["United States"])[:2]:
                    n, _ = _ingest(feeds.linkedin(t, place, pages=2), f"linkedin:{t}@{place}")
                    total += n
                    print(f"  LinkedIn {t} @ {place}: {n} new")
    store.reclassify()
    print(f"{total} new jobs. `python -m jobfinder jobs` lists the best.")


def cmd_add_board(a) -> None:
    if ":" in a.board and not a.board.startswith("http"):
        plat, tok = a.board.split(":", 1)
        found = [{"platform": plat, "token": tok}]
    else:
        found = feeds.boards_in_text(a.board)
    for b in found:
        print(("added " if store.add_board(b) else "already had ") + json.dumps(b))
    if not found:
        print("No known job board in that link. Try `grab URL` on the careers page.")


def cmd_grab(a) -> None:
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        b = pw.chromium.launch()
        page = b.new_page()
        page.goto(a.url, wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_timeout(2500)
        html = page.content()
        links = " ".join(page.eval_on_selector_all("a[href], iframe[src]", "els => els.map(e => e.href || e.src)"))
        b.close()
    learned = [b for b in feeds.boards_in_text(html + " " + links)]
    for bd in learned:
        store.add_board(bd, "web")
    n, _ = _ingest(feeds.jsonld_postings(html, a.url), f"page:{a.url}")
    names = ", ".join(x["platform"] + ":" + x["token"] for x in learned) or "none"
    print(f"{len(learned)} job boards learned ({names}), {n} postings read from the page.")


def cmd_jobs(a) -> None:
    where, args = ["1=1"], []
    if a.status:
        where.append("status=?")
        args.append(a.status)
    if a.visa == "friendly":
        where.append("visa in ('sponsors','opt_cpt','unknown')")
    elif a.visa == "h1b":
        where.append("visa not in ('no_sponsorship','citizens_only') and company_key in (select company_key from h1b)")
    elif a.visa:
        where.append("visa=?")
        args.append(a.visa)
    if a.min:
        where.append("score>=?")
        args.append(a.min)
    if a.place:
        where.append("location like ?")
        args.append(f"%{a.place}%")
    for col, val in (("industry", a.industry), ("role_type", a.role), ("job_type", a.type), ("workplace", a.work)):
        if val:
            where.append(f"{col}=?")
            args.append(val)
    store.reclassify()
    for j in store.jobs(" and ".join(where), tuple(args), limit=a.limit):
        print(f"{j['id']}  {j['score']:>3}  {j['visa']:<15} {j['title'][:60]:<60}  {j['company'] or '':<24} {j['location'] or ''}")


def to_apply() -> list[dict]:
    """Saved jobs, each with its latest application (None = not queued yet)."""
    rows = store.jobs("status='saved'", order="score desc, updated_at desc", limit=1000)
    apps: dict[str, dict] = {}
    for ap in store.applications(limit=5000):
        if ap.get("job_id") and ap["job_id"] not in apps:
            apps[ap["job_id"]] = ap
    return [{**j, "application": apps.get(j["id"])} for j in rows]


def cmd_to_apply(a) -> None:
    rows = to_apply()
    if not rows:
        print("Your To apply list is empty. Add jobs with: python -m jobfinder save JOB_ID ...")
    for j in rows:
        ap = j["application"]
        where = f"{store.LABELS.get(ap['status'], ap['status'])} ({ap['id']})" if ap else "not queued yet"
        print(f"{j['id']}  {j['score']:>3}  {where:<26} {j['title'][:55]:<55}  {j['company'] or ''}")
    waiting = [j for j in rows if not j["application"]]
    if waiting:
        print(f"\n{len(waiting)} not queued yet. `python -m jobfinder queue --saved` queues them.")


def cmd_queue(a) -> None:
    sett = config.settings()
    check_first = sett.get("check_first", True) and not a.send
    if a.saved:
        # Jobs with any application (even a canceled or paused one) are left alone: you decide those.
        a.job_ids = [j["id"] for j in to_apply() if not j["application"]]
        if not a.job_ids:
            print("Nothing on your To apply list is waiting to be queued.")
            return
    elif not a.job_ids:
        sys.exit("Give job ids, or --saved for your To apply list.")
    for jid in a.job_ids:
        rows = store.jobs("id=?", (jid,))
        if not rows:
            print(f"{jid}: no such job")
            continue
        j = rows[0]
        if j["status"] in ("applied",):
            print(f"{jid}: already applied")
            continue
        url, why = platforms.application_url(j["url"], j.get("apply_url"))
        if not url:
            print(f"{jid}: {why}")
            continue
        blocker = None if a.force else platforms.queue_blocker(url, j.get("description") or "")
        if blocker:
            print(f"{jid}: skipped: {blocker}")
            continue
        aid = store.queue_application(j, url, platforms.detect(url)["id"], check_first)
        print(f"{jid}: {'queued ' + aid + (' (check first)' if check_first else '') if aid else 'already in the queue'}")


def cmd_apply(a) -> None:
    from .apply import runner

    driver_name = a.driver or config.settings().get("driver", "playwright")
    if driver_name == "selenium":
        from .apply.selenium_driver import SeleniumDriver as D
    else:
        from .apply.playwright_driver import PlaywrightDriver as D
    results = runner.run_queue(D(), limit=a.limit)
    for r in results:
        print(f"{r['id']}  {store.LABELS[r['status']]:<20} {r['title']} at {r['company']}: {r.get('summary') or ''}")
    if not results:
        print("Nothing queued.")


def cmd_status(a) -> None:
    apps = store.applications()
    if not apps:
        print("No applications yet. Queue some with: python -m jobfinder queue JOB_ID ...")
    for st in store.STATUSES:
        group = [x for x in apps if x["status"] == st]
        if not group:
            continue
        print(f"\n{store.LABELS[st]} ({len(group)})")
        for x in group:
            print(f"  {x['id']}  {x['title']} at {x['company']}  {x.get('summary') or ''}")
            for n in x.get("needs") or []:
                print(f"      needs: {n}")
            if x.get("page_note"):
                print(f"      page: {x['page_note'][:200]}")


def cmd_act(a) -> None:
    try:
        r = store.act(a.app_id, a.action)
        print(f"{r['id']}: {store.LABELS.get(r['status'], r['status'])}")
    except store.LockedError as e:
        sys.exit(str(e))


def cmd_dashboard(a) -> None:
    from . import dashboard

    path = dashboard.write()
    print(f"Wrote {path}. Open it in a browser.")


def _one_job(text: str) -> dict:
    hits = store.find_job(text)
    if not hits:
        sys.exit(f"No job matches {text!r}. Use a job id (from `jobs` or the dashboard) or part of the company name.")
    if len(hits) > 1:
        lines = "\n".join(f"  {j['id']}  {j['title']} at {j['company']} ({j['status']})" for j in hits)
        sys.exit(f"{len(hits)} jobs match {text!r}; use the id:\n{lines}")
    return hits[0]


def _when(date: str | None) -> float | None:
    if not date:
        return None
    import datetime as dt

    return dt.datetime.strptime(date, "%Y-%m-%d").timestamp()


def cmd_track(a) -> None:
    j = _one_job(a.job)
    store.set_job_status(j["id"], a.status, a.note, _when(a.date))
    store.log("you", "track", f"{j['title']} at {j['company']}: {store.TRACK_LABELS[a.status]}" + (f" ({a.note})" if a.note else ""))
    print(f"{j['title']} at {j['company']}: {store.TRACK_LABELS[a.status]}")


def cmd_note(a) -> None:
    j = _one_job(a.job)
    store.add_note(j["id"], a.text, _when(a.date))
    print(f"Note added to {j['title']} at {j['company']}.")


def cmd_h1b(a) -> None:
    import tempfile
    import urllib.request

    files = list(a.files)
    if a.download:
        # USCIS posts one file per fiscal year; the newest ones on its "Data Hub Files" page are tried.
        for year in range(time.localtime().tm_year, 2019, -1):
            url = f"https://www.uscis.gov/sites/default/files/document/data/h1b_datahubexport-{year}.csv"
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh)"})
                body = urllib.request.urlopen(req, timeout=60).read()
            except Exception:  # noqa: BLE001 - that year isn't posted
                continue
            if b"employer" not in body[:300].lower():
                continue
            path = os.path.join(tempfile.mkdtemp(), f"h1b-{year}.csv")
            open(path, "wb").write(body)
            files.append(path)
            if len(files) >= 2:
                break
        if not files:
            sys.exit("Couldn't download from USCIS. Download a CSV at https://www.uscis.gov/archive/h-1b-employer-data-hub-files and run: h1b FILE.csv")
    for path in sorted(files):  # oldest year first, so the newest one wins
        r = store.import_h1b(path)
        print(f"{os.path.basename(path)}: {r['employers']} employers from {r['rows']} rows (FY{r['fiscal_year']})")
    print(f"{store.reclassify()} jobs sorted again.")


LAUNCH_ID = "com.jobfinder.vnext.find"


def cmd_schedule(a) -> None:
    """A launchd job in ~/Library/LaunchAgents: every day at the hour, find jobs and rebuild the dashboard."""
    import plistlib
    import subprocess

    plist = os.path.expanduser(f"~/Library/LaunchAgents/{LAUNCH_ID}.plist")
    uid = os.getuid()
    subprocess.run(["launchctl", "bootout", f"gui/{uid}/{LAUNCH_ID}"], capture_output=True)
    if a.off:
        if os.path.exists(plist):
            os.remove(plist)
        print("Daily search is off.")
        return
    py = os.path.join(config.ROOT, ".venv", "bin", "python")
    logs = config.PRIVATE / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    find = f"{py} -m jobfinder find --simplify" + (" --linkedin" if a.linkedin else "")
    script = f'cd "{config.ROOT}" && export SSL_CERT_FILE="$({py} -m certifi)" && {find} && {py} -m jobfinder dashboard'
    os.makedirs(os.path.dirname(plist), exist_ok=True)
    with open(plist, "wb") as fh:
        plistlib.dump({"Label": LAUNCH_ID, "ProgramArguments": ["/bin/bash", "-c", script],
                       "StartCalendarInterval": {"Hour": a.hour, "Minute": 0}, "WorkingDirectory": str(config.ROOT),
                       "StandardOutPath": str(logs / "daily-find.log"), "StandardErrorPath": str(logs / "daily-find.log")}, fh)
    r = subprocess.run(["launchctl", "bootstrap", f"gui/{uid}", plist], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"Wrote {plist} but launchctl said: {r.stderr.strip()}")
    print(f"Every day at {a.hour}:00 Job Finder runs `{find.split(' -m ')[1]}` and rebuilds the dashboard (when the Mac is awake; "
          f"a missed run happens when it wakes). Log: {logs / 'daily-find.log'}. Turn it off with: schedule --off")


def cmd_letters(a) -> None:
    from . import letters

    if a.show:
        j = _one_job(a.show)
        md, pdf = letters.paths(j["id"])
        print(f"{j['title']} at {j['company']} ({j.get('location') or ''})\n{j['url']}\nLetter: {pdf if pdf.exists() else 'not written yet'}\n")
        print(j.get("description") or "(no description saved; open the link)")
        return
    rows = letters.waiting()
    if not rows:
        print("No application is waiting for a cover letter.")
    for w in rows:
        j, ap = w["job"], w["app"]
        print(f"  job {ap.get('job_id')}  app {ap['id']}  {ap['title']} at {ap['company']}")
    if rows:
        print("Write each with the cover-letter-writer skill, then: python -m jobfinder letter JOB_ID letter.md")


def cmd_letter(a) -> None:
    from . import letters

    j = _one_job(a.job)
    try:
        r = letters.save(j["id"], open(a.file, encoding="utf-8").read())
    except ValueError as e:
        sys.exit(str(e))
    print(f"Saved {r['pdf']} ({r['words']} words)." + (f" Back in the queue: {', '.join(r['retried'])} (run apply)." if r["retried"] else ""))


def cmd_accounts(a) -> None:
    from . import accounts

    recs = accounts.records()
    if not recs:
        print("No job-site accounts yet." + ("" if config.settings().get("accounts") else " (accounts: false in settings.yaml)"))
    for r in recs:
        pw = (accounts.get(r["host"]) or {}).get("password") if a.show else None
        print(f"  {r.get('company', ''):<24} {r['host']:<44} {r['email']}  {r.get('status', '')}  {r.get('created', '')}" + (f"\n      password: {pw}" if a.show else ""))
    if recs and not a.show:
        print("Passwords are in the macOS Keychain (search \"Job Finder\"); `accounts --show` prints them.")


def cmd_platform(a) -> None:
    p = platforms.detect(a.url)
    url, why = platforms.application_url(a.url)
    print(json.dumps({"platform": p["id"], "name": p["name"], "automation": p["automation"], "form": url, "why": why, "skip": platforms.queue_blocker(url or a.url), "apply": p["apply"]}, indent=2))


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(prog="jobfinder", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd")
    sub.add_parser("init")
    f = sub.add_parser("find"); f.add_argument("--linkedin", action="store_true"); f.add_argument("--simplify", action="store_true")
    b = sub.add_parser("add-board"); b.add_argument("board")
    g = sub.add_parser("grab"); g.add_argument("url")
    j = sub.add_parser("jobs"); j.add_argument("--visa"); j.add_argument("--min", type=int); j.add_argument("--status"); j.add_argument("--limit", type=int, default=30)
    j.add_argument("--industry"); j.add_argument("--role"); j.add_argument("--place"); j.add_argument("--type"); j.add_argument("--work")
    sv = sub.add_parser("serve"); sv.add_argument("--port", type=int, default=3838); sv.add_argument("--no-open", action="store_true")
    ls = sub.add_parser("letters"); ls.add_argument("--show")
    lt = sub.add_parser("letter"); lt.add_argument("job"); lt.add_argument("file")
    ac = sub.add_parser("accounts"); ac.add_argument("--show", action="store_true")
    tr = sub.add_parser("track"); tr.add_argument("job"); tr.add_argument("status", choices=[s for s in store.TRACK if s not in ("new",)]); tr.add_argument("--note"); tr.add_argument("--date")
    nt = sub.add_parser("note"); nt.add_argument("job"); nt.add_argument("text"); nt.add_argument("--date")
    hb = sub.add_parser("h1b"); hb.add_argument("files", nargs="*"); hb.add_argument("--download", action="store_true")
    sc = sub.add_parser("schedule"); sc.add_argument("--hour", type=int, default=8, choices=range(24), metavar="0-23"); sc.add_argument("--linkedin", action="store_true"); sc.add_argument("--off", action="store_true")
    cl = sub.add_parser("classify"); cl.add_argument("--all", action="store_true")
    for name in ("save", "unsave", "dismiss"):
        x = sub.add_parser(name); x.add_argument("job_ids", nargs="+")
    sub.add_parser("to-apply")
    q = sub.add_parser("queue"); q.add_argument("job_ids", nargs="*"); q.add_argument("--saved", action="store_true"); q.add_argument("--send", action="store_true"); q.add_argument("--force", action="store_true")
    p = sub.add_parser("apply"); p.add_argument("--limit", type=int, default=20); p.add_argument("--driver", choices=["playwright", "selenium"])
    sub.add_parser("status")
    c = sub.add_parser("act"); c.add_argument("app_id"); c.add_argument("action", choices=["approve", "send", "retry", "cancel", "remove", "submitted", "reopen"])
    sub.add_parser("send-ready")
    an = sub.add_parser("answer"); an.add_argument("question"); an.add_argument("answer"); an.add_argument("--job"); an.add_argument("--ai", action="store_true")
    sub.add_parser("dashboard")
    pl = sub.add_parser("platform"); pl.add_argument("url")
    iv = sub.add_parser("import-v1"); iv.add_argument("db")
    a = ap.parse_args(argv)
    if a.cmd == "init":
        config.ensure_private()
        print(f"Created {config.PRIVATE}. Fill in profile.yaml, searches.yaml and settings.yaml, and put your resume at files/resume.pdf.")
    elif a.cmd == "find":
        cmd_find(a)
    elif a.cmd == "add-board":
        cmd_add_board(a)
    elif a.cmd == "grab":
        cmd_grab(a)
    elif a.cmd == "jobs":
        cmd_jobs(a)
    elif a.cmd in ("save", "unsave", "dismiss"):
        status = {"save": "saved", "unsave": "new", "dismiss": "dismissed"}[a.cmd]
        for jid in a.job_ids:
            rows = store.jobs("id=?", (jid,), limit=1)
            if not rows:
                print(f"{jid}: no such job")
            elif rows[0]["status"] in ("applied", "interview", "offer", "rejected", "withdrawn"):
                print(f"{jid}: already applied ({rows[0]['status']}); left as it is")
            else:
                store.set_job_status(jid, status)
                print(f"{jid}: {'on your To apply list' if status == 'saved' else 'taken off the list' if status == 'new' else 'dismissed'}  {rows[0]['title']} at {rows[0]['company']}")
    elif a.cmd == "to-apply":
        cmd_to_apply(a)
    elif a.cmd == "queue":
        cmd_queue(a)
    elif a.cmd == "apply":
        cmd_apply(a)
    elif a.cmd == "status":
        cmd_status(a)
    elif a.cmd == "act":
        cmd_act(a)
    elif a.cmd == "send-ready":
        print(f"Sent {store.send_ready()} applications.")
    elif a.cmd == "answer":
        store.save_answer(a.question, a.answer, a.job, "ai" if a.ai else "you")
        print("Saved.")
    elif a.cmd == "letters":
        cmd_letters(a)
    elif a.cmd == "letter":
        cmd_letter(a)
    elif a.cmd == "accounts":
        cmd_accounts(a)
    elif a.cmd == "track":
        cmd_track(a)
    elif a.cmd == "note":
        cmd_note(a)
    elif a.cmd == "h1b":
        cmd_h1b(a)
    elif a.cmd == "schedule":
        cmd_schedule(a)
    elif a.cmd == "classify":
        print(f"{store.reclassify(force=a.all)} jobs sorted.")
    elif a.cmd == "dashboard":
        cmd_dashboard(a)
    elif a.cmd == "serve":
        from . import server

        server.serve(a.port, not a.no_open)
    elif a.cmd == "platform":
        cmd_platform(a)
    elif a.cmd == "import-v1":
        from . import import_v1

        print(import_v1.run(a.db))
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
