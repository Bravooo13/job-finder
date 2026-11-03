"""Writes skills/ats-platforms/references/ from platforms/registry.json (one file per major platform,
all-platforms.md for the whole table). Run again after editing the registry:
    python scripts/build_platform_refs.py"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REG = json.loads((ROOT / "platforms" / "registry.json").read_text())["platforms"]
OUT = ROOT / "skills" / "ats-platforms" / "references"
MAJOR = ["greenhouse", "lever", "ashby", "workday", "smartrecruiters", "icims", "taleo", "oracle", "successfactors", "jobvite", "workable", "bamboohr", "linkedin", "handshake"]

# What the live runs taught us, beyond the registry's one-line notes.
LESSONS = {
    "greenhouse": """- Apply on `https://job-boards.greenhouse.io/embed/job_app?for={token}&token={id}`. Company sites with `?gh_jid=` embed the same form.
- Dropdowns are React Select: click, type with real key presses (`delay=25`), wait for `[role=option]`, click the best match. Setting `.value` does nothing.
- Long lists (School, Discipline, Location) are type-to-search: there is no full option list to read; type the value and pick.
- Attach the resume FIRST and wait 2-5 s: Greenhouse parses it and rebuilds the education rows (`school--0` becomes `school--1`) with its own guesses. Read the form again, then fill over the guesses.
- A signed-in MyGreenhouse account autofills contact and education a few seconds after load and again when a dropdown opens. Let it finish, then fill over it with the profile. Fields it clears later are refilled (twice at most).
- The reCAPTCHA is the invisible kind (a badge in the corner). It is not a box to tick. A real challenge after Submit goes to the owner.
- After Submit, some companies email an 8-character security code. The page shows a code field: that is "needs you", tab left open. Never type the code.
- "Thank you for your interest" is printed on many forms before Submit. Only a NEW thank-you (or a URL change to /confirmation) counts as submitted.
- Questions per job, before opening the form: `GET boards-api.greenhouse.io/v1/boards/{token}/jobs/{id}?questions=true`.""",
    "lever": """- Form at `https://jobs.lever.co/{company}/{id}/apply`. One page; plain inputs, `cards[...]` custom questions, a resume upload that parses into name/email/phone.
- An hCaptcha may show on Submit for some companies: owner's.
- Feed: `GET api.lever.co/v0/postings/{company}?mode=json` (EU: api.eu.lever.co).""",
    "ashby": """- Form at `https://jobs.ashbyhq.com/{org}/{id}/application`. React app; Yes/No questions are BUTTON groups, not radios (the scanner reads them as `kind: buttons`).
- Resume upload autofills; wait and re-read like Greenhouse.
- Feed: `GET api.ashbyhq.com/posting-api/job-board/{org}?includeCompensation=true`.""",
    "workday": """- Every company is its own tenant: the owner creates an account and signs in ONCE per company in the persistent browser profile (`private/browser-profile`). Never create the account or type the password.
- After sign-in: My Information → My Experience (resume parse) → Application Questions → Voluntary Disclosures → Self Identify → Review. Selectors: `data-automation-id` (`pageFooterNextButton`, `bottom-navigation-next-button`, `signInLink`, `createAccountLink`).
- The driver fills page by page and STOPS at Review (`may_submit = False`): the owner submits.
- Feed (no login): `POST https://{tenant}.{wdN}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs` with `{"appliedFacets":{},"limit":20,"offset":0,"searchText":""}`.""",
    "smartrecruiters": """- Feed: `GET api.smartrecruiters.com/v1/companies/{id}/postings`. Apply: `jobs.smartrecruiters.com/{company}/{id}` → "I'm interested" → one-page form (sometimes a second page of screening questions).
- Treated as a step form: fill, Next, fill, stop or submit by settings.""",
    "icims": "- The form lives in an iframe; add `in_iframe=1` to the URL to get it as a plain page. Starts with an email/login step: owner's.",
    "taleo": "- Old multi-page form with an account per company. Fill only after the owner signs in; stop at the review page.",
    "oracle": "- Oracle Recruiting Cloud (Candidate Experience): email first, then a one-time code by email (owner's). Feed: `GET {host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList&finder=findReqs;siteNumber={site}`.",
    "successfactors": "- SAP SuccessFactors career sites need an account per company; multi-page. Fill after sign-in, stop before submit.",
    "linkedin": "- Never automate applying (Easy Apply) and keep reading at a human pace: one job at a time, 1.3-2.3 s apart, stop on HTTP 429/999. Use LinkedIn only to FIND jobs; follow the company's own apply link.",
    "handshake": "- Needs the owner's school sign-in. Read results he has open; apply through the employer's link when there is one.",
}


def section(p: dict) -> str:
    f, a = p.get("feed") or {}, p.get("apply") or {}
    lines = [f"# {p['name']} (`{p['id']}`)", "", f"- Category: {p['category']}. Automation: **{p['automation']}**. Confidence: {p['confidence']}.",
             f"- Hosts: {', '.join('`' + h + '`' for h in p.get('hosts', [])) or 'none'}", f"- Example link: `{p.get('example', '')}`"]
    if f.get("url"):
        lines.append(f"- Job feed ({f.get('type')}): `{f['url']}`" + (f". {f['notes']}" if f.get("notes") else ""))
    lines.append(f"- Applying: {a.get('flow', '?')}, sign-in {a.get('signIn', '?')}." + (f" {a['notes']}" if a.get("notes") else ""))
    if p.get("notes"):
        lines.append(f"- Notes: {p['notes']}")
    if p["id"] in LESSONS:
        lines += ["", "## Lessons from live runs" if p["id"] in ("greenhouse",) else "## How to handle it", "", LESSONS[p["id"]]]
    return "\n".join(lines) + "\n"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for pid in MAJOR:
        p = next(x for x in REG if x["id"] == pid)
        (OUT / f"{pid}.md").write_text(section(p))
    rows = ["# Every platform in the registry", "", "Generated from `platforms/registry.json`. automation: full = fill and submit by settings; fill = fill, owner submits; manual = owner applies.", "",
            "| id | name | category | automation | confidence | feed | sign-in |", "| --- | --- | --- | --- | --- | --- | --- |"]
    for p in REG:
        rows.append(f"| {p['id']} | {p['name']} | {p['category']} | {p['automation']} | {p['confidence']} | {(p.get('feed') or {}).get('type') or '-'} | {(p.get('apply') or {}).get('signIn', '?')} |")
    rest = [section(p) for p in REG if p["id"] not in MAJOR]
    (OUT / "all-platforms.md").write_text("\n".join(rows) + "\n\n---\n\n" + "\n---\n\n".join(rest))
    print(f"wrote {len(MAJOR)} platform files and all-platforms.md ({len(REG)} platforms)")


if __name__ == "__main__":
    main()
