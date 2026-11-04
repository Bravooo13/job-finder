import http.server
import threading
from functools import partial
from pathlib import Path

FIX = Path(__file__).parent / "fixtures"


def test_workday_account_then_sign_in(private, monkeypatch):
    """Create Account the first time (password kept only in the 'keychain'), Sign In the next time,
    a Workday dropdown filled, the bot-trap field left empty, and it stops at Review."""
    import importlib

    from jobfinder import accounts, config, store
    from jobfinder.apply import runner, sites
    importlib.reload(accounts); importlib.reload(sites); importlib.reload(runner)
    from jobfinder.apply.playwright_driver import PlaywrightDriver

    vault = {}
    monkeypatch.setattr(accounts, "_keychain_set", lambda h, e, p: vault.__setitem__((h, e), p))
    monkeypatch.setattr(accounts, "_keychain_get", lambda h, e: vault.get((h, e)))
    (private / "profile.yaml").write_text("firstName: Ada\nlastName: Lovelace\nemail: ada@example.com\ncountry: United States\n")
    (private / "settings.yaml").write_text("submit: always\nconsent: true\naccounts: true\ncheck_first: false\npause_seconds: 0\nheadless: true\n")
    importlib.reload(config)

    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), partial(http.server.SimpleHTTPRequestHandler, directory=str(FIX)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{httpd.server_address[1]}/workday.html"
    monkeypatch.setattr(runner.platforms, "detect", lambda u: {"id": "workday", "name": "Workday"})
    try:
        d = PlaywrightDriver(headless=True, profile_dir=private / "browser-profile")
        results = []
        for n in range(2):
            jid, _ = store.upsert_job({"url": f"{url}?job={n}", "title": f"Intern {n}", "company": "Mock Co"})
            store.queue_application({"id": jid, "title": f"Intern {n}", "company": "Mock Co"}, f"{url}?job={n}", "workday", False)
            app = store.claim_next()
            d.new_page()
            results.append(runner.run(app, d))
            assert d.exists('[data-automation-id="reviewPage"]'), f"run {n} didn't reach Review: {results[-1]['summary']}"
            if n == 0:
                assert d.page.title() != "bot", "the bot-trap field was filled"
            d.close_page()
        d.close()
    finally:
        httpd.shutdown()
    rec = accounts.records()
    assert results and all(r["status"] == "held" for r in results), [(r["status"], r["summary"], r["needs"]) for r in results]
    assert len(rec) == 1 and rec[0]["status"] == "ready" and "password" not in rec[0], rec
    assert len(vault) == 1, "one password, in the keychain only"
    for r in results:
        assert r["status"] == "held" and "review page" in r["summary"].lower(), (r["status"], r["summary"], r["needs"])
