"""What a posting says about visas, its level and its state. Ported from v1 (src/lib/classify)."""
from __future__ import annotations

import re
from typing import Optional

NEG = r"(?:not|unable to|cannot|can't|can not|won't|will not|do not|does not|don't|are not able to|is not able to|no longer)"
CITIZEN = [re.compile(x, re.I) for x in [
    r"\b(?:u\.?s\.?|united states)\s+citizen(?:ship)?\s+(?:is\s+)?(?:required|needed|mandatory)",
    r"\bmust\s+(?:be|hold)\s+(?:a\s+)?(?:u\.?s\.?|united states)\s+(?:citizen|citizenship)",
    r"\b(?:only|exclusively)\s+(?:open\s+to\s+)?(?:u\.?s\.?|united states)\s+citizens",
    r"\b(?:u\.?s\.?|united states)\s+citizens?\s+only\b",
    r"\bcitizenship\s+is\s+required",
    r"\b(?:active|current|ability to obtain|eligib\w+ (?:for|to obtain)|obtain and maintain)\s+(?:a\s+|an\s+)?(?:u\.?s\.?\s+)?(?:government\s+)?(?:secret|top secret|ts/sci|ts|security|public trust)\s+clearance",
    r"\b(?:secret|top secret|ts/sci)\s+clearance\s+(?:is\s+)?(?:required|needed)",
    r"\bitar\b[^.]{0,120}\b(?:u\.?s\.? persons?|citizens?|permanent residents?)",
]]
NO_SPONSOR = [re.compile(x, re.I) for x in [
    rf"\b{NEG}\s+(?:currently\s+|presently\s+)?(?:be\s+able\s+to\s+)?sponsor",
    rf"\b{NEG}\s+(?:currently\s+)?(?:be\s+able\s+to\s+)?(?:provide|offer|support|consider|accommodate)\w*\s+(?:any\s+)?(?:[\w-]+\s+){{0,3}}(?:sponsorship|visas?)",
    r"\bwithout\s+(?:current\s+or\s+future\s+|requiring\s+|needing\s+)?(?:employer\s+|visa\s+|immigration\s+)?sponsorship",
    r"\bno\s+(?:visa\s+|h-?1b\s+|immigration\s+|employment\s+)?sponsorship\b",
    r"\bsponsorship\s+(?:is\s+|will\s+)?not\s+(?:be\s+)?(?:available|provided|offered|possible)",
    r"\bus work authorization required\b",
]]
SPONSORS = [re.compile(x, re.I) for x in [
    r"\b(?:visa|h-?1b|immigration|employment)\s+sponsorship\s+(?:is\s+|will\s+be\s+)?(?:available|offered|provided|possible|supported)",
    r"\b(?:able|willing|happy|glad)\s+to\s+sponsor\b",
    r"\bopen to (?:u\.?s\.?\s+)?visa sponsorship\b",
    r"\bwill sponsor\b",
    r"\boffers?\s+(?:visa\s+|h-?1b\s+)?sponsorship\b",
]]
OPT_CPT = [re.compile(x, re.I) for x in [
    r"\bus work authorization not required\b",
    r"\b(?:opt|cpt|stem opt|f-?1)\b[^.]{0,80}\b(?:welcome|eligible|encouraged|accepted|considered|supported|okay|ok)\b",
    r"\b(?:accepts?|open to|welcomes?)\s+(?:candidates\s+(?:on|with)\s+)?(?:opt|cpt|f-?1|international students)",
    r"\binternational students?\s+(?:are\s+)?(?:welcome|encouraged|eligible)",
]]


def _sentence(text: str, m: re.Match) -> str:
    start = max(text.rfind(".", 0, m.start()), text.rfind("\n", 0, m.start())) + 1
    end_dot = text.find(".", m.end())
    end = end_dot + 1 if end_dot != -1 else min(len(text), m.end() + 160)
    return text[start:end].strip()[:300]


def visa(text: str) -> tuple[str, Optional[str]]:
    """(sponsors | opt_cpt | unknown | no_sponsorship | citizens_only, the sentence that decided it)."""
    t = text or ""
    for status, pats in (("citizens_only", CITIZEN), ("no_sponsorship", NO_SPONSOR), ("sponsors", SPONSORS), ("opt_cpt", OPT_CPT)):
        for p in pats:
            m = p.search(t)
            if m:
                return status, _sentence(t, m)
    return "unknown", None


def level(title: str, description: str = "") -> str:
    t = (title or "").lower()
    if re.search(r"\bintern(ship)?\b|\bco-?op\b|summer (analyst|associate)", t):
        return "internship"
    if re.search(r"\b(new grad|graduate|entry|junior|associate|early career|analyst i\b)", t):
        return "entry"
    if re.search(r"\b(senior|sr\.?|staff|principal|lead|director|manager|head)\b", t):
        return "senior"
    years = re.search(r"(\d+)\+?\s*(?:years|yrs)", description or "", re.I)
    if years and int(years.group(1)) >= 5:
        return "senior"
    return "mid"


STATES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
    "DC": "District of Columbia", "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa",
    "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota",
    "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey",
    "NM": "New Mexico", "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon",
    "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
    "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
}
CITY_STATE = {"chicago": "IL", "new york": "NY", "san francisco": "CA", "seattle": "WA", "boston": "MA", "austin": "TX", "los angeles": "CA", "atlanta": "GA", "denver": "CO"}


def state(location: str) -> Optional[str]:
    loc = location or ""
    if re.search(r"\bremote\b", loc, re.I):
        return "Remote"
    m = re.search(r",\s*([A-Z]{2})\b", loc)
    if m and m.group(1) in STATES:
        return m.group(1)
    low = loc.lower()
    for code, name in STATES.items():
        if name.lower() in low:
            return code
    for city, code in CITY_STATE.items():
        if city in low:
            return code
    return None
