"""Scores a posting 0-100 against a saved search (titles, keywords, level, places)."""
from __future__ import annotations

import re
from typing import Any

from . import classify


def score(job: dict[str, Any], search: dict[str, Any]) -> tuple[int, list[str]]:
    title = (job.get("title") or "").lower()
    text = f"{title} {(job.get('description') or '').lower()}"
    reasons: list[str] = []
    pts = 0
    titles = [t.lower() for t in search.get("titles", [])]
    best = max((len(set(t.split()) & set(re.findall(r"[a-z0-9+#]+", title))) / max(1, len(t.split())) for t in titles), default=0)
    if best:
        pts += int(45 * best)
        reasons.append(f"title {int(best * 100)}% match")
    kws = [k.lower() for k in search.get("keywords", [])]
    hits = [k for k in kws if re.search(rf"(^|[^a-z0-9+#]){re.escape(k)}($|[^a-z0-9+#])", text)]
    if kws:
        pts += int(25 * min(1, len(hits) / max(3, len(kws) / 3)))
        if hits:
            reasons.append("keywords: " + ", ".join(hits[:6]))
    lv = job.get("level") or classify.level(job.get("title", ""), job.get("description", ""))
    if lv in search.get("levels", ["internship", "entry"]):
        pts += 15
        reasons.append(lv)
    elif lv == "senior":
        pts -= 20
        reasons.append("senior")
    places = [p.lower() for p in search.get("locations", [])]
    loc = (job.get("location") or "").lower()
    if not places or any(p.split(",")[0] in loc for p in places) or ("remote" in loc and search.get("include_remote", True)):
        pts += 15
        reasons.append("location fits")
    if job.get("visa") in ("no_sponsorship", "citizens_only"):
        pts -= 30
        reasons.append(f"visa: {job['visa']}")
    return max(0, min(100, pts)), reasons
