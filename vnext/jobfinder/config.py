"""Paths and settings. Everything personal lives in private/ (gitignored)."""
from __future__ import annotations

import os
import pathlib
import shutil
from typing import Any

import yaml

ROOT = pathlib.Path(__file__).resolve().parents[1]
PRIVATE = pathlib.Path(os.environ.get("JOBFINDER_PRIVATE", ROOT / "private"))
CONFIG = ROOT / "config"
DB_PATH = PRIVATE / "jobfinder.db"
BROWSER_PROFILE = PRIVATE / "browser-profile"  # persistent Chrome profile: your sign-ins (Workday, Handshake) live here
FILES = PRIVATE / "files"  # resume.pdf, cover letters
OUTPUT = PRIVATE / "output"  # dashboard.html, screenshots


def ensure_private() -> None:
    """Creates private/ with copies of the example files on first use."""
    for d in (PRIVATE, FILES, OUTPUT):
        d.mkdir(parents=True, exist_ok=True)
    for name in ("profile", "settings", "searches"):
        target = PRIVATE / f"{name}.yaml"
        if not target.exists():
            shutil.copy(CONFIG / f"{name}.example.yaml", target)


def _load(name: str) -> dict[str, Any]:
    path = PRIVATE / f"{name}.yaml"
    if not path.exists():
        path = CONFIG / f"{name}.example.yaml"
    return yaml.safe_load(path.read_text()) or {}


def profile() -> dict[str, Any]:
    p = _load("profile")
    p.setdefault("custom", [])
    return p


def settings() -> dict[str, Any]:
    s = {
        "submit": "sure",  # sure | review | fill | always
        "consent": False,
        "check_first": True,
        "pause_seconds": 20,
        "driver": "playwright",  # playwright | selenium
        "headless": False,
        "keep_open_seconds": 0,
        "platforms": None,  # None = every platform whose automation is "full" or "fill"
    }
    s.update(_load("settings"))
    return s


def searches() -> list[dict[str, Any]]:
    return _load("searches").get("searches", [])


def save_profile(p: dict[str, Any]) -> None:
    ensure_private()
    (PRIVATE / "profile.yaml").write_text(yaml.safe_dump(p, sort_keys=False, allow_unicode=True))
