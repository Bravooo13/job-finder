"""Command line: python -m jobfinder <command>. Run with no command for help.

  init                      create private/ with your profile, settings and searches to fill in
  find [--linkedin] [--simplify]   scan your boards (and Simplify / LinkedIn guest search) for your searches
  add-board URL_OR_PLATFORM:TOKEN   remember a company's job board (learned from any job link too)
  grab URL                  read a careers page (JSON-LD postings, linked boards) with a headless browser
  jobs [--visa friendly] [--min 60] [--status new] [--limit 30]
  save JOB_ID / dismiss JOB_ID
  queue JOB_ID... [--send]  queue applications (checked first unless --send or check_first: false)
  apply [--limit N] [--driver selenium]   run the queue in a real browser
  status                    applications by status, with what each needs
  act APP_ID ACTION         approve | send | retry | cancel | remove | submitted | reopen
  send-ready                send every checked application that is ready
  answer "QUESTION" "ANSWER" [--job JOB_ID] [--ai]   save an answer (every job unless --job)
  dashboard                 write private/output/dashboard.html (open it in any browser)
  platform URL              which platform a link belongs to and how it's handled
  import-v1 PATH/job-finder.db   bring My info, jobs, boards and answers over from Job Finder v1
"""
from __future__ import annotations

import argparse
import json
import sys

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
    elif a.visa:
        where.append("visa=?")
        args.append(a.visa)
    if a.min:
        where.append("score>=?")
        args.append(a.min)
    for j in store.jobs(" and ".join(where), tuple(args), limit=a.limit):
        print(f"{j['id']}  {j['score']:>3}  {j['visa']:<15} {j['title'][:60]:<60}  {j['company'] or '':<24} {j['location'] or ''}")


def cmd_queue(a) -> None:
    sett = config.settings()
    check_first = sett.get("check_first", True) and not a.send
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
    for name in ("save", "dismiss"):
        x = sub.add_parser(name); x.add_argument("job_id")
    q = sub.add_parser("queue"); q.add_argument("job_ids", nargs="+"); q.add_argument("--send", action="store_true"); q.add_argument("--force", action="store_true")
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
    elif a.cmd in ("save", "dismiss"):
        store.set_job_status(a.job_id, "saved" if a.cmd == "save" else "dismissed")
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
    elif a.cmd == "dashboard":
        cmd_dashboard(a)
    elif a.cmd == "platform":
        cmd_platform(a)
    elif a.cmd == "import-v1":
        from . import import_v1

        print(import_v1.run(a.db))
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
