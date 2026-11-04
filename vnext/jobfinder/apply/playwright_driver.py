"""The Playwright driver (default). A persistent Chrome profile in private/browser-profile keeps your
sign-ins (Workday, Handshake) between runs. Real key presses for type-to-search dropdowns."""
from __future__ import annotations

import pathlib
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
            locale="en-US",  # sites like Workday follow the browser's language; the answer engine reads English
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
            if (f["type"] == "combobox" and f.get("kind") != "wdprompt" or f.get("kind") == "listbutton") and not f.get("options"):
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
        items = [{"key": f["key"], "kind": f.get("kind", "single"), "type": f["type"], "id": f.get("id", ""), "name": f.get("hint", "") if f.get("kind") == "group" else ""} for f in fields]
        return {s["key"]: s for s in self.js(scripts.STATE, items)}

    def probe(self) -> dict:
        return self.js(scripts.PROBE, outcome.PATTERNS)

    def _shown(self, selector: str):
        return self.page.locator(f"{selector} >> visible=true")

    def exists(self, selector: str) -> bool:
        return self._shown(selector).count() > 0

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
        loc = self._shown(selector)
        if loc.count() == 0:
            return False
        loc.first.click()
        return True

    def type_into(self, selector: str, text: str) -> bool:
        loc = self._shown(selector)
        if loc.count() == 0:
            return False
        loc.first.click()
        loc.first.fill("")
        loc.first.press_sequentially(text, delay=25)
        return True

    def texts(self, selector: str) -> list[str]:
        return [x.strip() for x in self._shown(selector).all_inner_texts() if x.strip()]

    def dump(self, path: str) -> None:
        """Debugging: the page's HTML and a screenshot (only when JOBFINDER_DUMP is set)."""
        pathlib.Path(path + ".html").write_text(self.page.content())
        self.page.screenshot(path=path + ".png", full_page=True)

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
            if f.get("kind") == "listbutton":
                return self._pick_list(self._el(f), v, a.get("alts") or [])
            if f.get("kind") == "wdprompt":
                return self._pick_prompt(self._el(f), v, a.get("alts") or [])
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
            if "dateSection" in (f.get("id") or ""):  # Workday month/year boxes listen to key presses (a display layer sits on top)
                el.focus()
                self.page.keyboard.press("ControlOrMeta+a")
                self.page.keyboard.type(str(v), delay=40)
                el.dispatch_event("blur")
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
            if not el.count() and f.get("hint"):  # the page redrew the group: same name, same order
                el = self.page.locator(f'input[name="{f["hint"]}"]').nth(i)
            lab = self.page.locator(f'label[for="{el.get_attribute("id")}"]') if el.get_attribute("id") else None
            if not el.is_checked():
                if lab is not None and lab.count():  # styled radios (Workday, React): the label click is what the page hears
                    lab.first.click()
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

    def _pick_list(self, el, value, alts: list[str] | None = None) -> bool:
        """A button that opens a listbox (Workday): open it, click the option that matches. Only an exact match or
        one that clearly contains the answer counts (a loose match once picked "...just not a protected veteran")."""
        now = el.inner_text().strip().lower()
        if now and any(now == str(w).strip().lower() for w in [value[0] if isinstance(value, list) else value, *(alts or [])]):
            return True  # already shows this answer
        el.scroll_into_view_if_needed()
        el.click()
        opts, last = [], -1
        for _ in range(12):  # Workday draws the options a little after the list opens: wait until the list stops growing
            self.wait(0.25)
            opts = self._options(el)
            if opts and len(opts) == last:
                break
            last = len(opts)
        texts = [o.inner_text().strip() for o in opts]
        for want in [str(value[0] if isinstance(value, list) else value), *(alts or [])]:
            w = want.strip().lower()
            hit = (next((x for x in texts if x.lower() == w), None)
                   or next((x for x in texts if len(w) > 3 and re.search(rf"(^|\W){re.escape(w)}($|\W)", x, re.I)), None)
                   or next((x for x in texts if len(x) > 3 and re.search(rf"(^|\W){re.escape(x.lower())}($|\W)", w)), None))
            if hit:
                opts[texts.index(hit)].click()
                return True
        self.page.keyboard.press("Escape")
        return False

    def _pick_prompt(self, el, value, alts: list[str]) -> bool:
        """Workday's search-and-pick field: type, Enter, click the option that matches (categories open a
        second list). Only an option equal to or containing the answer counts: never a look-alike."""
        # the open list only: picked values elsewhere on the page are promptOption elements too
        opts_sel = '[data-automation-id="promptOption"]:not([data-automation-id="selectedItemList"] *) >> visible=true'
        # what the widget says is picked now ("1 item selected, Economics"), plus its chips
        now = el.evaluate("""e => { const box = e.closest('[data-automation-id="multiSelectContainer"]') || e.parentElement;
            const aria = (box.querySelector('[data-automation-id="promptAriaInstruction"]') || {}).textContent || "";
            const m = /^\\s*(\\d+) items? selected,?\\s*(.*)$/i.exec(aria);
            const chips = [...box.querySelectorAll('[data-automation-id="selectedItem"]')].map((c) => c.textContent.trim());
            return [...chips, m && Number(m[1]) > 0 ? m[2] : ""].filter(Boolean); }""")
        chips = [x.strip().lower() for x in now]
        for w in [str(value[0] if isinstance(value, list) else value), *alts]:
            if any(w.strip().lower() in c or c in w.strip().lower() for c in chips if c):
                return True  # already picked (Workday read it from the resume)
        for attempt in [str(value[0] if isinstance(value, list) else value), *alts]:
            want = attempt.strip().lower()
            el.click()
            self.page.keyboard.press("ControlOrMeta+a")
            self.page.keyboard.press("Backspace")
            self.page.keyboard.type(attempt, delay=25)
            self.page.keyboard.press("Enter")
            for _depth in range(2):
                texts: list[str] = []
                for _ in range(10):
                    self.wait(0.35)
                    texts = [x.strip() for x in self.page.locator(opts_sel).all_inner_texts()]
                    if texts:
                        break
                hit = next((x for x in texts if x.lower() == want), None) or next((x for x in texts if re.search(rf"\b{re.escape(want)}\b", x, re.I)), None)
                if not hit:
                    break
                self.page.locator(opts_sel).nth(texts.index(hit)).click()
                self.wait(0.8)
                if not self.page.locator(opts_sel).count():  # picked a leaf: the list closed
                    self.page.keyboard.press("Escape")
                    self.wait(0.4)
                    return True
            self.page.keyboard.press("Escape")
        return False

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
