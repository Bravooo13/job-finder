"""The Playwright driver (default). A persistent Chrome profile in private/browser-profile keeps your
sign-ins (Workday, Handshake) between runs. Real key presses for type-to-search dropdowns."""
from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

from .. import answers as engine
from .. import config
from . import outcome, scripts


LOADING = re.compile(r"^(no (options|results)|loading|searching|type to search|start typing)", re.I)


def _fn(body: str) -> str:
    """A function body that uses `arguments` and `return`, as Playwright's evaluate wants it."""
    return f"(a) => (function() {{ {body} }}).apply(null, a === undefined ? [] : [a])"


class PlaywrightDriver:
    def __init__(self, headless: Optional[bool] = None, profile_dir: Optional[Path] = None, channel: Optional[str] = None, slow_mo: int = 0, ignore_https_errors: bool = False, extra_args: Optional[list[str]] = None):
        from playwright.sync_api import sync_playwright

        sett = config.settings()
        self._pw = sync_playwright().start()
        profile = Path(profile_dir or config.BROWSER_PROFILE)
        profile.mkdir(parents=True, exist_ok=True)
        self.ctx = self._pw.chromium.launch_persistent_context(
            str(profile), headless=sett.get("headless", False) if headless is None else headless, channel=channel, slow_mo=slow_mo,
            ignore_https_errors=ignore_https_errors, args=extra_args or [], viewport={"width": 1280, "height": 900},
        )
        self.page = self.ctx.pages[0] if self.ctx.pages else self.ctx.new_page()
        self._kept: list = []
        self._keep = False

    # ------------------------------------------------------------ pages
    def new_page(self) -> None:
        self._keep = False
        if self.page and not self.page.is_closed() and self.page.url == "about:blank":
            return  # reuse the empty first tab
        self.page = self.ctx.new_page()
        self._keep = False

    def close_page(self) -> None:
        if self._keep:
            self._kept.append(self.page)
        elif self.page and not self.page.is_closed() and len(self.ctx.pages) > 1:
            self.page.close()

    def keep_open(self) -> None:
        self._keep = True

    def finish(self) -> None:
        """Leaves tabs that need you open until you close the browser window."""
        live = [p for p in self._kept if not p.is_closed()]
        if live and not config.settings().get("headless"):
            print(f"{len(live)} tab(s) need you. Close the browser window when you're done.")
            try:
                self.ctx.wait_for_event("close", timeout=0)
            except Exception:  # noqa: BLE001
                pass
        self.close()

    def close(self) -> None:
        if getattr(self, "_closed", False):
            return
        self._closed = True
        try:
            self.ctx.close()
        finally:
            self._pw.stop()

    # ------------------------------------------------------------ reading
    def open(self, url: str) -> None:
        self.page.goto(url, wait_until="domcontentloaded", timeout=60_000)
        try:
            self.page.wait_for_load_state("networkidle", timeout=10_000)
        except Exception:  # noqa: BLE001 - some pages never go idle
            pass

    def wait(self, seconds: float) -> None:
        self.page.wait_for_timeout(int(seconds * 1000))

    def js(self, body: str, arg=None):
        return self.page.evaluate(_fn(body), arg)

    def scan(self) -> list[dict]:
        fields = self.js(scripts.SCAN)
        for f in fields:  # dropdowns only list their choices when open: open each one once
            if f["type"] == "combobox" and not f.get("options"):
                f["options"] = self._read_combo(f)
        return fields

    def _read_combo(self, f: dict) -> list[str]:
        try:
            el = self._el(f)
            el.click()
            texts: list[str] = []
            for _ in range(4):
                self.wait(0.2)
                texts = [o.inner_text().strip() for o in self._options(el)]
                if texts:
                    break
            self.page.keyboard.press("Escape")
            return [] if not texts or any(LOADING.match(t) for t in texts) else texts[:400]
        except Exception:  # noqa: BLE001
            return []

    def shape(self) -> str:
        return self.js(scripts.SHAPE)

    def states(self, fields: list[dict]) -> dict[str, dict]:
        items = [{"key": f["key"], "kind": f.get("kind", "single"), "type": f["type"], "id": f.get("id", "")} for f in fields]
        return {s["key"]: s for s in self.js(scripts.STATE, items)}

    def probe(self) -> dict:
        return self.js(scripts.PROBE, outcome.PATTERNS)

    def exists(self, selector: str) -> bool:
        return self.page.locator(selector).count() > 0

    def text_has(self, pattern: str) -> bool:
        return bool(re.search(pattern, self.page.inner_text("body"), re.I))

    def has_text_button(self, pattern: str) -> bool:
        return self.page.get_by_role("button", name=re.compile(pattern, re.I)).count() > 0

    # ------------------------------------------------------------ acting
    def _el(self, f: dict):
        loc = self.page.locator(f'[data-jf-key="{f["key"]}"]')
        if loc.count() == 0 and f.get("id"):
            loc = self.page.locator(f'[id="{f["id"]}"]')  # the page redrew it (same id)
        return loc.first

    def click(self, selector: str) -> bool:
        loc = self.page.locator(selector)
        if loc.count() == 0:
            return False
        loc.first.click()
        return True

    def click_text(self, pattern: str) -> bool:
        b = self.page.get_by_role("button", name=re.compile(pattern, re.I))
        if b.count() == 0:
            return False
        b.first.click()
        return True

    def click_submit(self) -> bool:
        if not self.js(scripts.FIND_SUBMIT):
            return False
        self.page.locator("[data-jf-submit]").first.click()
        return True

    def fill(self, f: dict, a: dict, files: dict[str, Path]) -> bool:
        v = a.get("value")
        try:
            if f["type"] == "file":
                path = files.get(a.get("file") or "")
                if not path:
                    return False
                self._el(f).set_input_files(str(path))
                return True
            if f.get("kind") == "buttons":
                return self._pick_button(f, v)
            if f.get("kind") == "group":
                return self._pick_group(f, v)
            el = self._el(f)
            if f["type"] == "select":
                hit = engine.choose_option(f.get("options", []), str(v[0] if isinstance(v, list) else v))
                if not hit:
                    return False
                el.select_option(label=hit)
                return True
            if f["type"] == "combobox":
                return self._combobox(el, v, a.get("alts") or [])
            if f["type"] == "checkbox":
                if bool(v) != el.is_checked():
                    el.click()
                return True
            el.fill(str(v))
            el.dispatch_event("blur")
            return True
        except Exception:  # noqa: BLE001 - one field never stops the form
            return False

    def _pick_group(self, f: dict, v) -> bool:
        wanted = v if isinstance(v, list) else [v]
        if f["type"] == "checkbox" and not f.get("options"):
            el = self.page.locator(f'[data-jf-key="{f["key"]}#0"]').first
            if bool(v) != el.is_checked():
                el.click()
            return True
        any_ = False
        for w in wanted:
            hit = engine.choose_option(f.get("options", []), str(w))
            if hit is None:
                continue
            i = f["options"].index(hit)
            el = self.page.locator(f'[data-jf-key="{f["key"]}#{i}"]').first
            if not el.is_checked():
                el.check(force=True)
            any_ = True
        return any_

    def _pick_button(self, f: dict, v) -> bool:
        hit = engine.choose_option(f.get("options", []), str(v[0] if isinstance(v, list) else v))
        if hit is None:
            return False
        self.page.locator(f'[data-jf-key="{f["key"]}#{f["options"].index(hit)}"]').first.click()
        return True

    def _options(self, el) -> list:
        lid = el.get_attribute("aria-controls") or el.get_attribute("aria-owns")
        lst = self.page.locator(f'[id="{lid}"]') if lid else self.page.locator('[role="listbox"]')
        return [o for o in lst.locator('[role="option"]').all() if o.is_visible()] if lst.count() else []

    def _combobox(self, el, value, alts: list[str]) -> bool:
        """React Select and other ARIA comboboxes: open, type with real key presses, pick the best option."""
        values = value if isinstance(value, list) else [value]
        picked = 0
        for v in [str(x) for x in values if x]:
            for attempt in [v, *(alts if len(values) == 1 else [])]:
                el.click()
                self.page.keyboard.press("ControlOrMeta+a")
                self.page.keyboard.type(attempt, delay=25)
                opts = []
                for _ in range(10):
                    self.wait(0.35)
                    opts = self._options(el)
                    if opts and not re.search(r"loading|searching", opts[0].inner_text(), re.I):
                        break
                texts = [o.inner_text().strip() for o in opts]
                hit = engine.choose_option(texts, attempt) or next((t for t in texts if attempt.lower().split(",")[0] in t.lower()), None)
                if hit and not re.match(r"^no (options|results)", hit, re.I):
                    opts[texts.index(hit)].click()
                    picked += 1
                    break
                self.page.keyboard.press("ControlOrMeta+a")
                self.page.keyboard.press("Backspace")
        self.page.keyboard.press("Escape")
        return picked > 0
