"""Offline places for job locations: "Chicago, IL", "Seattle, WA; SF; NYC", "Cary,North Carolina,United States",
"US - Missouri" or "Remote - United States" -> US cities (or states) with their spot on the dashboard's map.

The map data is built once by scripts/build_map_data.mjs: dashboard/geo/us-cities.json is
[name, state, x, y, population, bare] with x/y on the 975x610 Albers USA drawing in us-states.json.
"bare" = the biggest place with that name anywhere, so "Denver" alone is found but "London" needs a state.
"""
from __future__ import annotations

import json
import re
import unicodedata
from functools import lru_cache
from typing import Optional

from . import config

GEO = config.ROOT / "dashboard" / "geo"

STATES = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA", "colorado": "CO",
    "connecticut": "CT", "delaware": "DE", "district of columbia": "DC", "florida": "FL", "georgia": "GA",
    "hawaii": "HI", "idaho": "ID", "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
    "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD", "massachusetts": "MA",
    "michigan": "MI", "minnesota": "MN", "mississippi": "MS", "missouri": "MO", "montana": "MT",
    "nebraska": "NE", "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
    "new york": "NY", "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK",
    "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
    "tennessee": "TN", "texas": "TX", "utah": "UT", "vermont": "VT", "virginia": "VA", "washington": "WA",
    "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY",
}
CODES = set(STATES.values())
ALIASES = {
    "nyc": "new york city", "new york": "new york city", "manhattan": "new york city", "brooklyn": "new york city",
    "sf": "san francisco", "sf bay area": "san francisco", "bay area": "san francisco", "san francisco bay area": "san francisco",
    "dc": "washington, d.c.", "washington dc": "washington, d.c.", "washington d.c.": "washington, d.c.",
    "saint louis": "st. louis", "st louis": "st. louis", "saint paul": "st. paul", "st paul": "st. paul",
    "ft lauderdale": "fort lauderdale", "ft. lauderdale": "fort lauderdale", "la": "los angeles",
}
US_WORDS = {"us", "usa", "u.s.", "u.s.a.", "united states", "united states of america", "america"}
FILLER = re.compile(r"^(remote|hybrid|on-?site|in[- ]office|office|flexible|anywhere|multiple locations|\d+ locations?)$", re.I)
REMOTE = re.compile(r"\b(remote|anywhere|work from home|wfh|distributed|virtual)\b", re.I)


def fold(s: str) -> str:
    s = unicodedata.normalize("NFD", s)
    return re.sub(r"\s+", " ", "".join(c for c in s if not unicodedata.combining(c))).lower().strip(" .")


_ALIASES = {fold(k): v for k, v in ALIASES.items()}


@lru_cache(maxsize=1)
def _cities() -> dict[str, list[list]]:
    idx: dict[str, list[list]] = {}
    for row in json.loads((GEO / "us-cities.json").read_text()):
        idx.setdefault(fold(row[0]), []).append(row)
    for rows in idx.values():
        rows.sort(key=lambda r: -r[4])
    return idx


@lru_cache(maxsize=1)
def _states() -> dict:
    return json.loads((GEO / "us-states.json").read_text())


def map_shapes() -> dict:
    return _states()


def _state(tok: str) -> Optional[str]:
    t = tok.strip()
    if len(t) == 2 and t.upper() in CODES and (t.isupper() or t.lower() not in ("in", "or", "me", "hi", "ok", "oh", "la", "al", "pa")):
        return t.upper()
    return STATES.get(fold(t))


def _city(name: str, state: Optional[str], us: bool) -> Optional[list]:
    key = fold(name)
    key = _ALIASES.get(key, key)
    if state == "DC" and key == "washington":
        key = "washington, d.c."
    rows = _cities().get(fold(key)) or []
    if state:
        rows = [r for r in rows if r[1] == state]
        return rows[0] if rows else None
    return next((r for r in rows if r[5] or us), None)


def _label(row: list) -> str:
    name = {"New York City": "New York", "Washington, D.C.": "Washington"}.get(row[0], row[0])
    return f"{name}, {row[1]}"


def places(location: str, state_hint: str = "") -> dict:
    """-> {"places": [{"label", "x", "y", "state", "city": bool}], "remote": bool}. State-only places sit at the
    state's middle. Places outside the US (and cities that need a state to be sure) are left out."""
    text = location or ""
    out: dict[str, dict] = {}
    centroid = {s["code"]: s["c"] for s in _states()["states"]}
    names = {s["code"]: s["name"] for s in _states()["states"]}

    def add_city(row: list) -> None:
        out.setdefault(_label(row), {"label": _label(row), "x": row[2], "y": row[3], "state": row[1], "city": True})

    def add_state(code: str) -> None:
        if code in centroid and not any(p["state"] == code for p in out.values()):
            out[code] = {"label": names[code], "x": centroid[code][0], "y": centroid[code][1], "state": code, "city": False}

    for seg in re.split(r"\s*(?:;|•|·|\||\n|/| or | and |&)\s*", text):
        seg = re.sub(r"\([^)]*\)", " ", seg)
        seg = re.sub(r"^\s*(remote|hybrid|on-?site|in[- ]office)\s*[-–:]\s*", "", seg, flags=re.I)
        if re.match(r"^\s*US[A]?-[A-Z]{2}-", seg):  # "US-IL-Chicago"
            seg = ", ".join(reversed(seg.split("-", 2)))
        toks = [t.strip() for t in re.split(r"\s*,\s*|\s+[-–]\s+", seg) if t.strip()]
        us = any(fold(t) in US_WORDS for t in toks)
        toks = [t for t in toks if fold(t) not in US_WORDS and not FILLER.match(t)]
        i = 0
        while i < len(toks):
            tok = toks[i]
            nxt = _state(toks[i + 1]) if i + 1 < len(toks) else None
            row = _city(tok, nxt, us) if nxt else None
            if row:
                add_city(row)
                i += 2
                continue
            st = _state(tok)
            # "New York" alone or "Washington" alone are cities more often than states.
            row = _city(tok, None, us) if not st or fold(tok) in ("new york", "washington") else None
            if row:
                add_city(row)
            elif st:
                add_state(st)
            i += 1
    if not out and state_hint in centroid:
        add_state(state_hint)
    # A state that also has one of its cities on the list adds nothing.
    for code in [k for k, p in out.items() if not p["city"] and any(q["city"] and q["state"] == p["state"] for q in out.values())]:
        del out[code]
    return {"places": list(out.values()), "remote": bool(REMOTE.search(text))}
