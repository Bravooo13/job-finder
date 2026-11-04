"""Cover letters: which applications need one, and turning a written letter into the PDF the runner attaches.

The letter itself is written by the agent with the cover-letter-writer skill (no AI key needed here).
`save(job_id, text)` writes private/files/cover-letter-{job}.md and .pdf (Playwright's Chromium prints it)
and puts the application that stopped for it back in the queue.
"""
from __future__ import annotations

import html
import re
import time
from typing import Any

from . import config, store
from .apply.runner import LETTER_NEED


def waiting() -> list[dict[str, Any]]:
    """Applications that stopped because the form wants a cover letter, with their jobs."""
    out = []
    for a in store.applications({"needs_you"}):
        if LETTER_NEED in (a.get("needs") or []):
            job = (store.jobs("id=?", (a["job_id"],), limit=1) or [{}])[0] if a.get("job_id") else {}
            out.append({"app": a, "job": job})
    return out


def paths(job_id: str):
    return config.FILES / f"cover-letter-{job_id}.md", config.FILES / f"cover-letter-{job_id}.pdf"


def _html(text: str, prof: dict) -> str:
    name = " ".join(x for x in [prof.get("firstName"), prof.get("lastName")] if x) or "Your name"
    contact = " · ".join(x for x in [prof.get("email"), prof.get("phone"), ", ".join(y for y in [prof.get("city"), prof.get("state")] if y),
                                       prof.get("linkedin")] if x)
    paras = [p.strip() for p in re.split(r"\n\s*\n", text.strip()) if p.strip()]
    body = "".join(f"<p>{html.escape(p).replace(chr(10), '<br>')}</p>" for p in paras)
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
      body {{ font: 11pt/1.45 Georgia, "Times New Roman", serif; color: #111; margin: 0; }}
      h1 {{ font: 600 16pt/1.2 Georgia, serif; margin: 0 0 2pt; }} .contact {{ font-size: 9.5pt; color: #444; margin-bottom: 18pt; }}
      .date {{ margin-bottom: 12pt; }} p {{ margin: 0 0 10pt; }}
    </style></head><body><h1>{html.escape(name)}</h1><div class="contact">{html.escape(contact)}</div>
    <div class="date">{time.strftime("%B %-d, %Y")}</div>{body}</body></html>"""


def build_pdf(job_id: str, text: str) -> str:
    from playwright.sync_api import sync_playwright

    md, pdf = paths(job_id)
    config.FILES.mkdir(parents=True, exist_ok=True)
    md.write_text(text.strip() + "\n")
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        page = b.new_page()
        page.set_content(_html(text, config.profile()))
        page.pdf(path=str(pdf), format="Letter", margin={"top": "0.9in", "bottom": "0.9in", "left": "1in", "right": "1in"})
        b.close()
    return str(pdf)


def save(job_id: str, text: str) -> dict[str, Any]:
    """Saves the letter for a job and re-queues the application that was waiting for it."""
    rows = store.jobs("id=?", (job_id,), limit=1)
    if not rows:
        raise KeyError(job_id)
    words = len(text.split())
    if words < 120:
        raise ValueError(f"That letter is {words} words; write at least 120 (the skill asks for 250-350).")
    pdf = build_pdf(job_id, text)
    job = rows[0]
    store.log("agent", "cover-letter", f"Cover letter for {job['title']} at {job['company']} ({words} words)", {"job": job_id})
    retried = []
    for w in waiting():
        if w["app"].get("job_id") == job_id:
            store.act(w["app"]["id"], "retry")
            retried.append(w["app"]["id"])
    return {"pdf": pdf, "words": words, "retried": retried}
