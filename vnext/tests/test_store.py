import pytest


def test_check_first_submit_lock_and_reopen(private):
    from jobfinder import store

    jid, _ = store.upsert_job({"url": "https://job-boards.greenhouse.io/acme/jobs/1", "title": "Data Intern", "company": "Acme"})
    aid = store.queue_application({"id": jid, "title": "Data Intern", "company": "Acme"}, "https://job-boards.greenhouse.io/embed/job_app?for=acme&token=1", "greenhouse", True)
    assert store.queue_application({"id": jid}, "x", "greenhouse", True) is None, "never queued twice"
    store.claim_next()
    assert store.report(aid, "held")["status"] == "ready"
    assert store.send_ready() == 1
    app = store.application(aid)
    assert app["status"] == "queued" and app["check_only"] == 0
    store.claim_next()
    store.report(aid, "submitting")
    assert store.report(aid, "held", page_note="New fields: Security code")["status"] == "unsure"
    with pytest.raises(store.LockedError):
        store.act(aid, "retry")
    assert store.act(aid, "reopen")["submit_pressed_at"] is None
    store.claim_next()
    store.report(aid, "submitting")
    store.report(aid, "failed")
    assert store.application(aid)["status"] == "unsure"
    assert store.act(aid, "submitted")["status"] == "submitted"
    assert store.jobs("id=?", (jid,))[0]["status"] == "applied"


def test_dashboard_writes_a_file(private):
    from jobfinder import dashboard, store

    store.upsert_job({"url": "https://example.com/j/1", "title": "Analyst <b>", "company": "Ex"})
    path = dashboard.write()
    html = path.read_text()
    assert "Analyst <b>" not in html.split("const DATA =")[0] and '"Analyst <b>"' in html
