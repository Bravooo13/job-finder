"""Per-platform behaviour on top of the generic form filler.

Most platforms are one page (Greenhouse, Lever, Ashby, Workable, BambooHR…): the generic filler does
everything. Multi-page ones override next_page / is_last_page. Sign-in ones say so; the owner signs in
once in the persistent browser profile and the next run continues from there.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Site:
    id: str = "generic"
    max_pages: int = 1
    may_submit: bool = True  # False: fill to the review page and hand over

    def needs_sign_in(self, d) -> bool:
        return False

    def next_page(self, d) -> bool:
        return False

    def is_last_page(self, d) -> bool:
        return True


class Workday(Site):
    """Workday: account per company, then 5-7 pages. Selectors are data-automation-id attributes."""

    def __init__(self):
        super().__init__("workday", max_pages=8, may_submit=False)

    def needs_sign_in(self, d) -> bool:
        p = d.probe()
        return bool(p.get("password")) or d.exists('[data-automation-id="signInLink"], [data-automation-id="createAccountLink"]')

    def next_page(self, d) -> bool:
        return d.click('[data-automation-id="pageFooterNextButton"], [data-automation-id="bottom-navigation-next-button"]')

    def is_last_page(self, d) -> bool:
        return d.exists('[data-automation-id="reviewPage"], [data-automation-id*="review" i]') or d.text_has(r"\breview\b.{0,40}\bsubmit\b")


class StepForm(Site):
    """SmartRecruiters, iCIMS, Oracle and other forms with Next buttons: fill each step, stop before the last Submit."""

    def __init__(self, id: str, may_submit: bool = True):
        super().__init__(id, max_pages=6, may_submit=may_submit)

    def next_page(self, d) -> bool:
        return d.click_text(r"^(next|continue|save and continue|save & continue)$")

    def is_last_page(self, d) -> bool:
        return d.has_text_button(r"^(submit( application)?|apply|send application|finish)$")


class SignIn(StepForm):
    def needs_sign_in(self, d) -> bool:
        return bool(d.probe().get("password"))


SITES = {
    "workday": Workday,
    "smartrecruiters": lambda: StepForm("smartrecruiters"),
    "oracle": lambda: StepForm("oracle", may_submit=False),
    "icims": lambda: SignIn("icims", may_submit=False),
    "taleo": lambda: SignIn("taleo", may_submit=False),
    "successfactors": lambda: SignIn("successfactors", may_submit=False),
    "ukg": lambda: StepForm("ukg", may_submit=False),
    "dayforce": lambda: SignIn("dayforce", may_submit=False),
    "adp": lambda: StepForm("adp", may_submit=False),
    "paycom": lambda: StepForm("paycom", may_submit=False),
}


def for_platform(pid: str) -> Site:
    make = SITES.get(pid)
    return make() if make else Site(pid)
