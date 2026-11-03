"""Which platform a URL belongs to (from platforms/registry.json) and where its application form is."""
from __future__ import annotations

import functools
import json
import re
from typing import Any, Optional
from urllib.parse import parse_qs, quote, urlencode, urlparse, urlunparse

from . import config

JOB_SITES = re.compile(r"(^|\.)(linkedin\.com|joinhandshake\.com|indeed\.com|glassdoor\.com|ziprecruiter\.com|simplify\.jobs|wellfound\.com)$", re.I)


@functools.lru_cache(maxsize=1)
def registry() -> list[dict[str, Any]]:
    return json.loads((config.ROOT / "platforms" / "registry.json").read_text())["platforms"]


def by_id(pid: str) -> Optional[dict[str, Any]]:
    return next((p for p in registry() if p["id"] == pid), None)


def detect(url: str) -> dict[str, Any]:
    """The platform entry for a URL; the "custom" entry when no host matches."""
    host = (urlparse(url).hostname or "").lower().removeprefix("www.")
    for p in registry():
        if any(re.search(h, host) for h in p["hosts"]):
            return p
    q = parse_qs(urlparse(url).query)
    if "gh_jid" in q:
        return by_id("greenhouse")
    return by_id("custom")


def _greenhouse_form(u, board: Optional[str]) -> Optional[str]:
    eu = ".eu" if u.hostname and u.hostname.endswith(".eu.greenhouse.io") else ""
    q = parse_qs(u.query)
    if u.hostname and u.hostname.endswith("greenhouse.io"):
        if u.path.startswith("/embed/job_app"):
            return urlunparse(u)
        m = re.match(r"^/(?:embed/job_app/)?([^/]+)/jobs/(\d+)", u.path)
        if m:
            return f"https://job-boards{eu}.greenhouse.io/embed/job_app?for={quote(m.group(1))}&token={m.group(2)}"
        token, jid = (q.get("for") or [board])[0], (q.get("token") or q.get("gh_jid") or [None])[0]
        return f"https://job-boards{eu}.greenhouse.io/embed/job_app?{urlencode({'for': token, 'token': jid})}" if token and jid else None
    if "gh_jid" in q and board:
        return f"https://job-boards.greenhouse.io/embed/job_app?{urlencode({'for': board, 'token': q['gh_jid'][0]})}"
    return None


def application_url(url: str, apply_url: Optional[str] = None, board: Optional[str] = None) -> tuple[Optional[str], str]:
    """(form URL, reason). The form URL is None when only a job-site link (LinkedIn, Handshake…) is known."""
    for raw in [x for x in (apply_url, url) if x and re.match(r"^https?://", x, re.I)]:
        u = urlparse(raw)
        host = (u.hostname or "").removeprefix("www.")
        if JOB_SITES.search(host):
            continue
        gh = _greenhouse_form(u, board)
        if gh:
            return gh, "greenhouse form"
        if re.search(r"(^|\.)lever\.co$", host):
            m = re.match(r"^/([^/]+)/([0-9a-f-]{36})(/apply)?", u.path, re.I)
            if m:
                return f"https://{u.hostname}/{m.group(1)}/{m.group(2)}/apply", "lever form"
        if host == "jobs.ashbyhq.com":
            m = re.match(r"^/([^/]+)/([0-9a-f-]{36})(/application)?", u.path, re.I)
            if m:
                return f"https://jobs.ashbyhq.com/{m.group(1)}/{m.group(2)}/application", "ashby form"
        return raw, "company link"
    site = (urlparse(url).hostname or "").removeprefix("www.") if url else ""
    return None, f"Only a {site} link so far: open the job there and save the company's own apply link." if site else "No application link."


def queue_blocker(url: str, description: str = "") -> Optional[str]:
    """Why the driver can't finish this posting alone (it is skipped when queued), or None."""
    p = detect(url)
    if p["automation"] == "manual":
        return f"{p['name']}: apply there yourself (automation isn't allowed or possible)"
    d = re.sub(r"\s+", " ", description or "").lower()
    if re.search(r"\b(record|submit|send|upload|include)\b.{0,60}\bvideo\b|\b\d{2,3}[–-]\d{2,3} ?second video\b|\bvideo (submission|introduction|response) (is )?required\b", d):
        return "The posting asks for a video you record yourself"
    if re.search(r"\brequired\b.{0,200}\b(send|email) (this|it|your [a-z ]{0,30}) to [\w.+-]+@[\w-]+\.[a-z.]+", d) or re.search(r"\b(send|email) your (resume|application|portfolio|writing sample|video)\b.{0,40}\bto [\w.+-]+@", d):
        return "The posting asks you to email something yourself"
    return None
