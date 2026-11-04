"""The answer engine: application form questions -> answers from your profile.

Ported from Job Finder v1 (src/lib/apply/answers.ts). Pure functions, no browser.
It is deliberately careful with legal questions: "authorized to work?",
"need sponsorship now?" and "need sponsorship now or in the future?" are three
different questions with three different honest answers for an F-1 student.

answer_fields(fields, profile, context) -> list of answers, one per field:
  {"key", "value" (str | bool | list[str] | None), "confidence" (high|medium|low),
   "rule", "note", "file" (resume|cover_letter|transcript), "needs_writing", "alts", "consent"}
value None = leave it for the owner (or for a written answer).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

# ------------------------------------------------------------------ helpers


@dataclass
class Field:
    key: str
    label: str
    type: str = "text"  # text textarea email tel number date month select radio checkbox combobox file
    options: list[str] = field(default_factory=list)
    required: bool = False
    placeholder: str = ""
    hint: str = ""  # element id/name, e.g. Greenhouse "school--0"
    multiple: bool = False


def normalize(label: str) -> str:
    s = label.lower().replace("*", " ").replace("✱", " ")
    s = re.sub(r"\((?:required|optional)\)", " ", s)
    return re.sub(r"\s+", " ", s).strip()


YES_RE = re.compile(r"^(?:yes|y|true|i am|i do|i will|i have|i can|i agree|authorized|eligible)\b", re.I)
NO_RE = re.compile(r"^(?:no|n|false|i am not|i'm not|i do not|i don't|i will not|i won't|i have not|i cannot|not)\b", re.I)
DECLINE_RE = re.compile(
    r"(decline|prefer not|do(?: not|n'?t) (?:wish|want)|not wish to|choose not|rather not|not to (?:say|answer|disclose|self)|wish not|undisclosed|not specified)",
    re.I,
)
STOP = set("a an and are as at be by can do does for from have how i if in is it me my of on or our please the this to us we what when where which who will with would you your".split())
FILLER = set("planning plan currently presently ever still also any there kindly share tell describe provide list indicate select enter".split())
GENERIC = set("university college school institute institution of the and degree degrees studies study program in at for".split())
ACK_OPTION = re.compile(
    r"^(acknowledged?|i acknowledge|i agree|agreed?|i accept|accept(ed)?|i understand|understood|i certify|certified|i consent|i confirm|confirm(ed)?|yes,? i (agree|understand|acknowledge|certify|accept|consent|confirm|have read))\b",
    re.I,
)
CONSENT_Q = re.compile(
    r"\bi (hereby )?certify|certify that|^i (accept|agree)\b|\bi understand that\b|\battest|by (checking|clicking|selecting|ticking|submitting)|i (have read|acknowledge|understand and agree|agree|consent)|\backnowledg|\bconsent\b|agree to|privacy (policy|notice|statement)|terms (and|&) conditions|terms of (use|service)|review (our|the) .{0,40}polic|accurate and complete|true,? (complete|correct|and accurate)"
)
MARKETING = re.compile(
    r"(newsletter|marketing|promotional|job alerts?|talent (community|network|pool)|future (job )?(opportunities|openings|roles)|keep (me|you) (informed|updated|in mind)|receive (emails?|updates|news|communications|offers))"
)
MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
OPEN_QUESTION = re.compile(
    r"\b(why|describe|tell us|explain|what (interests|excites|motivates|draws)|how would you|share (an|a|your)|walk us through|give an example|what makes you|anything else|additional information|in your own words|essay)\b"
)


def _words(s: str) -> list[str]:
    return [w for w in re.sub(r"[^a-z0-9+#. ]", " ", normalize(s)).split() if w]


def _stem(w: str) -> str:
    if len(w) > 5:
        return re.sub(r"(ing|ed|es|s)$", "", w)
    if len(w) > 3:
        return re.sub(r"s$", "", w)
    return w


def _content(s: str) -> set[str]:
    return {_stem(w) for w in _words(s) if w not in STOP and w not in FILLER}


def same_question(saved: str, asked: str) -> bool:
    """Same question in other words ("Will you attend NeurIPS in person?"), never a swapped key word ("…Python?" vs "…SQL?")."""
    a, b = _content(saved), _content(asked)
    if not a or not b:
        return False
    shared = len(a & b)
    if shared == len(a):
        return len(a) >= 2 or len(b) == 1
    return min(len(a), len(b)) >= 2 and shared / min(len(a), len(b)) >= 0.9


def _flat(s: str) -> str:
    return re.sub(r"[^a-z0-9+#]+", " ", re.sub(r"[.'’]", "", s.lower())).strip()


def _distinct(s: str) -> set[str]:
    return {x for x in _flat(s).split() if len(x) > 1 and x not in GENERIC and x not in STOP}


def _overlap(a: str, b: str) -> float:
    A, B = _distinct(a), _distinct(b)
    if not A or not B:
        return 0.0
    return len(A & B) / max(len(A), len(B))


def _real(options: list[str]) -> list[str]:
    return [o for o in options if o.strip() and not re.match(r"^(select|choose|please select|--)", o.strip(), re.I)]


def choose_option(options: list[str], wanted: str) -> Optional[str]:
    """The option that means `wanted` ("yes", "no", "decline" or any text)."""
    opts = _real(options)
    if not opts:
        return None
    w = wanted.strip().lower()
    if w == "yes":
        return next((o for o in opts if YES_RE.match(o.strip())), None)
    if w == "no":
        return next((o for o in opts if NO_RE.match(o.strip())), None)
    if w == "decline":
        return next((o for o in opts if DECLINE_RE.search(o)), None)
    exact = next((o for o in opts if o.strip().lower() == w), None)
    if exact:
        return exact
    fw = _flat(wanted)
    if len(fw) >= 4:
        has = lambda big, small: len(small) >= 4 and f" {small} " in f" {big} "
        hit = next((o for o in opts if has(_flat(o), fw)), None) or next((o for o in opts if has(fw, _flat(o)) and _distinct(o)), None)
        if hit:
            return hit
    best, score = None, 0.0
    for o in opts:
        s = _overlap(o, wanted)
        if s > score:
            best, score = o, s
    return best if score >= 0.6 else None


def is_choice(f: Field) -> bool:
    return f.type in ("select", "radio", "combobox") or (f.type == "checkbox" and len(f.options) > 1)


def A(value: Any, confidence: str = "high", note: str = "", **extra: Any) -> dict:
    return {"value": value, "confidence": confidence, "note": note, **extra}


def yn(v: str, confidence: str = "high", note: str = "") -> dict:
    return A(v, confidence, note) if v else A(None, "low", note or "Set this in your profile")


def text(v: str, confidence: str = "high", note: str = "") -> dict:
    return A(v, confidence, note) if v else A(None, "low", note or "Add this to your profile")


def pick_or_text(f: Field, wanted: list[str]) -> dict:
    """An option matching one of the wanted spellings; for type-to-search dropdowns, the text to type."""
    wanted = [w for w in wanted if w]
    if not wanted:
        return A(None, "low", "Add this to your profile")
    if is_choice(f) and f.options:
        opts = _real(f.options)
        for w in wanted:
            hit = next((o for o in opts if _flat(o) == _flat(w)), None)
            if hit:
                return A(hit)
        for w in wanted:
            hit = choose_option(opts, w)
            if hit and _overlap(hit, w) >= 0.99 or (hit and _flat(w) in _flat(hit)):
                return A(hit)
        if f.type == "combobox":
            return A(wanted[0], "high", alts=wanted[1:])
        for w in wanted:
            hit = choose_option(opts, w)
            if hit:
                return A(hit, "medium", f"Closest option to {w}")
        return A(None, "low", f"None of the options match {wanted[0]}")
    if f.type == "combobox":
        return A(wanted[0], "high", alts=wanted[1:])
    return A(wanted[0])


def month_year(ym: str) -> str:
    m = re.match(r"^(\d{4})-(\d{2})", ym or "")
    return f"{MONTH_NAMES[int(m.group(2)) - 1]} {m.group(1)}" if m else ym


def month_of(q: str) -> Optional[str]:
    m = re.search(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*,? (\d{4})\b", q)
    if not m:
        return None
    i = [n.lower()[:3] for n in MONTH_NAMES].index(m.group(1))
    return f"{m.group(2)}-{i + 1:02d}"


def degree_aliases(degree: str) -> list[str]:
    d = degree.strip()
    if not d:
        return []
    s = d.lower().replace(".", "").replace("'", "")
    out = [d]
    if re.match(r"^mba\b", s):
        out += ["MBA", "Master of Business Administration", "Master's Degree", "Masters"]
    elif re.match(r"^(ms|msc|mse|meng|ma|mfa|mph|mpp|master)", s):
        out += ["Master of Arts" if re.match(r"^ma\b", s) or "arts" in s else "Master of Science", "Master's Degree", "Masters Degree", "Master's", "Masters", "Master"]
    elif re.match(r"^(ba|ab|bs|bsc|bse|beng|bba|bachelor)", s):
        out += ["Bachelor of Arts" if re.match(r"^(ba|ab)\b", s) or "arts" in s else "Bachelor of Science", "Bachelor's Degree", "Bachelors Degree", "Bachelor's", "Bachelors", "Bachelor"]
    elif re.match(r"^(phd|doctor)", s):
        out += ["Doctor of Philosophy", "Ph.D.", "PhD", "Doctorate"]
    return list(dict.fromkeys(out))


def major_aliases(major: str) -> list[str]:
    m = major.strip()
    if not m:
        return []
    out = [m]
    w = m.split()
    if len(w) >= 3:
        out.append(" ".join(w[1:]))
    if re.match(r"^(applied|computational|quantitative) ", m, re.I):
        out.append(re.sub(r"^\S+ ", "", m))
    if re.search(r"\bdata science\b|\banalytics\b", m, re.I):
        out.append("Statistics")  # Greenhouse's discipline list has no Data Science; "Statistics & Decision Theory" is closest
    return list(dict.fromkeys(out))


def gpa_option(options: list[str], gpa: str) -> Optional[str]:
    try:
        g = float(gpa)
    except (TypeError, ValueError):
        return choose_option(options, "no gpa") or choose_option(options, "n/a")
    for o in options:
        s = re.sub(r"\s+", " ", o.lower())
        nums = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", s) if float(x) <= 5]
        if not nums:
            continue
        if len(nums) >= 2 and re.search(r"\d\s*(?:-|–|—|to|through)\s*\d", s):
            lo, hi = min(nums[:2]), max(nums[:2])
            if lo - 1e-9 <= g < hi + 0.005:
                return o
            continue
        if re.search(r"\+|above|or (higher|more|greater|above)|at least|greater than|over", s):
            if g >= nums[0] - 1e-9:
                return o
            continue
        if re.search(r"below|or (lower|less|under)|under|less than", s) and g < nums[0]:
            return o
    return None


def any_sponsorship(p: dict) -> str:
    if p.get("needsSponsorshipNow") == "yes" or p.get("needsSponsorshipLater") == "yes":
        return "yes"
    if p.get("needsSponsorshipNow") == "no" and p.get("needsSponsorshipLater") == "no":
        return "no"
    return ""


def opposite(v: str) -> str:
    return {"yes": "no", "no": "yes"}.get(v, "")


STATE_CODES = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA", "colorado": "CO", "connecticut": "CT",
    "delaware": "DE", "district of columbia": "DC", "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID", "illinois": "IL",
    "indiana": "IN", "iowa": "IA", "kansas": "KS", "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
    "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS", "missouri": "MO", "montana": "MT", "nebraska": "NE",
    "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC",
    "north dakota": "ND", "ohio": "OH", "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI",
    "south carolina": "SC", "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT", "vermont": "VT", "virginia": "VA",
    "washington": "WA", "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY",
}


def city_state(p: dict) -> list[str]:
    city, state = p.get("city", ""), p.get("state", "")
    if not city:
        return []
    code = STATE_CODES.get(state.strip().lower(), state)
    return list(dict.fromkeys(x for x in [f"{city}, {code}" if code else city, f"{city}, {state}" if state else "", f"{city}, {state}, {p.get('country', '')}".strip(", "), city] if x))


def eeo(f: Field, value: str) -> dict:
    if value and is_choice(f) and f.options:
        hit = choose_option(f.options, value)
        if hit:
            return A(hit)
    if value and not is_choice(f):
        return A(value)
    if is_choice(f):
        hit = choose_option(f.options, "decline")
        return A(hit, "high", "Voluntary; you chose not to say") if hit else A(None, "low", "Voluntary question")
    return A(None, "high", "Voluntary question")


# -------------------------------------------------------------------- rules

Rule = tuple[str, Callable[[str, Field], bool], Callable[[dict, Field, str, dict], Optional[dict]]]
R: list[Rule] = []


def rule(id: str, test: Callable[[str, Field], bool]):
    def deco(fn):
        R.append((id, test, fn))
        return fn
    return deco


s = re.search  # short alias inside the tests


@rule("resume-file", lambda q, f: f.type == "file" and bool(s(r"resume|\bcv\b|curriculum", q) or (s(r"resume|\bcv\b", f.hint or "") and not s(r"cover", q))))
def _(p, f, q, c):
    return A(None, "high", "Your resume", file="resume")


@rule("cover-letter-file", lambda q, f: f.type == "file" and bool(s(r"cover", q) or s(r"cover", f.hint or "")))
def _(p, f, q, c):
    return A(None, "high", "Your cover letter", file="cover_letter")


@rule("transcript-file", lambda q, f: f.type == "file" and bool(s(r"transcript", q) or s(r"transcript", f.hint or "")))
def _(p, f, q, c):
    return A(None, "high", "Your transcript", file="transcript")


@rule("other-file", lambda q, f: f.type == "file")
def _(p, f, q, c):
    return A(None, "low", "Attach this yourself (transcript, portfolio, …)")


WD_ROW = re.compile(r"^(workExperience|education)-(\d+)--(\w+?)(?:-dateSection(Month|Year))?(?:-input)?$")


@rule("workday-row", lambda q, f: bool(WD_ROW.match(f.hint or "")))
def _(p, f, q, c):
    """Workday's My Experience rows (workExperience-99--jobTitle, education-100--school…): row n = the n-th job or
    school in profile.yaml `experience` / `education` (from the resume), in the order the rows are on the page."""
    kind, rid, part, ym = WD_ROW.match(f.hint).groups()
    rows = c.get("wd_rows", {}).get(kind, [])
    items = p.get("experience" if kind == "workExperience" else "education") or []
    n = rows.index(rid) if rid in rows else -1
    if not 0 <= n < len(items):
        return A(None, "low", f"Add your {'jobs' if kind == 'workExperience' else 'schools'} to profile.yaml (experience/education)")
    it = items[n]
    if kind == "workExperience":
        value = {"jobTitle": it.get("title"), "companyName": it.get("company"), "location": it.get("location"),
                 "currentlyWorkHere": bool(it.get("current")), "roleDescription": None}.get(part, "__date__")
        if value == "__date__" and part in ("startDate", "endDate"):
            date = str(it.get("start" if part == "startDate" else "end") or "")
            if part == "endDate" and it.get("current"):
                return A(None, "high", "Left blank: you work there now")
            if not re.match(r"^\d{4}-\d{2}", date):
                return A(None, "low", "Add the dates to profile.yaml experience")
            return text(date[5:7] if ym == "Month" else date[:4])
        if part == "currentlyWorkHere":
            return A(value, "high")
        return A(value or None, "high" if value else "low", "" if value else "Left blank")
    if part in ("school", "schoolName"):
        return text(it.get("school") or "")
    if part == "degree":
        return pick_or_text(f, degree_aliases(it.get("degree") or ""))
    if part == "fieldOfStudy":
        return pick_or_text(f, major_aliases(it.get("major") or ""))
    if part == "gradeAverage":
        # "" clears what Workday guessed from the resume (it can copy another school's GPA onto this row)
        return A(it.get("gpa") or "", "high", "" if it.get("gpa") else "Left blank: no GPA for this school yet")
    if part in ("firstYearAttended", "lastYearAttended", "startDate", "endDate"):
        date = str(it.get("start" if part in ("firstYearAttended", "startDate") else "end") or "")
        return text(date[5:7] if ym == "Month" else date[:4]) if date else A(None, "low", "Add the dates")
    return A(None, "low", "")


@rule("education-row", lambda q, f: bool(re.match(r"^(school|degree|discipline|start-month|start-year|end-month|end-year)--\d+$", f.hint or "")))
def _(p, f, q, c):
    part, n = re.match(r"^([a-z-]+)--(\d+)$", f.hint).groups()
    rows = c.get("education_rows") or [int(n)]
    row = rows.index(int(n)) if int(n) in rows else 0
    if row == 0:
        e = dict(school=p.get("school", ""), degree=p.get("degree", ""), major=p.get("major", ""), start=p.get("schoolStart", ""), end=p.get("graduation", ""))
    elif row == 1:
        prev = p.get("previousDegree", "")
        e = dict(school=p.get("previousSchool", ""), degree=re.split(r",| in ", prev, flags=re.I)[0].strip(), major=p.get("previousMajor", ""), start=p.get("previousStart", ""), end=p.get("previousGraduation", ""))
    else:
        return A(None, "high", "Extra education row")
    if part == "school":
        return pick_or_text(f, [e["school"]])
    if part == "degree":
        return pick_or_text(f, degree_aliases(e["degree"]))
    if part == "discipline":
        return pick_or_text(f, major_aliases(e["major"]))
    date = e["start"] if part.startswith("start") else e["end"]
    m = re.match(r"^(\d{4})-(\d{2})", date or "")
    if not m:
        return A(None, "high" if part.startswith("start") else "low", "" if date else "Add the dates to your profile")
    return A(m.group(1)) if part.endswith("year") else pick_or_text(f, [MONTH_NAMES[int(m.group(2)) - 1]])


@rule("date-of-birth", lambda q, f: bool(s(r"date of birth|birth ?date|\bdob\b|when were you born", q)))
def _(p, f, q, c):
    return text(p.get("dateOfBirth", ""))


@rule("degree-by-date", lambda q, f: is_choice(f) and bool(s(r"\b(will|do) you (have|hold|complete|earn|finish)\b.{0,60}\bdegree\b|\bdegree\b.{0,40}\b(by|before) [a-z]+ \d{4}", q)) and bool(s(r"\b(19|20)\d{2}\b", q)))
def _(p, f, q, c):
    by, grad = month_of(q), p.get("graduation", "")
    if not by or not grad:
        return A(None, "low", "Add your graduation date")
    return yn("yes" if grad[:7] <= by else "no", "high", f"You graduate {month_year(grad)}")


@rule("full-time-start", lambda q, f: is_choice(f) and bool(s(r"\b(begin|start|available)\b.{0,50}\bfull[- ]time\b.{0,50}\b(before|by|after|in) [a-z]+ \d{4}", q)))
def _(p, f, q, c):
    by, grad = month_of(q), p.get("graduation", "")
    if not by or not grad:
        return A(None, "low", "Add your graduation date")
    ok = grad[:7] >= by if s(r"\bafter\b", q) else grad[:7] < by
    return yn("yes" if ok else "no", "high", f"You graduate {month_year(grad)}")


@rule("referred", lambda q, f: is_choice(f) and bool(s(r"\b(were|are) you (being )?referred\b|referral program", q)))
def _(p, f, q, c):
    if re.search(r"referr", p.get("hearAbout", ""), re.I):
        return A(None, "low", "Say who referred you")
    return yn("no", "high", f"You found it on {p.get('hearAbout') or 'your own'}")


@rule("residence-state", lambda q, f: not s(r"\b(city|town)\b", q) and bool(s(r"(what|which) (u\.? ?s\.? )?state\b.{0,40}\b(reside|live|located|based)\b|state of (current )?residence|state (do )?you (currently )?(live|reside)", q)))
def _(p, f, q, c):
    st = p.get("state", "")
    return pick_or_text(f, [st, STATE_CODES.get(st.lower(), "")]) if st else text("")


@rule("residence-city", lambda q, f: not is_choice(f) and bool(s(r"\b(city|town)\b.{0,30}\b(reside|live|located|based)\b|\b(reside|live|located|based)\b.{0,40}\b(city|state)\b|what city and state|city ?(and|&|/) ?state|current (city|residence)|where (do )?you (currently )?(live|reside)", q)))
def _(p, f, q, c):
    cs = city_state(p)
    return A(cs[0], "high", alts=cs[1:]) if cs else text("")


@rule("residence-country", lambda q, f: not s(r"authori[sz]ed|eligib|legally|permit|sponsor", q) and bool(s(r"country\b.{0,40}\b(reside|resident|live|living|located|residence|based)|\b(reside|live|located|based)\b.{0,40}\bcountry|country of (residence|current residence)", q)))
def _(p, f, q, c):
    return pick_or_text(f, [p.get("country", ""), "United States of America", "USA", "US"] if p.get("country") == "United States" else [p.get("country", "")])


@rule("employment-company", lambda q, f: not is_choice(f) and (bool(re.match(r"^company( name)?$", q)) or (bool(re.match(r"^(company|employer)", q)) and bool(s(r"company|employ", f.hint or "")))))
def _(p, f, q, c):
    return text(p.get("currentEmployer", ""))


@rule("employment-title", lambda q, f: not is_choice(f) and (bool(re.match(r"^(job )?title$", q)) or (bool(re.match(r"^title", q)) and "title" in (f.hint or ""))))
def _(p, f, q, c):
    return text(p.get("currentTitle", ""))


@rule("current-employer", lambda q, f: bool(s(r"(current|previous|most recent|recent|present|last)( or (previous|most recent|current|last))? (employer|company|organization)|who is your (current|previous|most recent) employer", q)))
def _(p, f, q, c):
    return text(p.get("currentEmployer", ""))


@rule("current-title", lambda q, f: bool(s(r"(current|previous|most recent|present|last)( or (previous|most recent|current|last))? (job |position |role )?title", q)))
def _(p, f, q, c):
    return text(p.get("currentTitle", ""))


@rule("offer-deadline", lambda q, f: bool(s(r"(offer|recruiting|recruitment|interview|application)[- ](process )?deadlines?|competing offers?|other (job |internship )?offers?|time[- ]sensitive", q)))
def _(p, f, q, c):
    d = p.get("offerDeadline", "")
    if d:
        return pick_or_text(f, [d, "No" if re.match(r"^no\b", d, re.I) else "Yes"]) if is_choice(f) and f.options else text(d)
    return yn("no", "medium", "Usually No: set Offer deadlines in your profile") if is_choice(f) else text("No", "medium")


@rule("text-messages", lambda q, f: (is_choice(f) or f.type == "checkbox") and bool(s(r"\b(sms|text messages?|texting|whatsapp)\b", q)))
def _(p, f, q, c):
    v = p.get("textMessages") or "no"
    return A(v == "yes", "high") if f.type == "checkbox" and not f.options else yn(v)


@rule("marketing-opt-in", lambda q, f: (is_choice(f) or f.type == "checkbox") and bool(MARKETING.search(q)))
def _(p, f, q, c):
    return A(False, "high", "Opt-ins stay off") if f.type == "checkbox" and not f.options else yn("no")


@rule("consent", lambda q, f: (f.type == "checkbox" or is_choice(f)) and (bool(CONSENT_Q.search(q)) or (bool(f.options) and all(ACK_OPTION.match(o.strip()) for o in _real(f.options)))))
def _(p, f, q, c):
    if not c.get("consent"):
        return A(None, "low", "Read this and tick it yourself, or allow consent in settings", consent=True)
    if f.type == "checkbox" and len(f.options) <= 1:
        return A(True, "high", "Ticked: you allowed consent", consent=True)
    opts = _real(f.options)
    hit = next((o for o in opts if ACK_OPTION.match(o.strip())), None) or choose_option(opts, "yes") or (opts[0] if len(opts) == 1 else None)
    return A([hit] if f.type == "checkbox" else hit, "high", consent=True) if hit else A(None, "low", "Pick the I agree option yourself", consent=True)


# ---- legal: order matters
@rule("sponsored-status", lambda q, f: bool(s(r"(currently|presently) (in|on|hold(ing)?) (one of )?(these|the following|a|any)? ?(sponsored|employer[- ]sponsored|work) (visa )?status", q)))
def _(p, f, q, c):
    v = p.get("visaStatus", "")
    return yn(("yes" if re.search(r"\b(h-?1b|o-?1|tn|e-?3|l-?1)\b", v, re.I) else "no") if v else "")


@rule("sponsorship", lambda q, f: "sponsor" in q and not s(r"without (?:the )?(?:need (?:for|of) )?(?:any |visa |employer |immigration )?sponsor", q) and bool(s(r"(require|need|will you|do you|would you|seek|request)", q)))
def _(p, f, q, c):
    now_only = s(r"\b(currently|now|at this time|to start)\b", q) and not s(r"future|later|or in the|at any (point|time)", q)
    return yn(p.get("needsSponsorshipNow", "")) if now_only else yn(any_sponsorship(p))


@rule("authorized-without-sponsorship", lambda q, f: bool(s(r"(authori[sz]ed|eligible|permitted|able|legally)\b.{0,60}\bwork\b", q)) and "without" in q and "sponsor" in q)
def _(p, f, q, c):
    if s(r"future|later|at any (point|time)|now or", q):
        return yn(opposite(any_sponsorship(p)))
    return yn(opposite(p.get("needsSponsorshipNow", "")), "medium", "Only true while you're on CPT/OPT; check the wording")


@rule("authorized", lambda q, f: bool(s(r"(legally )?(authori[sz]ed|eligible|permitted|entitled|right) to (?:lawfully )?work", q)) or (bool(s(r"work authori[sz]ation", q)) and bool(s(r"(do you|have|are you|valid)", q))))
def _(p, f, q, c):
    return yn(p.get("authorizedToWork", ""))


@rule("visa-status", lambda q, f: bool(s(r"(visa|immigration|work authori[sz]ation|citizenship) (status|type)|type of (visa|work authori[sz]ation)|current visa", q)))
def _(p, f, q, c):
    v = p.get("visaStatus", "")
    if not v:
        return text("")
    if is_choice(f) and f.options:
        f1 = next((o for o in f.options if re.search(r"\bf-?1\b", o, re.I)), None) if re.search(r"f-?1", v, re.I) else None
        hit = f1 or choose_option(f.options, v)
        if hit:
            return A(hit)
        alt = (choose_option(f.options, "student visa") if re.search(r"f-?1", v, re.I) else None) or choose_option(f.options, "other")
        return A(alt, "medium") if alt else A(None, "low", f"Pick the option for {v}")
    return A(v)


@rule("us-citizen", lambda q, f: bool(s(r"\b(u\.?s\.?|united states|american) citizen", q)) and "country of citizenship" not in q)
def _(p, f, q, c):
    return yn(p.get("usCitizen", ""))


@rule("permanent-resident", lambda q, f: bool(s(r"permanent resident|green card|lawful permanent", q)))
def _(p, f, q, c):
    return yn(p.get("permanentResident", ""))


@rule("export-control", lambda q, f: bool(s(r"\b(u\.?s\.? person|itar|ear\b|export control|deemed export)", q)))
def _(p, f, q, c):
    v = p.get("usPerson") or ("yes" if "yes" in (p.get("usCitizen"), p.get("permanentResident")) else "no" if p.get("usCitizen") == "no" else "")
    return yn(v, "medium")


@rule("citizenship-country", lambda q, f: bool(s(r"country of citizenship|citizenship|nationality", q)))
def _(p, f, q, c):
    return pick_or_text(f, [p.get("citizenship", "")])


@rule("age", lambda q, f: bool(s(r"\b(18|eighteen)\b.{0,30}(years|age|older)|at least 18|over 18|legal age", q)))
def _(p, f, q, c):
    return yn(p.get("over18") or "yes")


# ---- where and how
@rule("location-preference", lambda q, f: bool(s(r"prefer(red)? (office|location|city|work location)|location preference|office preference|which (of our )?(office|location|city)|office location|desired (work )?location|where would you (like|prefer) to (work|be based)", q)))
def _(p, f, q, c):
    wanted = [w.strip() for w in re.split(r"[;\n]", p.get("preferredLocations", "")) if w.strip()]
    if not wanted:
        return text("", "low", "Add your preferred locations")
    if is_choice(f) and f.options:
        for w in wanted:
            hit = choose_option(f.options, w) or choose_option(f.options, w.split(",")[0])
            if hit:
                return A(hit)
        open_ = next((o for o in f.options if re.search(r"\b(any|all) (of (the|your|our) )?(office|location|city|site)s?\b|open to (any|all|working)|no preference|flexible|anywhere", o, re.I)), None)
        if open_:
            sure = p.get("willingToRelocate") == "yes"
            return A(open_, "high" if sure else "medium", "" if sure else "Set Willing to relocate in your profile")
        return A(None, "low", f"None of the options match {', '.join(wanted)}")
    return A("; ".join(wanted))


@rule("relocate", lambda q, f: "relocat" in q)
def _(p, f, q, c):
    return yn(p.get("willingToRelocate", ""))


@rule("travel", lambda q, f: bool(s(r"willing(ness)? to travel|able to travel|travel (up to|requirement)|\btravel\b.{0,20}%", q)))
def _(p, f, q, c):
    return yn(p.get("willingToTravel", ""))


# ---- contact
@rule("first-name", lambda q, f: not is_choice(f) and bool(s(r"(^|your )(legal )?first name|given name|^first$", q)))
def _(p, f, q, c):
    if s(r"preferred", f.hint or ""):  # Workday: the Preferred Name section's "First Name" (id name--preferredName--firstName)
        return text(p.get("preferredName") or p.get("firstName", ""))
    return text(p.get("firstName", ""))


@rule("last-name", lambda q, f: not is_choice(f) and bool(s(r"(^|your )(legal )?last name|surname|family name|^last$", q)))
def _(p, f, q, c):
    return text(p.get("lastName", ""))


@rule("preferred-name", lambda q, f: not is_choice(f) and bool(s(r"preferred (first )?name|nickname|name you go by", q)))
def _(p, f, q, c):
    return A(p.get("preferredName") or p.get("firstName") or None, "high")


@rule("full-name", lambda q, f: not is_choice(f) and bool(s(r"^(full |legal )?name$|full name|your name", q)))
def _(p, f, q, c):
    return text(" ".join(x for x in [p.get("firstName"), p.get("lastName")] if x))


@rule("email", lambda q, f: not is_choice(f) and f.type != "checkbox" and (f.type == "email" or bool(s(r"e-?mail", q))))
def _(p, f, q, c):
    return text(p.get("email", ""))


@rule("phone-extension", lambda q, f: not is_choice(f) and bool(s(r"\bextension\b|\bext\.?$", q) or s(r"extension", f.hint or "")))
def _(p, f, q, c):
    return A("", "high", "Left blank: no extension")  # "" also clears a number an earlier run put there


@rule("phone", lambda q, f: not is_choice(f) and f.type != "checkbox" and (f.type == "tel" or bool(s(r"phone|mobile|cell", q))))
def _(p, f, q, c):
    return text(p.get("phone", ""))


@rule("linkedin", lambda q, f: "linkedin" in q)
def _(p, f, q, c):
    v = (p.get("linkedin") or "").strip()
    if v and not re.match(r"https?://", v):  # some forms (Workday) only take a full address
        v = "https://www." + v.removeprefix("www.")
    return text(v)


@rule("github", lambda q, f: bool(s(r"github|git hub", q)))
def _(p, f, q, c):
    return A(p.get("github") or None, "high" if p.get("github") else "low")


@rule("website", lambda q, f: bool(s(r"website|portfolio|personal (site|url)", q)) and f.type != "file")
def _(p, f, q, c):
    v = p.get("website") or p.get("linkedin")
    return A(v or None, "medium" if v and not p.get("website") else "high")


@rule("street", lambda q, f: f.type not in ("radio", "checkbox") and len(q) < 80 and bool(s(r"street|address line 1|^address( 1)?$|mailing address|home address", q)))
def _(p, f, q, c):
    return text(p.get("street", ""))


@rule("address2", lambda q, f: f.type not in ("radio", "checkbox") and len(q) < 80 and bool(s(r"address line 2|\bapt\b|apartment|suite|\bunit\b", q)))
def _(p, f, q, c):
    return A(p.get("street2") or None, "high")


@rule("city", lambda q, f: bool(s(r"^city|town", q)))
def _(p, f, q, c):
    return text(p.get("city", ""))


@rule("state", lambda q, f: bool(s(r"^(state|province|region)|state/province|state or province", q)) and "united states" not in q)
def _(p, f, q, c):
    st = p.get("state", "")
    return pick_or_text(f, [st, STATE_CODES.get(st.lower(), "")])


@rule("zip", lambda q, f: f.type not in ("radio", "checkbox") and len(q) < 80 and bool(s(r"zip|postal", q)))
def _(p, f, q, c):
    return text(p.get("zip", ""))


@rule("country", lambda q, f: bool(s(r"^country|country of residence|country/region", q)))
def _(p, f, q, c):
    return pick_or_text(f, [p.get("country", ""), "United States of America", "USA"] if p.get("country") == "United States" else [p.get("country", "")])


@rule("location", lambda q, f: bool(s(r"^location|current location|where are you (located|based)", q)))
def _(p, f, q, c):
    cs = city_state(p)
    return A(cs[0], "high", alts=cs[1:]) if cs else text("")


# ---- education
@rule("enrolled", lambda q, f: is_choice(f) and bool(s(r"currently (enrolled|pursuing|a student)|are you (a )?(current )?student", q)))
def _(p, f, q, c):
    grad = p.get("graduation", "")
    if grad and f.options and any(re.search(r"master|doctor|bachelor|\bdegree\b", o, re.I) for o in _real(f.options)):
        # "Enrolled in one of: Master's Degree (e.g. MS) / Doctoral / I am not currently enrolled…": pick the degree, never the "not enrolled" line
        opts = [o for o in _real(f.options) if not re.search(r"\bnot\b", o, re.I)]
        hit = next((o for w in degree_aliases(p.get("degree", "")) for o in opts if _flat(w) in _flat(o)), None)
        return A(hit, "high") if hit else A(None, "low", "Pick the program you're enrolled in")
    return yn("yes" if grad else "", "high")


@rule("school", lambda q, f: bool(s(r"\b(school|university|college|institution)\b", q)) and not s(r"high school|graduat", q))
def _(p, f, q, c):
    return pick_or_text(f, [p.get("school", "")])


@rule("degree", lambda q, f: bool(s(r"degree|level of education|highest education", q)))
def _(p, f, q, c):
    return pick_or_text(f, degree_aliases(p.get("degree", "")))


@rule("major", lambda q, f: bool(s(r"major|field of study|discipline|concentration|area of study", q)))
def _(p, f, q, c):
    if s(r"secondary|dual|double|second major|minor", q):
        return A(None, "high", "Left blank: only your main field is in the profile")
    if s(r"undergrad|bachelor", q):
        return pick_or_text(f, major_aliases(p.get("previousMajor", "")))
    return pick_or_text(f, major_aliases(p.get("major", "")))


@rule("gpa", lambda q, f: bool(s(r"\bgpa\b|grade point", q)))
def _(p, f, q, c):
    g = p.get("gpa", "")
    if is_choice(f) and f.options:
        hit = gpa_option(f.options, g)
        return A(hit) if hit else A(None, "low", "No GPA option matches")
    return text(g)


@rule("graduation", lambda q, f: bool(s(r"graduat|completion date|expected (date|to complete)|when do you expect to (complete|finish)", q)))
def _(p, f, q, c):
    g = p.get("graduation", "")
    if not g:
        return text("")
    if f.type == "month":
        return A(g[:7])
    if is_choice(f) and f.options:
        hit = choose_option(f.options, month_year(g)) or choose_option(f.options, g[:4])
        return A(hit, "medium") if hit else A(None, "low", f"Pick the option for {month_year(g)}")
    if s(r"\byear\b", q) and "month" not in q:
        return A(g[:4])
    return A(month_year(g))


@rule("start-date", lambda q, f: bool(s(r"start date|when can you start|available to start|earliest (start|date)", q)))
def _(p, f, q, c):
    return text(p.get("startDate", "") and (month_year(p["startDate"]) if f.type not in ("date", "month") else p["startDate"]), "medium")


@rule("availability", lambda q, f: bool(s(r"availability|which term|semester|season", q)))
def _(p, f, q, c):
    return pick_or_text(f, [p.get("availability", "")])


@rule("salary", lambda q, f: bool(s(r"salary|compensation|pay (expectation|requirement)|desired pay", q)))
def _(p, f, q, c):
    return A(p.get("salaryExpectation") or None, "medium" if p.get("salaryExpectation") else "low", "" if p.get("salaryExpectation") else "Say what you expect, or leave it for you")


RACE_BOX = r"american indian|alaska native|\basian\b|black or african|native hawaiian|pacific islander|two or more races|\bwhite\b|declined? to answer|prefer not to (say|answer)|do not wish to"


@rule("race-box", lambda q, f: f.type == "checkbox" and not f.options and len(q) < 90 and bool(s(RACE_BOX, q)))
def _(p, f, q, c):
    """Race shown as one checkbox per category (Workday's Voluntary Disclosures): tick yours, leave the rest."""
    race = (p.get("race") or "").strip()
    if not race:
        return A(bool(s(r"declined? to answer|prefer not|do not wish", q)), "high", "Your race isn't set: declined")
    return A(bool(re.search(rf"\b{re.escape(race)}\b", q, re.I)) and not s(r"two or more", q), "high")


@rule("moving-from", lambda q, f: not is_choice(f) and bool(s(r"city,? state,? (and )?zip|(city|where).{0,40}moving from|relocat\w* from", q)))
def _(p, f, q, c):
    from .classify import STATES
    st = next((k for k, v in STATES.items() if v.lower() == str(p.get("state", "")).lower()), p.get("state", ""))
    v = " ".join(x for x in [f"{p.get('city', '')}, {st}".strip(", "), str(p.get("zip") or "")] if x)
    return text(v) if p.get("city") else A(None, "low", "Add your city to profile.yaml")


R.insert(0, R.pop())  # before the relocation rule: "tell us the city, state and zip you'd be moving from"


@rule("sponsorship-countries", lambda q, f: not is_choice(f) and bool(s(r"(locations|countries).{0,60}require sponsorship|require sponsorship.{0,40}(locations|countries)", q)))
def _(p, f, q, c):
    return text("United States") if any_sponsorship(p) else text("N/A")


R.insert(0, R.pop())


@rule("sponsorship-type", lambda q, f: not is_choice(f) and bool(s(r"(describe|what|which|explain).{0,40}(type|kind) of (visa )?sponsorship|type of sponsorship", q)))
def _(p, f, q, c):
    v = p.get("visaStatus") or ""
    if not v:
        return A(None, "low", "Set your visa status in profile.yaml")
    later = re.match(r"^y", str(p.get("needsSponsorshipLater", "")), re.I)
    return text(f"{v} now; I would need H-1B sponsorship for full-time work after graduation." if later else f"{v}.")


R.insert(0, R.pop())  # before the yes/no sponsorship rule


@rule("phone-type", lambda q, f: bool(s(r"phone (device )?type|type of phone", q)))
def _(p, f, q, c):
    return pick_or_text(f, ["Mobile", "Cell", "Mobile Phone"]) if p.get("phone") else A(None, "low", "Add your phone to profile.yaml")


@rule("hear-about", lambda q, f: bool(s(r"how did you (hear|find|learn)|where did you (hear|find|learn)|source of (application|referral)|referral source", q)))
def _(p, f, q, c):
    return pick_or_text(f, [p.get("hearAbout") or "LinkedIn", "Job board", "Online", "Other"])


@rule("worked-here", lambda q, f: bool(s(r"(worked|employed) (for|at|by|with) (us|this company|[a-z]+) before|previously (been )?(worked|employed)|former employee|ever (worked|been employed) (at|for|by|with)", q)))
def _(p, f, q, c):
    return yn(p.get("workedHereBefore") or "no", "high" if p.get("workedHereBefore") else "medium")


@rule("relatives", lambda q, f: bool(s(r"related to|relative|family member", q)) and bool(s(r"employ|work", q)))
def _(p, f, q, c):
    return yn(p.get("relatedToEmployee") or "no", "high" if p.get("relatedToEmployee") else "medium")


@rule("non-compete", lambda q, f: bool(s(r"non-?compete|non-?solicit|restrictive (covenant|agreement)|post-employment", q)))
def _(p, f, q, c):
    return yn(p.get("restrictiveAgreement") or "no", "high" if p.get("restrictiveAgreement") else "medium")


@rule("client-relationship", lambda q, f: bool(s(r"(worked|work) (for|with) (one of )?our clients?|client relationship", q)))
def _(p, f, q, c):
    return yn(p.get("clientRelationship") or "no", "high" if p.get("clientRelationship") else "medium")


@rule("languages", lambda q, f: bool(s(r"languages? (do you|you) (speak|know)|language proficiency|what languages", q)))
def _(p, f, q, c):
    langs = [x.strip() for x in re.split(r"[;\n,]", p.get("languages", "")) if x.strip()]
    if is_choice(f) and f.options:
        hits = [h for h in (choose_option(f.options, l.split("(")[0].strip()) for l in langs) if h]
        return A(hits if f.multiple or f.type == "checkbox" else (hits[0] if hits else None), "high" if hits else "low")
    return text("; ".join(langs))


# ---- voluntary self-identification
@rule("eeo-transgender", lambda q, f: bool(s(r"transgender|sex assigned at birth", q)))
def _(p, f, q, c):
    return eeo(f, "")


@rule("eeo-gender", lambda q, f: bool(s(r"\bgender\b|\bsex\b", q)))
def _(p, f, q, c):
    return eeo(f, p.get("gender", ""))


@rule("eeo-hispanic", lambda q, f: bool(s(r"hispanic|latin[oax]", q)))
def _(p, f, q, c):
    v = (p.get("hispanicLatino") or "").strip()
    if f.type == "checkbox" and not f.options:  # one box among the race boxes: tick it only if you are
        return A(bool(re.match(r"^yes\b", v, re.I)), "high")
    if re.match(r"^(no|not)\b", v, re.I) and is_choice(f):
        return pick_or_text(f, ["No", "Not Hispanic or Latino", "Not Hispanic or Latinx", "I am not Hispanic or Latino"])
    if re.match(r"^yes\b", v, re.I) and is_choice(f):
        return pick_or_text(f, ["Yes", "Hispanic or Latino", "Hispanic or Latinx"])
    return eeo(f, v)


@rule("eeo-race", lambda q, f: bool(s(r"\brac(e|ial)\b|ethnicit", q)))
def _(p, f, q, c):
    return eeo(f, p.get("race", ""))


@rule("eeo-veteran", lambda q, f: bool(s(r"veteran|military service|armed forces", q)))
def _(p, f, q, c):
    v = p.get("veteran", "")
    if re.match(r"^no\b", v, re.I) and is_choice(f):
        # Never "I identify as a veteran, just not a protected veteran": that one says you ARE a veteran.
        opts = [o for o in f.options if not re.search(r"identify as (a|one)", o, re.I)]
        hit = (next((o for o in opts if re.search(r"\bnot a veteran\b|i am not a veteran", o, re.I)), None)
               or next((o for o in opts if re.search(r"i am not a protected veteran|\bnot a protected veteran\b", o, re.I)), None)
               or next((o for o in opts if re.match(r"^no\b", o, re.I)), None))
        if hit:
            return A(hit)
        if not f.options:  # choices not read yet (a Workday list): name the right one, never a bare "No"
            return A("I am not a veteran", "high", alts=["I am not a protected veteran"])
    return eeo(f, v)


@rule("eeo-disability", lambda q, f: bool(s(r"disabilit", q)))
def _(p, f, q, c):
    v = p.get("disability", "")
    if re.match(r"^no\b", v, re.I) and is_choice(f):
        hit = next((o for o in f.options if re.search(r"no,? i (do not|don't) have", o, re.I)), None) or choose_option(f.options, "no")
        if hit:
            return A(hit)
    return eeo(f, v)


@rule("cover-letter-text", lambda q, f: f.type == "textarea" and bool(s(r"cover letter", q)))
def _(p, f, q, c):
    letter = c.get("cover_letter")
    return A(letter, "medium", "Your cover letter: read it before it's sent") if letter else A(None, "low", "Needs a cover letter", needs_writing=True)


# ------------------------------------------------------------------ entry


def answer_fields(fields: list[Field], profile: dict, context: Optional[dict] = None) -> list[dict]:
    """One answer per field, from saved answers first, then the rules."""
    ctx = dict(context or {})
    rows = sorted({int(m.group(1)) for f in fields if (m := re.match(r"^school--(\d+)$", f.hint or ""))})
    ctx["education_rows"] = rows
    wd: dict[str, list[str]] = {}
    for f in fields:  # Workday rows in page order
        m = WD_ROW.match(f.hint or "")
        if m and m.group(2) not in wd.setdefault(m.group(1), []):
            wd[m.group(1)].append(m.group(2))
    ctx["wd_rows"] = wd
    saved = list(ctx.get("saved") or []) + list(profile.get("custom") or [])
    out = []
    for f in fields:
        q = normalize(f"{f.label} {f.placeholder}".strip())
        # the same wording first; a looser match ("Field of Study" vs "major or field of study") only after
        hit = next((x for x in saved if normalize(x["question"]) == q), None) or next((x for x in saved if same_question(x["question"], q)), None)
        if hit and f.type != "file":
            value = choose_option(f.options, hit["answer"]) if is_choice(f) and f.options else hit["answer"]
            if f.type == "checkbox" and not f.options:
                value = bool(YES_RE.match(str(hit["answer"])))
            if value not in (None, ""):
                ai = hit.get("source") == "ai"
                out.append({"key": f.key, "value": value, "confidence": "medium" if ai else "high", "rule": "saved-ai-answer" if ai else "saved-answer", "note": "Written by AI: read it before it's sent" if ai else ""})
                continue
        answered = None
        for rid, test, fn in R:
            if not test(q, f):
                continue
            a = fn(profile, f, q, ctx)
            if a is None:
                continue
            v = a.get("value")
            if isinstance(v, list) and not (f.multiple or f.type == "checkbox"):
                a["value"] = v[0] if v else None
            if a.get("value") in ("yes", "no") and is_choice(f) and f.options:
                hit = choose_option(f.options, a["value"])
                a = {**a, "value": hit} if hit else {**a, "value": None, "confidence": "low", "note": f"No {a['value']} option"}
            if a.get("value") in ("yes", "no") and f.type == "checkbox" and not f.options:
                a["value"] = a["value"] == "yes"
            answered = {"key": f.key, "rule": rid, **a}
            break
        if answered is None:
            open_q = f.type == "textarea" or bool(OPEN_QUESTION.search(q))
            answered = {"key": f.key, "value": None, "confidence": "low", "rule": "open-question" if open_q else "unknown", "note": "Needs a written answer" if open_q else "Not in your profile", "needs_writing": open_q}
        out.append(answered)
    return out
