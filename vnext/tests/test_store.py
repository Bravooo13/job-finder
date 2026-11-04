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


def test_tracker_history_and_h1b(private, tmp_path):
    from jobfinder import store

    jid, _ = store.upsert_job({"url": "https://example.com/j/1", "title": "Quant Intern", "company": "Jane Street", "description": "3+ years of experience"})
    store.set_job_status(jid, "applied")
    store.set_job_status(jid, "interview", note="Phone screen")
    store.add_note(jid, "Sent a thank-you")
    assert [e["status"] for e in store.job_events([jid])] == ["applied", "interview", None]
    assert store.find_job("Jane Street")[0]["id"] == jid and store.find_job("nobody") == []

    csv = tmp_path / "h1b.csv"
    csv.write_text('"Fiscal Year",Employer,"Initial Approval","Initial Denial","Continuing Approval","Continuing Denial",NAICS,"Tax ID",State,City,ZIP\n'
                   '2023,"JANE STREET GROUP LLC",1,0,5,0,52,1234,IL,CHICAGO,60606\n2023,"JANE STREET GROUP LLC",0,0,2,0,52,1234,NY,NEW YORK,10001\n')
    assert store.import_h1b(str(csv))["fiscal_year"] == 2023
    assert store.reclassify() == 1
    job = store.jobs("id=?", (jid,))[0]
    assert job["industry"] == "quant" and job["years"] == 3
    assert store.h1b_for(["jane street"])["jane street"]["total_approvals"] == 8


def test_cover_letter_needed_and_saved(private):
    from jobfinder import letters, store
    from jobfinder.apply.runner import LETTER_NEED, LETTER_OFF, letter_needed

    box = {"rule": "cover-letter-file", "filled": False, "required": True, "label": "Cover Letter*"}
    optional = {**box, "required": False}
    assert letter_needed([box], {}, {"cover_letters": "required"}) == LETTER_NEED
    assert letter_needed([optional], {}, {"cover_letters": "required"}) is None
    assert letter_needed([optional], {}, {"cover_letters": "always"}) == LETTER_NEED
    assert letter_needed([box], {}, {"cover_letters": "never"}) == LETTER_OFF
    assert letter_needed([box], {"cover_letter": "x.pdf"}, {}) is None

    jid, _ = store.upsert_job({"url": "https://example.com/j/2", "title": "Data Intern", "company": "Acme"})
    aid = store.queue_application({"id": jid, "title": "Data Intern", "company": "Acme"}, "https://example.com/apply/2", "greenhouse", True)
    store.claim_next()
    store.report(aid, "needs_you", needs=[LETTER_NEED])
    assert [w["app"]["id"] for w in letters.waiting()] == [aid]
    r = letters.save(jid, "Dear Acme team,\n\n" + "I like data. " * 60 + "\n\nBest,\nA. Person")
    assert r["retried"] == [aid] and store.application(aid)["status"] == "queued"
    assert letters.paths(jid)[1].read_bytes()[:4] == b"%PDF"
