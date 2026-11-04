"""Writes the dashboard: one self-contained HTML file (no server) from the local data."""
from __future__ import annotations

import json
import time

from . import classify, config, geo, platforms, store

JOB_KEYS = ("id", "title", "company", "location", "url", "apply_url", "platform", "score", "visa", "visa_note", "level", "state", "status", "posted_at",
            "created_at", "updated_at", "industry", "role_type", "job_type", "workplace", "years", "pay")


# My info: profile.yaml shown by section (profile.yaml stays the source; the page only reads it).
INFO_SECTIONS = [
    ("Name and contact", [("firstName", "First name"), ("middleName", "Middle name"), ("lastName", "Last name"), ("preferredName", "Preferred name"),
                          ("pronouns", "Pronouns"), ("email", "Email"), ("phone", "Phone"), ("linkedin", "LinkedIn"), ("github", "GitHub"), ("website", "Website")]),
    ("Address", [("street", "Street"), ("street2", "Street, line 2"), ("city", "City"), ("state", "State"), ("zip", "ZIP"), ("country", "Country"), ("dateOfBirth", "Date of birth")]),
    ("Education", [("school", "School"), ("degree", "Degree"), ("major", "Major"), ("gpa", "GPA"), ("schoolStart", "Started"), ("graduation", "Graduation"),
                   ("previousSchool", "Previous school"), ("previousDegree", "Previous degree"), ("previousMajor", "Previous major"), ("previousStart", "Started"), ("previousGraduation", "Graduated")]),
    ("Work", [("currentEmployer", "Current employer"), ("currentTitle", "Current title"), ("languages", "Languages")]),
    ("Work authorization", [("authorizedToWork", "Authorized to work in the US"), ("needsSponsorshipNow", "Needs sponsorship to start"),
                            ("needsSponsorshipLater", "Needs sponsorship now or later (H-1B)"), ("visaStatus", "Visa status"), ("citizenship", "Citizenship"),
                            ("usCitizen", "US citizen"), ("permanentResident", "Green card"), ("usPerson", "U.S. person (ITAR/EAR)"), ("hasClearance", "Security clearance"), ("over18", "Over 18")]),
    ("Where and when", [("preferredLocations", "Preferred locations"), ("workArrangement", "Work arrangement"), ("willingToRelocate", "Willing to relocate"),
                        ("willingToTravel", "Willing to travel"), ("startDate", "Can start"), ("availability", "Availability"), ("salaryExpectation", "Pay expectation"),
                        ("offerDeadline", "Offer deadlines"), ("hearAbout", "How you heard about jobs")]),
    ("Voluntary self-identification", [("gender", "Gender"), ("hispanicLatino", "Hispanic or Latino"), ("race", "Race"), ("veteran", "Veteran"), ("disability", "Disability")]),
    ("Standard declarations", [("workedHereBefore", "Worked at the company before"), ("relatedToEmployee", "Related to an employee"),
                               ("restrictiveAgreement", "Non-compete or similar"), ("clientRelationship", "Worked with their clients"), ("textMessages", "Text-message updates")]),
]


def my_info() -> dict:
    prof = config.profile()
    shown = {k for _, fields in INFO_SECTIONS for k, _ in fields} | {"custom"}
    sections = [{"title": t, "fields": [[label, str(prof.get(k) or "")] for k, label in fields]} for t, fields in INFO_SECTIONS]
    extra = [[k, str(v)] for k, v in prof.items() if k not in shown and not isinstance(v, (list, dict))]
    if extra:
        sections.append({"title": "Other", "fields": extra})
    with store.db() as con:
        saved = [dict(r) for r in con.execute("select question, answer, source from answers where job_id is null order by created_at desc")]
        per_job = con.execute("select count(*) from answers where job_id is not null").fetchone()[0]
    custom = [[c.get("question", ""), str(c.get("answer", ""))] for c in prof.get("custom") or [] if isinstance(c, dict)]
    files = sorted(f.name for f in config.FILES.glob("*") if f.is_file()) if config.FILES.exists() else []
    return {"sections": sections, "custom": custom, "saved": saved, "per_job": per_job, "files": files,
            "path": str(config.PRIVATE / "profile.yaml")}


def snapshot() -> dict:
    store.reclassify()
    apps = store.applications(limit=2000)
    jobs = {j["id"]: j for j in store.jobs(limit=2000)}
    # Jobs you saved, applied to or queued are always in, even outside the top 2,000.
    ids = [a["job_id"] for a in apps if a.get("job_id") and a["job_id"] not in jobs]
    if ids:
        jobs.update({j["id"]: j for j in store.jobs(f"id in ({','.join('?' * len(ids))})", tuple(ids), limit=len(ids))})
    jobs.update({j["id"]: j for j in store.jobs("status != 'new'", limit=2000) if j["id"] not in jobs})
    places: dict[str, list] = {}
    slim_jobs = []
    h1b = store.h1b_for([j.get("company_key") or "" for j in jobs.values()])
    for j in jobs.values():
        p = geo.places(j.get("location") or "", j.get("state") or "")
        for pl in p["places"]:
            places.setdefault(pl["label"], [pl["x"], pl["y"], pl["state"], int(pl["city"])])
        h = h1b.get(j.get("company_key") or "")
        slim_jobs.append({**{k: j.get(k) for k in JOB_KEYS}, "pl": [pl["label"] for pl in p["places"]], "remote": p["remote"],
                          "h1b": [h["total_approvals"], h["fiscal_year"], h["name"]] if h else None})
    slim_apps = [{**{k: a.get(k) for k in ("id", "job_id", "title", "company", "url", "platform", "status", "summary", "needs", "checks", "page_note", "created_at", "updated_at", "check_only")},
                  "through": platforms.detect(a["url"])["name"] if a.get("url") else ""} for a in apps]
    tracked = [j["id"] for j in jobs.values() if j.get("status") not in (None, "new")]
    return {"generated": time.strftime("%Y-%m-%d %H:%M"), "generated_at": time.time(), "labels": store.LABELS, "jobs": slim_jobs,
            "applications": slim_apps, "activity": store.activity(60), "places": places, "map": geo.map_shapes(),
            "events": store.job_events(tracked), "track_labels": store.TRACK_LABELS, "industries": classify.INDUSTRIES, "roles": classify.ROLE_TYPES,
            "info": my_info(), "letters": sorted(f.stem.removeprefix("cover-letter-") for f in config.FILES.glob("cover-letter-*.pdf")) if config.FILES.exists() else []}


def render(live: bool = False, token: str = "") -> str:
    """The dashboard page. live = served by `serve` (buttons work; token guards its POSTs)."""
    tpl = (config.ROOT / "dashboard" / "template.html").read_text()
    data = json.dumps({**snapshot(), "live": live, "token": token}).replace("</", "<\\/")
    return tpl.replace("/*__DATA__*/null", data)


def write(path=None):
    path = path or (config.OUTPUT / "dashboard.html")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render())
    return path
