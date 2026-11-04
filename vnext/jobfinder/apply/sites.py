"""Per-platform behaviour on top of the generic form filler.

Most platforms are one page (Greenhouse, Lever, Ashby, Workable, BambooHR…): the generic filler does
everything. Multi-page ones override next_page / is_last_page. Sign-in ones say so; the owner signs in
once in the persistent browser profile and the next run continues from there.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse


@dataclass
class Site:
    id: str = "generic"
    max_pages: int = 1
    may_submit: bool = True  # False: fill to the review page and hand over

    def start(self, d, app: dict, sett: dict, prof: dict) -> Optional[dict]:
        """Gets from the posting to the form (sign-in sites sign in here). None = go on; else
        {"summary", "needs"} for a needs_you report."""
        return None

    def page_errors(self, d) -> list[str]:
        """What the page says is wrong after Next didn't move on."""
        return []

    def submit(self, d) -> bool:
        return d.click_submit()

    def needs_sign_in(self, d) -> bool:
        return False

    def next_page(self, d) -> bool:
        return False

    def is_last_page(self, d) -> bool:
        return True


A = lambda x: f'[data-automation-id="{x}"]'  # noqa: E731


class Workday(Site):
    """Workday: account per company, then 5-7 pages. Selectors are data-automation-id attributes.

    Posting → Apply → Apply Manually → Create Account (first time; only with `accounts: true`) or
    Sign In (later) → My Information, My Experience, Questions, Disclosures, Self Identify → Review.
    The "beecatcher" input is a bot trap and is never filled."""

    def __init__(self):
        super().__init__("workday", max_pages=8, may_submit=False)

    def press(self, d, auto_id: str) -> bool:
        """Workday covers many buttons with a transparent "click_filter" layer that takes the click."""
        tagged = d.js("""const id = arguments[0];
          const b = [...document.querySelectorAll(`[data-automation-id="${id}"]`)].find((x) => x.getClientRects().length);
          if (!b) return false;
          const f = b.parentElement && b.parentElement.querySelector('[data-automation-id="click_filter"]');
          document.querySelectorAll("[data-jf-press]").forEach((x) => x.removeAttribute("data-jf-press"));
          (f || b).setAttribute("data-jf-press", "1");
          return true;""", auto_id)
        return bool(tagged) and d.click('[data-jf-press="1"]')

    def _tick(self, d, auto_id: str) -> None:
        if not d.js("""const c = document.querySelector(`[data-automation-id="${arguments[0]}"]`); return Boolean(c && c.checked);""", auto_id):
            d.click(A(auto_id))

    def _auth_form(self, d) -> bool:
        return d.exists(A("signInSubmitButton")) or d.exists(A("createAccountSubmitButton")) or bool(d.probe().get("password"))

    def english(self, d) -> None:
        """Workday remembers a site language per browser (one site had kept Chinese): open the /en-US/ address."""
        u = d.probe()["url"]
        m = re.match(r"(https://[^/]+myworkdayjobs\.com)/(?:[a-z]{2}-[A-Z]{2}/)?(.*)$", u)
        if m and f"{m.group(1)}/en-US/" not in u:
            d.open(f"{m.group(1)}/en-US/{m.group(2)}")
            d.wait(2)

    def _sign_in(self, d, email: str, password: str) -> None:
        if d.exists(A("signInLink")) and not d.exists(A("signInSubmitButton")):
            self.press(d, "signInLink")
            d.wait(2)
        d.type_into(A("email"), email)
        d.type_into(A("password"), password)
        self.press(d, "signInSubmitButton") or d.click_text(r"^sign in$")
        d.wait(7)

    def start(self, d, app: dict, sett: dict, prof: dict) -> Optional[dict]:
        from .. import accounts

        self.english(d)
        # With an account, sign in from the page's top bar first: signing in after "Apply Manually" can land on
        # Workday's "Something went wrong" page when a draft of this application already exists.
        acct0 = accounts.get(urlparse(d.probe()["url"]).netloc)
        if acct0 and acct0.get("status") in ("ready", "needs_email_check") and acct0.get("password") and d.exists(A("utilityButtonSignIn")):
            self.press(d, "utilityButtonSignIn")
            d.wait(3)
            if d.exists(A("signInSubmitButton")):
                d.type_into(A("email"), acct0["email"])
                d.type_into(A("password"), acct0["password"])
                self.press(d, "signInSubmitButton")
                d.wait(7)
                held = self._after_auth(d, urlparse(d.probe()["url"]).netloc, app.get("company") or "", acct0["email"], created=False)
                if held:
                    return held
        if d.exists(A("adventureButton")):
            self.press(d, "adventureButton")
            d.wait(3)
        for pick in ("applyManually", "autofillWithResume"):
            if d.exists(A(pick)):
                self.press(d, pick)
                d.wait(5)
                break
        if not self._auth_form(d):  # signed in already (the browser profile keeps the session)
            if d.text_has(r"something went wrong|error code: ?vps"):
                return {"summary": f"{app.get('company') or 'The'} Workday showed an error page (Something went wrong). Try again later.", "needs": ["Workday error page: retry later"]}
            return None
        host = urlparse(d.probe()["url"]).netloc
        company = app.get("company") or host
        acct = accounts.get(host)
        if acct is None or acct.get("status") == "creating":  # "creating": an earlier try never got to press Create Account
            if not sett.get("accounts"):
                return {"summary": f"{company}'s Workday wants an account. Make one (or sign in) in the open window, then retry.", "needs": [f"Sign in to {company}'s Workday"]}
            email = prof.get("email")
            if not email:
                return {"summary": "Add your email to profile.yaml first.", "needs": ["Email in profile.yaml"]}
            if not d.exists(A("verifyPassword")) and d.exists(A("createAccountLink")):
                self.press(d, "createAccountLink")
                d.wait(2)
            if not d.exists(A("verifyPassword")):
                return {"summary": f"Couldn't find {company}'s Create Account form. Make the account in the open window, then retry.", "needs": [f"Create an account on {company}'s Workday"]}
            if acct is None or not acct.get("password"):
                acct = accounts.create(host, company, email) if acct is None else {**acct, "password": accounts.set_password(host, email)}
            d.type_into(A("email"), email)
            d.type_into(A("password"), acct["password"])
            d.type_into(A("verifyPassword"), acct["password"])
            if d.exists(A("createAccountCheckbox")):
                if not sett.get("consent"):
                    accounts.mark(host, "failed", "needs the terms box")
                    return {"summary": f"{company}'s Workday asks you to accept its terms to make the account (consent is off). Tick it and press Create Account in the open window.", "needs": ["Accept Workday's account terms"]}
                self._tick(d, "createAccountCheckbox")
            self.press(d, "createAccountSubmitButton")
            for _ in range(6):  # Workday can take a few seconds, then show a sign-in page for the new account
                d.wait(2)
                if d.exists(A("signInSubmitButton")) and not d.exists(A("verifyPassword")):
                    break
            if d.exists(A("signInSubmitButton")) and not d.exists(A("verifyPassword")) and not self.page_errors(d):
                self._sign_in(d, email, acct["password"])  # made it: now sign in with it
            return self._after_auth(d, host, company, email, created=True)
        if acct.get("status") == "needs_email_check" or not acct.get("password"):
            pass  # try signing in: the link may have been clicked since
        self._sign_in(d, acct["email"], acct.get("password") or "")
        return self._after_auth(d, host, company, acct["email"], created=False)

    def _after_auth(self, d, host: str, company: str, email: str, created: bool) -> Optional[dict]:
        from .. import accounts

        msgs = self.page_errors(d)
        body = " ".join(msgs) + " " + " ".join(d.texts('[role="alert"], [data-automation-id="errorMessage"], [data-automation-id="alertMessage"]'))
        if re.search(r"verif|confirm your (email|account)|check your (email|inbox)|activation", body, re.I) or (created and d.text_has(r"verify your (account|email)|verification (email|link)")):
            accounts.mark(host, "needs_email_check")
            return {"summary": f"{company}'s Workday emailed {email} a link to verify the new account. Click it, then retry this application.",
                    "needs": [f"Click the verification link {company}'s Workday emailed you"]}
        if re.search(r"already (exists|in use|registered)|account with this email", body, re.I):
            accounts.mark(host, "failed", "an account already existed")
            return {"summary": f"There was already a {company} Workday account for {email}. Sign in (or reset its password) in the open window, then retry.",
                    "needs": [f"Sign in to {company}'s existing Workday account"]}
        if self._auth_form(d):
            dump = os.environ.get("JOBFINDER_DUMP")
            if dump and hasattr(d, "dump"):  # debugging: what the sign-in page said
                d.dump(os.path.join(dump, f"auth-{host}"))
            if created:
                accounts.mark(host, "failed", "; ".join(msgs)[:200])
            return {"summary": f"Couldn't get past {company}'s Workday sign-in" + (f": {'; '.join(msgs[:2])}" if msgs else "") + ". Look at the open window.",
                    "needs": [f"Sign in to {company}'s Workday"] + msgs[:3]}
        accounts.mark(host, "ready")
        if d.text_has(r"something went wrong|error code: ?vps"):
            return {"summary": f"{company}'s Workday showed an error page (Something went wrong). Try again later.", "needs": ["Workday error page: retry later"]}
        return None

    def page_errors(self, d) -> list[str]:
        errs = [e for e in d.texts('[data-automation-id="errorMessage"], [data-automation-id="inputAlert"], [data-automation-id="errorBanner"] li, [role="alert"]')
                if not re.search(r"success|uploaded|page is loaded|loading", e, re.I)][:8]
        if d.text_has(r"something went wrong|error code: ?vps"):
            errs.insert(0, "Workday showed an error page (Something went wrong): try again later")
        return errs

    def needs_sign_in(self, d) -> bool:
        return False  # start() handles it

    def submit(self, d) -> bool:
        """On Review, Workday's footer button reads "Submit" (the same button as Next, under a click layer)."""
        if not self.is_last_page(d):
            return False
        self.tidy(d)
        return self.press(d, "pageFooterNextButton") or self.press(d, "pageFooterSubmitButton") or d.click_submit()

    def tidy(self, d) -> None:
        """One copy of each uploaded file: earlier runs' uploads stay in a Workday draft."""
        d.js("""const seen = new Set();
          for (const it of document.querySelectorAll('[data-automation-id="file-upload-item"]')) {
            const n = (it.querySelector('[data-automation-id="file-upload-item-name"]') || it).textContent.trim();
            if (seen.has(n)) { const b = it.querySelector('[data-automation-id="delete-file"]'); if (b) b.click(); } else seen.add(n);
          }""")
        d.wait(1)

    def has_upload(self, d) -> bool:
        return d.exists('[data-automation-id="file-upload-successful"]')

    def next_page(self, d) -> bool:
        self.tidy(d)
        before = d.probe()["url"] + "|" + " ".join(d.texts('[data-automation-id="progressBarActiveStep"], h2'))[:200]
        if not (self.press(d, "pageFooterNextButton") or self.press(d, "bottom-navigation-next-button")):
            return False
        d.wait(3)
        after = d.probe()["url"] + "|" + " ".join(d.texts('[data-automation-id="progressBarActiveStep"], h2'))[:200]
        return after != before and not self.page_errors(d)

    def is_last_page(self, d) -> bool:
        step = " ".join(d.texts('[data-automation-id="progressBarActiveStep"]'))
        return bool(re.search(r"\breview\b", step, re.I)) or "Review" in d.texts("h2") or d.exists('[data-automation-id="reviewPage"]')


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
