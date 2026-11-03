"""What a page looks like after Submit, and whether to press Submit at all. Ported from v1
(src/lib/apply/outcome.ts and decide.ts). Improve the patterns here; both drivers use them."""
from __future__ import annotations

import re

PATTERNS = {
    "thanks": r"thank you for (applying|your application|submitting)|application (has been |was )?(submitted|received|sent)|we('ve| have) received your application|successfully (submitted|applied)|your application is (complete|in)|thanks for applying|you('ve| have) (successfully )?applied|application complete",
    "thanksUrl": r"/confirmation|/thanks|/thank-you|/thank_you|application[-_]?(submitted|confirmation|complete)|[?&](submitted|success)=",
    "code": r"(security|verification|confirmation|one[- ]time|access) code|enter the (\d+[- ]character |\d+[- ]digit )?code|we('ve| have)? (just )?(sent|emailed|texted) (you )?(a|an|the) .{0,40}code|check your (email|inbox) for (a|the) code|verify (your|it's) (email|you)",
    "codeInput": 'input[autocomplete="one-time-code"], input[name*="code" i]:not([type=hidden]):not([name*="zip" i]):not([name*="postal" i]):not([name*="country" i]), input[id*="security" i], input[id*="verification" i], input[aria-label*="code" i]',
}


def short(s: str, n: int = 90) -> str:
    t = re.sub(r"\s+", " ", re.sub(r"[*✱]\s*$", "", s or "")).strip()
    return t if len(t) <= n else t[: n - 1] + "…"


def decide(mode: str, fields: list[dict], *, approved: bool = False, blockers: list[str] | None = None) -> dict:
    """mode: sure | review | fill | always. fields: [{label, type, required, filled, value, confidence, ai, consent}].
    -> {"action": submit|hold|needs_you, "needs", "checks", "summary"}"""
    needs = list(blockers or [])
    for f in fields:
        if f.get("required") and not f.get("filled"):
            label = short(f.get("label", ""), 290) or "A required field"
            needs.append(f"Tick: {label}" if f.get("consent") else f"Attach: {label}" if f.get("type") == "file" else label)
    checks = [f"{short(f.get('label', ''), 70)}: {short(f.get('value', ''), 60) or '(filled)'}{' (AI)' if f.get('ai') else ''}"
              for f in fields if f.get("filled") and (f.get("ai") or f.get("confidence") not in (None, "high"))]
    filled = sum(1 for f in fields if f.get("filled"))
    if needs:
        return {"action": "needs_you", "needs": needs, "checks": checks, "summary": f"Needs you: {'; '.join(needs[:3])}{f' and {len(needs) - 3} more' if len(needs) > 3 else ''}."}
    if mode == "fill":
        return {"action": "hold", "needs": [], "checks": checks, "summary": f"Filled {filled} fields. Review it and press Submit yourself."}
    if approved:
        return {"action": "submit", "needs": [], "checks": checks, "summary": f"You approved it. Submitting {filled} fields."}
    if mode == "review" or (mode == "sure" and checks):
        return {"action": "hold", "needs": [], "checks": checks, "summary": f"Filled {filled} fields{f'; {len(checks)} to check' if checks else ''}. Waiting for your OK."}
    return {"action": "submit", "needs": [], "checks": checks, "summary": f"All {filled} fields answered. Submitting."}
