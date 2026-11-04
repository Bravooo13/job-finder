"""The Selenium driver: same interface as PlaywrightDriver, for machines or sites where Selenium suits
better (an existing Chrome profile, a grid, undetected-chromedriver). Chrome via Selenium Manager."""
from __future__ import annotations

import re
import time
from pathlib import Path
from typing import Optional

from .. import answers as engine
from .. import config
from . import outcome, scripts


class SeleniumDriver:
    def __init__(self, headless: Optional[bool] = None, profile_dir: Optional[Path] = None, chrome_binary: Optional[str] = None):
        from selenium import webdriver

        sett = config.settings()
        opts = webdriver.ChromeOptions()
        profile = Path(profile_dir or (config.PRIVATE / "selenium-profile"))
        profile.mkdir(parents=True, exist_ok=True)
        opts.add_argument(f"--user-data-dir={profile}")
        opts.add_argument("--window-size=1280,900")
        if (sett.get("headless", False) if headless is None else headless):
            opts.add_argument("--headless=new")
        if chrome_binary:
            opts.binary_location = chrome_binary
        opts.add_experimental_option("detach", True)  # windows that need you stay open
        self.d = webdriver.Chrome(options=opts)
        self._kept: list[str] = []
        self._keep = False

    def new_page(self) -> None:
        if self.d.current_url not in ("about:blank", "data:,"):
            self.d.switch_to.new_window("tab")
        self._keep = False

    def close_page(self) -> None:
        if self._keep:
            self._kept.append(self.d.current_window_handle)
        elif len(self.d.window_handles) > 1:
            self.d.close()
            self.d.switch_to.window(self.d.window_handles[-1])

    def keep_open(self) -> None:
        self._keep = True

    def finish(self) -> None:
        if self._kept:
            print(f"{len(self._kept)} tab(s) need you; the browser stays open.")
            return
        self.d.quit()

    def close(self) -> None:
        self.d.quit()

    def open(self, url: str) -> None:
        self.d.get(url)
        time.sleep(1.5)

    def wait(self, seconds: float) -> None:
        time.sleep(seconds)

    def js(self, body: str, *args):
        return self.d.execute_script(body, *args)

    def scan(self) -> list[dict]:
        fields = self.js(scripts.SCAN)
        for f in fields:  # dropdowns only list their choices when open: open each one once
            if f["type"] == "combobox" and not f.get("options"):
                f["options"] = self._read_combo(f)
        return fields

    def _read_combo(self, f: dict) -> list[str]:
        from selenium.webdriver.common.keys import Keys

        try:
            el = self._el(f)
            el.click()
            time.sleep(0.6)
            texts = [o.text.strip() for o in self.d.find_elements("css selector", '[role="option"]') if o.is_displayed()]
            el.send_keys(Keys.ESCAPE)
            return [] if not texts or any(re.match(r"^(no (options|results)|loading|searching|type to search|start typing)", t, re.I) for t in texts) else texts[:400]
        except Exception:  # noqa: BLE001
            return []

    def shape(self) -> str:
        return self.js(scripts.SHAPE)

    def states(self, fields: list[dict]) -> dict[str, dict]:
        items = [{"key": f["key"], "kind": f.get("kind", "single"), "type": f["type"], "id": f.get("id", "")} for f in fields]
        return {s["key"]: s for s in self.js(scripts.STATE, items)}

    def probe(self) -> dict:
        return self.js(scripts.PROBE, outcome.PATTERNS)

    def _find(self, css: str):
        from selenium.webdriver.common.by import By
        found = self.d.find_elements(By.CSS_SELECTOR, css)
        return found[0] if found else None

    def exists(self, selector: str) -> bool:
        return self._find(selector) is not None

    def text_has(self, pattern: str) -> bool:
        return bool(re.search(pattern, self.js("return document.body.innerText") or "", re.I))

    def _buttons(self, pattern: str):
        from selenium.webdriver.common.by import By
        return [b for b in self.d.find_elements(By.CSS_SELECTOR, "button, input[type=submit]") if b.is_displayed() and re.search(pattern, (b.text or b.get_attribute("value") or "").strip(), re.I)]

    def has_text_button(self, pattern: str) -> bool:
        return bool(self._buttons(pattern))

    def click(self, selector: str) -> bool:
        el = self._find(selector)
        if not el:
            return False
        el.click()
        return True

    def type_into(self, selector: str, text: str) -> bool:
        el = self._find(selector)
        if el is None:
            return False
        el.click()
        el.clear()
        el.send_keys(text)
        return True

    def texts(self, selector: str) -> list[str]:
        from selenium.webdriver.common.by import By
        return [e.text.strip() for e in self.d.find_elements(By.CSS_SELECTOR, selector) if e.text.strip()]

    def dump(self, path: str) -> None:
        open(path + ".html", "w").write(self.d.page_source)
        self.d.save_screenshot(path + ".png")

    def click_text(self, pattern: str) -> bool:
        b = self._buttons(pattern)
        if not b:
            return False
        b[0].click()
        return True

    def click_submit(self) -> bool:
        if not self.js(scripts.FIND_SUBMIT):
            return False
        el = self._find("[data-jf-submit]")
        el.click()
        return True

    def _el(self, f: dict):
        return self._find(f'[data-jf-key="{f["key"]}"]') or (self._find(f'[id="{f["id"]}"]') if f.get("id") else None)

    def fill(self, f: dict, a: dict, files: dict[str, Path]) -> bool:
        from selenium.webdriver.common.keys import Keys
        from selenium.webdriver.support.ui import Select

        v = a.get("value")
        try:
            if f["type"] == "file":
                path = files.get(a.get("file") or "")
                el = self._el(f)
                if not path or not el:
                    return False
                el.send_keys(str(path))
                return True
            if f.get("kind") in ("group", "buttons"):
                if f["type"] == "checkbox" and not f.get("options"):
                    el = self._find(f'[data-jf-key="{f["key"]}#0"]')
                    if el and bool(v) != el.is_selected():
                        self.js("arguments[0].click()", el)
                    return True
                hits = [engine.choose_option(f.get("options", []), str(w)) for w in (v if isinstance(v, list) else [v])]
                for h in [h for h in hits if h]:
                    el = self._find(f'[data-jf-key="{f["key"]}#{f["options"].index(h)}"]')
                    if el and not (f.get("kind") == "group" and el.is_selected()):
                        self.js("arguments[0].click()", el)
                return any(hits)
            el = self._el(f)
            if not el:
                return False
            if f["type"] == "select":
                hit = engine.choose_option(f.get("options", []), str(v[0] if isinstance(v, list) else v))
                if not hit:
                    return False
                Select(el).select_by_visible_text(hit)
                return True
            if f["type"] == "combobox":
                vals = v if isinstance(v, list) else [v]
                ok = False
                for x in [str(y) for y in vals if y]:
                    for attempt in [x, *(a.get("alts") or [])]:
                        el.click()
                        el.send_keys(Keys.CONTROL, "a")
                        el.send_keys(attempt)
                        time.sleep(1.2)
                        opts = [o for o in self.d.find_elements("css selector", '[role="option"]') if o.is_displayed()]
                        texts = [o.text.strip() for o in opts]
                        hit = engine.choose_option(texts, attempt)
                        if hit:
                            opts[texts.index(hit)].click()
                            ok = True
                            break
                el.send_keys(Keys.ESCAPE)
                return ok
            if f["type"] == "checkbox":
                if bool(v) != el.is_selected():
                    self.js("arguments[0].click()", el)
                return True
            el.clear()
            el.send_keys(str(v))
            return True
        except Exception:  # noqa: BLE001
            return False
