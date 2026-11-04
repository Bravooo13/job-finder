"""Runs one application in a real browser: fill, check, submit by your settings, watch the outcome.

Order (the lessons of the first live run, see ../../CLAUDE.md):
1. Open the form and let the site's own autofill finish (a signed-in MyGreenhouse rebuilds fields).
2. Read the fields, answer them (answers.py), attach the files FIRST and wait: Greenhouse reads the
   resume and rebuilds the education rows. If the form changed, read and answer it again.
3. Fill everything else over the site's guesses; fill again what the page cleared (twice at most).
4. decide(): needs you / hold / submit. Check-only runs never submit (they end "ready").
5. After Submit, never press it again on its own: thank-you -> submitted; a code, CAPTCHA or errors
   -> needs you (window left open); nothing clear -> unsure ("Sent? Check").
"""
from __future__ import annotations

import os
import re
import time
from pathlib import Path
from typing import Any, Optional, Protocol

from .. import answers as engine
from .. import config, platforms, store
from . import outcome, sites


class Driver(Protocol):
    def open(self, url: str) -> None: ...
    def scan(self) -> list[dict]: ...
    def shape(self) -> str: ...
    def states(self, fields: list[dict]) -> dict[str, dict]: ...
    def fill(self, field: dict, answer: dict, files: dict[str, Path]) -> bool: ...
    def probe(self) -> dict: ...
    def click_submit(self) -> bool: ...
    def click_text(self, pattern: str) -> bool: ...
    def wait(self, seconds: float) -> None: ...
    def keep_open(self) -> None: ...
    def new_page(self) -> None: ...
    def close_page(self) -> None: ...
    def finish(self) -> None: ...


def settle(d: Driver, min_s: float = 2.5, quiet_s: float = 1.5, max_s: float = 12) -> None:
    """Waits until the form stops changing."""
    start = time.time()
    last_shape, last_change = d.shape(), time.time()
    while time.time() - start < max_s:
        d.wait(0.25)
        now = d.shape()
        if now != last_shape:
            last_shape, last_change = now, time.time()
        if time.time() - start >= min_s and time.time() - last_change >= quiet_s:
            return


def _files(job_id: Optional[str]) -> dict[str, Path]:
    out = {}
    for kind, names in (("resume", ["resume.pdf", "Resume.pdf"]), ("cover_letter", [f"cover-letter-{job_id}.pdf"]), ("transcript", ["transcript.pdf"])):
        for n in names:
            p = config.FILES / n
            if p.exists():
                out[kind] = p
                break
    return out


LETTER_NEED = "Write a cover letter for this job"
LETTER_OFF = "This form requires a cover letter (cover_letters: never in settings)"


def letter_needed(rep: list[dict], files: dict[str, Path], sett: dict) -> Optional[str]:
    """Whether this form needs a cover letter written for it, by the cover_letters setting."""
    boxes = [f for f in rep if f.get("rule") == "cover-letter-file" and not f.get("filled")]
    if not boxes or "cover_letter" in files:
        return None
    required = any(f.get("required") for f in boxes)
    mode = sett.get("cover_letters", "required")
    if mode == "never":
        return LETTER_OFF if required else None
    return LETTER_NEED if required or mode == "always" else None


def fill_page(d: Driver, app: dict, prof: dict, sett: dict, files: dict[str, Path]) -> tuple[list[dict], list[dict]]:
    """Fills the current page. Returns (fields, answers)."""
    fields = d.scan()
    scanned = d.shape()
    ctx = {"consent": sett.get("consent"), "saved": store.saved_answers(app.get("job_id")), "company": app.get("company"), "jobTitle": app.get("title")}

    def answer(fs: list[dict]) -> list[dict]:
        objs = [engine.Field(key=f["key"], label=f["label"], type=f["type"], options=f.get("options") or [], required=f.get("required", False), placeholder=f.get("placeholder", ""), hint=f.get("hint", ""), multiple=bool(f.get("multiple"))) for f in fs]
        return engine.answer_fields(objs, prof, ctx)

    ans = answer(fields)
    by_key = {f["key"]: f for f in fields}
    attached = False
    uploaded = getattr(sites.for_platform(app.get("platform") or ""), "has_upload", lambda _d: False)(d)
    for a in ans:
        if a.get("file") and a["file"] in files and not (uploaded and a["file"] == "resume"):  # Workday kept it from last time
            attached |= d.fill(by_key[a["key"]], a, files)
    if attached or d.shape() != scanned:
        settle(d)
    if d.shape() != scanned:  # the site rebuilt part of the form: read it again
        fields = d.scan()
        ans = answer(fields)
        by_key = {f["key"]: f for f in fields}
    for a in ans:
        if not a.get("file") and a.get("value") is not None:
            ok = d.fill(by_key[a["key"]], a, files)
            # a choice that couldn't be picked: flag it, even if the page still shows an older (maybe wrong) value
            a["fill_failed"] = ok is False and by_key[a["key"]].get("kind") in ("listbutton", "wdprompt")
            d.wait(0.06)
    # Fields that appeared because of an answer (Workday's "I have a preferred name" opens a section): fill those too.
    settle(d, min_s=1.0, quiet_s=0.6, max_s=5)
    if d.shape() != scanned:
        seen = {f.get("id") or f["label"] for f in fields}
        fields2 = d.scan()
        new = [f for f in fields2 if (f.get("id") or f["label"]) not in seen]
        if new:
            ans2 = answer(new)
            by2 = {f["key"]: f for f in fields2}
            for a in ans2:
                if not a.get("file") and a.get("value") is not None:
                    d.fill(by2[a["key"]], a, files)
                    d.wait(0.06)
            keep = {f.get("id") or f["label"] for f in new}
            old = {a["key"]: a for a in ans}
            # Report on the page as it is now: the new fields' answers plus the earlier ones, matched by id or label.
            prev = {(f.get("id") or f["label"]): old.get(f["key"]) for f in fields}
            ans = [a for a in ans2] + [{**prev[f.get("id") or f["label"]], "key": f["key"]} for f in fields2
                                        if (f.get("id") or f["label"]) not in keep and prev.get(f.get("id") or f["label"])]
            fields = fields2
            by_key = by2
    for _ in range(2):  # fields a React page cleared after another field changed
        st = d.states(fields)
        cleared = [a for a in ans if not a.get("file") and a.get("value") is not None and not st.get(a["key"], {}).get("filled")]
        if not cleared:
            break
        d.wait(0.5)
        for a in cleared:
            d.fill(by_key[a["key"]], a, files)
    return fields, ans


def report_fields(fields: list[dict], ans: list[dict], states: dict[str, dict]) -> list[dict]:
    by = {a["key"]: a for a in ans}
    out = []
    for f in fields:
        a, s = by.get(f["key"], {}), states.get(f["key"], {})
        # A box deliberately left unticked (the answer was No) is answered, not missing.
        filled = (bool(s.get("filled")) or (f["type"] == "checkbox" and a.get("value") is False and not s.get("gone"))) and not a.get("fill_failed")
        out.append({"label": f["label"], "type": f["type"], "required": f.get("required", False), "filled": filled, "value": s.get("value", ""),
                    "options": [o for o in (f.get("options") or []) if not re.match(r"^(select one|select|--)$", o, re.I)][:15],
                    "confidence": a.get("confidence", "high") if a.get("value") is not None else ("medium" if s.get("filled") and a.get("rule") in ("unknown", "open-question") else "high"),
                    "ai": a.get("rule") == "saved-ai-answer", "consent": bool(a.get("consent")), "rule": a.get("rule")})
    return out


def run(app: dict, d: Driver) -> dict:
    """Runs one claimed application and returns the stored result."""
    prof, sett = config.profile(), config.settings()
    files = _files(app.get("job_id"))
    platform = platforms.by_id(app.get("platform") or "") or platforms.detect(app["url"])
    site = sites.for_platform(platform["id"])
    d.open(app["url"])
    settle(d)
    held = site.start(d, app, sett, prof)
    if held:
        d.keep_open()
        return store.report(app["id"], "needs_you", summary=held["summary"], needs=held["needs"])
    settle(d)
    first = d.probe()
    if (first.get("password") and site.id != "workday") or site.needs_sign_in(d):
        d.keep_open()
        return store.report(app["id"], "needs_you", summary=f"{platform['name']} wants you to sign in (or make an account) first. Do it in the open browser window; the profile keeps you signed in. Then retry.", needs=[f"Sign in to {platform['name']}"])
    all_fields: list[dict] = []
    dump = os.environ.get("JOBFINDER_DUMP")
    for page in range(site.max_pages):
        fields, ans = fill_page(d, app, prof, sett, files)
        if dump and hasattr(d, "dump"):
            d.dump(os.path.join(dump, f"{app['id']}-page{page + 1}"))
        states = d.states(fields)
        rep = report_fields(fields, ans, states)
        if not fields and site.max_pages > 1 and not site.is_last_page(d):  # a page with no form (not Review): never "complete"
            errs = site.page_errors(d) or [f"{platform['name']} page {page + 1} showed no form"]
            d.keep_open()
            return store.report(app["id"], "needs_you", summary=f"{platform['name']}: {errs[0]}", needs=errs, answers=_answers(all_fields))
        all_fields += rep
        blockers = ["Tick the \"I'm not a robot\" box"] if d.probe().get("robotBox") else []
        letter = letter_needed(rep, files, sett)
        if letter:  # the agent writes it (`letters`, then `letter JOB FILE`), which retries the application
            blockers.append(letter)
            rep_d = [f for f in rep if f.get("rule") != "cover-letter-file"]
        else:
            rep_d = rep
        decision = outcome.decide(sett["submit"], rep_d, approved=bool(app.get("approved")), blockers=blockers)
        if decision["action"] == "needs_you":
            d.keep_open()
            return store.report(app["id"], "needs_you", summary=decision["summary"], needs=decision["needs"], checks=decision["checks"], answers=_answers(all_fields))
        if site.is_last_page(d) or page == site.max_pages - 1:
            break
        if not site.next_page(d):
            errs = site.page_errors(d)
            if errs:  # the page didn't move on: say exactly what it wants
                d.keep_open()
                return store.report(app["id"], "needs_you", summary=f"{platform['name']} page {page + 1} wants: {'; '.join(errs[:3])}", needs=errs, answers=_answers(all_fields))
            break
        settle(d, min_s=1.5)
    # Sites that hand over at Review (Workday) submit only an application the owner approved (`act APP approve`).
    if app.get("check_only") or decision["action"] == "hold" or app.get("submit_pressed_at") or (not site.may_submit and not app.get("approved")):
        d.keep_open()
        summary = decision["summary"] if site.may_submit else f"Filled up to {platform['name']}'s review page. Look it over and submit it yourself."
        return store.report(app["id"], "held", summary=summary, checks=decision["checks"], answers=_answers(all_fields))
    return submit_and_watch(app, d, decision, all_fields, site)


def _answers(rep: list[dict]) -> list[dict]:
    return [{"label": r["label"][:300], "value": str(r.get("value", ""))[:500], "confidence": r.get("confidence", "high"), "required": r.get("required", False)} for r in rep]


def submit_and_watch(app: dict, d: Driver, decision: dict, rep: list[dict], site=None) -> dict:
    store.report(app["id"], "submitting", summary="Pressing Submit…")
    before = d.probe()
    if not (site.submit(d) if site else d.click_submit()):
        d.keep_open()
        return store.report(app["id"], "held", summary="Couldn't find the Submit button.", answers=_answers(rep))
    last = None
    new_fields = lambda now: [k.split("|")[1] or k.split("|")[0] for k in now.get("inputs", []) if k not in before.get("inputs", [])]
    for i in range(30):
        d.wait(1.5)
        now = d.probe()
        last = now
        moved = now["url"] != before["url"]
        if (now["thanks"] and (not before["thanks"] or moved)) or (moved and now["thanksUrl"]) or (moved and now["fields"] == 0 and not now["errors"]):
            return store.report(app["id"], "submitted", summary="Submitted: a thank-you page showed.", checks=decision["checks"], answers=_answers(rep))
        note = " · ".join(x for x in [now.get("note"), f"New fields: {', '.join(new_fields(now)[:5])}" if new_fields(now) else "", f"Messages: {'; '.join(now['errors'][:3])}" if now["errors"] else ""] if x)
        if now["code"] and not (now["thanks"] and not before["thanks"]) and (not before["code"] or new_fields(now)):
            d.keep_open()
            return store.report(app["id"], "needs_you", summary="The site emailed you a code. Type it in the open window and press Submit, then mark it submitted.", needs=["Type the code the site emailed you and press Submit"], page_note=note, answers=_answers(rep))
        if now["captcha"]:
            d.keep_open()
            return store.report(app["id"], "needs_you", summary="A CAPTCHA appeared after Submit. Solve it in the open window and press Submit, then mark it submitted.", needs=["Solve the CAPTCHA and press Submit"], page_note=note, answers=_answers(rep))
        if i >= 3 and now["errors"] and not moved:
            d.keep_open()
            return store.report(app["id"], "needs_you", summary=f"The form wasn't accepted: {'; '.join(now['errors'][:3])}", needs=now["errors"], page_note=note, answers=_answers(rep))
    d.keep_open()
    note = (last or {}).get("note", "")
    return store.report(app["id"], "held", summary="Pressed Submit but no thank-you page showed.", page_note=note, answers=_answers(rep))  # -> unsure


def run_queue(driver, limit: int = 20, finish: bool = True) -> list[dict]:
    """Claims queued applications one at a time in one browser, each in its own tab, with the pause
    from settings between them. Tabs that need you stay open; the browser stays until you close it."""
    results = []
    sett = config.settings()
    for n in range(limit):
        app = store.claim_next()
        if not app:
            break
        driver.new_page()
        try:
            results.append(run(app, driver))
        except Exception as e:  # noqa: BLE001 - report it, keep going
            cur = store.application(app["id"]) or {}
            after_submit = cur.get("status") == "submitting" or cur.get("submit_pressed_at")
            results.append(store.report(app["id"], "held" if after_submit else "failed", summary=f"{type(e).__name__}: {e}"[:500]))
            driver.keep_open()
        driver.close_page()
        if n < limit - 1 and store.applications({"queued"}):
            time.sleep(max(5, int(sett.get("pause_seconds", 20))))
    if finish:
        driver.finish()
    return results
