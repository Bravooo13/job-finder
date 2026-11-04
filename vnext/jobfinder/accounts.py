"""Accounts the toolkit made for you on job sites (Workday and other sign-in sites), only when
`accounts: true` in private/settings.yaml (the owner's setting).

Each site gets its own password. Passwords are kept in the macOS Keychain (Keychain Access →
search "Job Finder"); private/accounts.yaml records which sites have an account, with which email
and when, but never the password. `python -m jobfinder accounts --show` prints them.
"""
from __future__ import annotations

import secrets
import subprocess
import time
from typing import Any, Optional

import yaml

from . import config

WORDS = ("Maple", "Harbor", "Cedar", "River", "Summit", "Willow", "Falcon", "Copper", "Meadow", "Lantern",
         "Orchard", "Granite", "Juniper", "Beacon", "Canyon", "Sparrow", "Thistle", "Prairie", "Glacier", "Saffron")


def _file():
    return config.PRIVATE / "accounts.yaml"


def records() -> list[dict[str, Any]]:
    f = _file()
    return (yaml.safe_load(f.read_text()) or []) if f.exists() else []


def _service(host: str) -> str:
    return f"Job Finder: {host}"


def new_password() -> str:
    """Easy to read, strong enough, and meets Workday's rules (upper, lower, digit, symbol, 8+)."""
    return f"{secrets.choice(WORDS)}-{secrets.choice(WORDS)}-{secrets.randbelow(9000) + 1000}!"


def _keychain_set(host: str, email: str, password: str) -> None:
    subprocess.run(["security", "add-generic-password", "-U", "-s", _service(host), "-a", email, "-w", password,
                    "-l", _service(host), "-j", "Made by Job Finder for a job application"], check=True, capture_output=True)


def _keychain_get(host: str, email: str) -> Optional[str]:
    r = subprocess.run(["security", "find-generic-password", "-s", _service(host), "-a", email, "-w"], capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else None


def get(host: str) -> Optional[dict[str, Any]]:
    """{host, company, email, password, ...} for a site with an account, else None."""
    rec = next((r for r in records() if r.get("host") == host), None)
    if not rec:
        return None
    return {**rec, "password": _keychain_get(host, rec["email"])}


def create(host: str, company: str, email: str) -> dict[str, Any]:
    """Makes and stores a password for a new account (call before typing it into the site)."""
    if get(host):
        raise ValueError(f"There is already an account on {host}.")
    password = new_password()
    _keychain_set(host, email, password)
    rec = {"host": host, "company": company, "email": email, "created": time.strftime("%Y-%m-%d %H:%M"),
           "keychain": _service(host), "status": "creating"}
    _save(records() + [rec])
    return {**rec, "password": password}


def set_password(host: str, email: str) -> str:
    """A new password for a site whose account was never finished (its Keychain item was lost)."""
    password = new_password()
    _keychain_set(host, email, password)
    return password


def mark(host: str, status: str, note: str = "") -> None:
    """status: creating | needs_email_check | ready | failed."""
    recs = records()
    for r in recs:
        if r.get("host") == host:
            r["status"] = status
            if note:
                r["note"] = note
    _save(recs)


def _save(recs: list[dict[str, Any]]) -> None:
    f = _file()
    f.write_text("# Job-site accounts Job Finder made for you. Passwords are in the macOS Keychain\n"
                 "# (Keychain Access, search \"Job Finder\"), or run: python -m jobfinder accounts --show\n"
                 + yaml.safe_dump(recs, sort_keys=False, allow_unicode=True))
    f.chmod(0o600)
