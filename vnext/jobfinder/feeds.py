"""Public job feeds (no login, no scraping of signed-in pages).

Each feed returns postings: {"url", "apply_url", "title", "company", "location", "description",
"posted_at", "platform", "source"}. The endpoints are in platforms/registry.json; this file
implements the ones marked verified/documented. Add a platform: write `def <id>(token, ...)` and
add it to FEEDS.
"""
from __future__ import annotations

import html as htmllib
import json
import random
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from typing import Any, Callable, Iterable, Optional

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"


def _get(url: str, data: Optional[dict] = None, timeout: int = 20) -> Any:
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, headers={"User-Agent": UA, "Accept": "application/json, text/html;q=0.9", **({"Content-Type": "application/json"} if body else {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read().decode("utf-8", "replace")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw


def text_of(html: Optional[str]) -> str:
    if not html:
        return ""
    s = re.sub(r"<(br|/p|/li|/div|/h\d)\b[^>]*>", "\n", html, flags=re.I)
    s = re.sub(r"<li\b[^>]*>", "• ", s, flags=re.I)
    s = htmllib.unescape(re.sub(r"<[^>]+>", " ", s))
    return re.sub(r"[ \t]+", " ", re.sub(r"\n\s*\n+", "\n\n", s)).strip()


def P(platform: str, **kw: Any) -> dict[str, Any]:
    return {"platform": platform, "source": platform, **kw}


# ------------------------------------------------------------------ ATS feeds

def greenhouse(token: str, company: str = "") -> list[dict]:
    d = _get(f"https://boards-api.greenhouse.io/v1/boards/{urllib.parse.quote(token)}/jobs?content=true")
    return [P("greenhouse", url=j.get("absolute_url") or f"https://boards.greenhouse.io/{token}/jobs/{j['id']}", title=j.get("title"),
              company=company or token, location=(j.get("location") or {}).get("name"), description=text_of(htmllib.unescape(j.get("content") or "")),
              posted_at=j.get("updated_at"), board=token) for j in d.get("jobs", [])]


def lever(token: str, company: str = "", eu: bool = False) -> list[dict]:
    api = "https://api.eu.lever.co/v0/postings" if eu else "https://api.lever.co/v0/postings"
    d = _get(f"{api}/{urllib.parse.quote(token)}?mode=json")
    return [P("lever", url=p.get("hostedUrl"), apply_url=p.get("applyUrl"), title=p.get("text"), company=company or token,
              location=(p.get("categories") or {}).get("location"), description=p.get("descriptionPlain") or text_of(p.get("description")),
              posted_at=time.strftime("%Y-%m-%d", time.gmtime((p.get("createdAt") or 0) / 1000))) for p in (d if isinstance(d, list) else [])]


def ashby(token: str, company: str = "") -> list[dict]:
    d = _get(f"https://api.ashbyhq.com/posting-api/job-board/{urllib.parse.quote(token)}?includeCompensation=true")
    return [P("ashby", url=j.get("jobUrl"), apply_url=j.get("applyUrl"), title=j.get("title"), company=company or token, location=j.get("location"),
              description=j.get("descriptionPlain") or text_of(j.get("descriptionHtml")), posted_at=j.get("publishedAt")) for j in d.get("jobs", [])]


def smartrecruiters(token: str, company: str = "") -> list[dict]:
    out, offset = [], 0
    while offset < 500:
        d = _get(f"https://api.smartrecruiters.com/v1/companies/{urllib.parse.quote(token)}/postings?limit=100&offset={offset}")
        for p in d.get("content", []):
            loc = p.get("location") or {}
            out.append(P("smartrecruiters", url=f"https://jobs.smartrecruiters.com/{token}/{p['id']}", title=p.get("name"), company=company or (p.get("company") or {}).get("name") or token,
                         location=", ".join(x for x in [loc.get("city"), loc.get("region")] if x), posted_at=p.get("releasedDate")))
        if len(d.get("content", [])) < 100:
            break
        offset += 100
    return out


def workday(host: str, tenant: str, site: str, company: str = "", search: str = "", limit: int = 100) -> list[dict]:
    base = f"https://{host}/wday/cxs/{tenant}/{site}"
    out, offset = [], 0
    while offset < limit:
        d = _get(f"{base}/jobs", {"appliedFacets": {}, "limit": 20, "offset": offset, "searchText": search})
        posts = d.get("jobPostings", []) if isinstance(d, dict) else []
        for p in posts:
            out.append(P("workday", url=f"https://{host}/{site}{p['externalPath']}", title=p.get("title"), company=company or tenant, location=p.get("locationsText"), posted_at=p.get("postedOn")))
        if len(posts) < 20:
            break
        offset += 20
    return out


def workable(account: str, company: str = "") -> list[dict]:
    d = _get(f"https://apply.workable.com/api/v3/accounts/{urllib.parse.quote(account)}/jobs", {"query": "", "location": [], "department": [], "worktype": [], "remote": []})
    return [P("workable", url=f"https://apply.workable.com/{account}/j/{j['shortcode']}/", title=j.get("title"), company=company or account,
              location=", ".join(x for x in [(j.get("location") or {}).get("city"), (j.get("location") or {}).get("region")] if x), posted_at=j.get("published")) for j in d.get("results", [])]


def recruitee(company_slug: str, company: str = "") -> list[dict]:
    d = _get(f"https://{company_slug}.recruitee.com/api/offers/")
    return [P("recruitee", url=o.get("careers_url"), apply_url=o.get("careers_apply_url"), title=o.get("title"), company=company or o.get("company_name") or company_slug,
              location=o.get("location"), description=text_of(o.get("description")), posted_at=o.get("published_at")) for o in d.get("offers", [])]


def breezy(company_slug: str, company: str = "") -> list[dict]:
    d = _get(f"https://{company_slug}.breezy.hr/json")
    return [P("breezy", url=j.get("url"), title=j.get("name"), company=company or company_slug, location=(j.get("location") or {}).get("name"), posted_at=j.get("published_date")) for j in (d if isinstance(d, list) else [])]


def bamboohr(company_slug: str, company: str = "") -> list[dict]:
    d = _get(f"https://{company_slug}.bamboohr.com/careers/list")
    return [P("bamboohr", url=f"https://{company_slug}.bamboohr.com/careers/{j['id']}", title=j.get("jobOpeningName"), company=company or company_slug,
              location=", ".join(x for x in [(j.get("location") or {}).get("city"), (j.get("location") or {}).get("state")] if x)) for j in (d.get("result", []) if isinstance(d, dict) else [])]


def pinpoint(company_slug: str, company: str = "") -> list[dict]:
    d = _get(f"https://{company_slug}.pinpointhq.com/postings.json")
    return [P("pinpoint", url=j.get("url"), title=j.get("title"), company=company or company_slug, location=(j.get("location") or {}).get("name"), description=text_of(j.get("description"))) for j in d.get("data", [])]


def personio(company_slug: str, company: str = "") -> list[dict]:
    raw = _get(f"https://{company_slug}.jobs.personio.de/xml?language=en")
    out = []
    for pos in ET.fromstring(raw).iter("position"):
        g = lambda tag: (pos.findtext(tag) or "").strip()
        out.append(P("personio", url=f"https://{company_slug}.jobs.personio.de/job/{g('id')}", title=g("name"), company=company or company_slug, location=g("office"), posted_at=g("createdAt")))
    return out


def simplify(repo: str = "Summer2027-Internships", days: int = 30) -> list[dict]:
    """SimplifyJobs lists on GitHub: internships and new-grad roles with a sponsorship field. URLs point at the company's ATS."""
    d = _get(f"https://raw.githubusercontent.com/SimplifyJobs/{repo}/dev/.github/scripts/listings.json", timeout=60)
    cutoff = time.time() - days * 86400
    out = []
    for l in d if isinstance(d, list) else []:
        if not l.get("active") or l.get("is_visible") is False or (l.get("date_posted") or 0) < cutoff:
            continue
        spons = (l.get("sponsorship") or "").lower()
        out.append({"platform": None, "source": "simplify", "url": l.get("url"), "title": l.get("title"), "company": l.get("company_name"),
                    "location": "; ".join(l.get("locations") or []), "posted_at": time.strftime("%Y-%m-%d", time.gmtime(l.get("date_posted") or 0)),
                    "visa_hint": "sponsors" if "offers" in spons else "no_sponsorship" if "does not" in spons or "u.s. citizenship" in spons else None})
    return out


# ------------------------------------------------------------------ LinkedIn (guest pages, paced)

def linkedin(keywords: str, location: str, posted_days: int = 7, pages: int = 2) -> list[dict]:
    """LinkedIn's public guest search: one request at a time, 1.3-2.3 s apart, stops on 429/999.
    No login. LinkedIn's terms forbid automated collection at scale: keep it to a few pages."""
    out = []
    for page in range(pages):
        q = urllib.parse.urlencode({"keywords": keywords, "location": location, "f_TPR": f"r{posted_days * 86400}", "start": page * 10})
        try:
            html = _get(f"https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?{q}")
        except urllib.error.HTTPError as e:
            if e.code in (429, 999):
                break
            raise
        cards = parse_linkedin_cards(html if isinstance(html, str) else "")
        if not cards:
            break
        out += cards
        time.sleep(1.3 + random.random())
    return out


def parse_linkedin_cards(html: str) -> list[dict]:
    out = []
    for chunk in re.split(r"<li\b", html)[1:]:
        m = re.search(r"jobPosting:(\d{6,})", chunk) or re.search(r"/jobs/view/[^\"?]*?-?(\d{6,})(?:[/?\"])", chunk)
        if not m:
            continue
        grab = lambda cls: text_of(m2.group(1)) if (m2 := re.search(rf'class="[^"]*{cls}[^"]*"[^>]*>([\s\S]*?)</', chunk)) else ""
        title = grab("base-search-card__title")
        if not title:
            continue
        posted = re.search(r'<time[^>]*datetime="([^"]+)"', chunk)
        out.append({"platform": "linkedin", "source": "linkedin", "url": f"https://www.linkedin.com/jobs/view/{m.group(1)}/", "title": title,
                    "company": grab("base-search-card__subtitle"), "location": grab("job-search-card__location"), "posted_at": posted.group(1) if posted else None})
    return out


# ------------------------------------------------------------------ careers pages

def jsonld_postings(html: str, page_url: str) -> list[dict]:
    """schema.org JobPosting blocks on any careers page."""
    out = []
    for block in re.findall(r'<script[^>]+type="application/ld\+json"[^>]*>([\s\S]*?)</script>', html, re.I):
        try:
            data = json.loads(block.strip())
        except json.JSONDecodeError:
            continue
        items = data if isinstance(data, list) else data.get("@graph", [data]) if isinstance(data, dict) else []
        for it in items:
            if isinstance(it, dict) and it.get("@type") == "JobPosting":
                org = it.get("hiringOrganization") or {}
                loc = it.get("jobLocation") or {}
                loc = loc[0] if isinstance(loc, list) and loc else loc
                addr = (loc.get("address") or {}) if isinstance(loc, dict) else {}
                out.append({"platform": None, "source": "web", "url": it.get("url") or page_url, "title": it.get("title"), "company": org.get("name") if isinstance(org, dict) else org,
                            "location": ", ".join(x for x in [addr.get("addressLocality"), addr.get("addressRegion")] if x), "description": text_of(it.get("description")), "posted_at": it.get("datePosted")})
    return out


BOARD_PATTERNS = [
    ("greenhouse", r"(?:job-boards|boards)(?:\.eu)?\.greenhouse\.io/(?:embed/job_board\?for=)?([a-z0-9_-]+)"),
    ("greenhouse", r"boards-api\.greenhouse\.io/v1/boards/([a-z0-9_-]+)"),
    ("lever", r"jobs\.(?:eu\.)?lever\.co/([a-z0-9_.-]+)"),
    ("ashby", r"jobs\.ashbyhq\.com/([a-z0-9_.%-]+)"),
    ("smartrecruiters", r"(?:jobs|careers)\.smartrecruiters\.com/([A-Za-z0-9_-]+)"),
    ("workable", r"apply\.workable\.com/([a-z0-9_-]+)"),
    ("recruitee", r"([a-z0-9-]+)\.recruitee\.com"),
    ("breezy", r"([a-z0-9-]+)\.breezy\.hr"),
    ("bamboohr", r"([a-z0-9-]+)\.bamboohr\.com/careers"),
    ("pinpoint", r"([a-z0-9-]+)\.pinpointhq\.com"),
    ("personio", r"([a-z0-9-]+)\.jobs\.personio\.(?:de|com)"),
]
WORKDAY_RE = re.compile(r"([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com/(?:[a-z]{2}-[A-Z]{2}/)?([A-Za-z0-9_-]+)")


def boards_in_text(text: str) -> list[dict]:
    """Job boards linked from a page or a job URL: [{"platform", "token", ...}]. Learn them once, scan them forever."""
    found: dict[str, dict] = {}
    for platform, pat in BOARD_PATTERNS:
        for m in re.finditer(pat, text, re.I):
            tok = urllib.parse.unquote(m.group(1))
            if tok.lower() in ("embed", "v1", "api", "jobs", "boards", "www", "app"):
                continue
            found[f"{platform}:{tok.lower()}"] = {"platform": platform, "token": tok if platform == "smartrecruiters" else tok.lower()}
    for m in WORKDAY_RE.finditer(text):
        if m.group(3) in ("wday", "job", "details"):
            continue
        found[f"workday:{m.group(1)}:{m.group(3)}"] = {"platform": "workday", "token": m.group(1), "host": f"{m.group(1)}.{m.group(2)}.myworkdayjobs.com", "site": m.group(3)}
    return list(found.values())


FEEDS: dict[str, Callable[..., list[dict]]] = {
    "greenhouse": greenhouse, "lever": lever, "ashby": ashby, "smartrecruiters": smartrecruiters, "workable": workable,
    "recruitee": recruitee, "breezy": breezy, "bamboohr": bamboohr, "pinpoint": pinpoint, "personio": personio,
}


def scan_board(board: dict) -> list[dict]:
    if board["platform"] == "workday":
        return workday(board["host"], board["token"], board["site"], board.get("name", ""))
    fn = FEEDS.get(board["platform"])
    return fn(board["token"], board.get("name", "")) if fn else []
