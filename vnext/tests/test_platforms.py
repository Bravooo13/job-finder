import json

from jobfinder import platforms
from jobfinder.feeds import boards_in_text, parse_linkedin_cards


def test_registry_is_complete_and_valid():
    reg = platforms.registry()
    ids = [p["id"] for p in reg]
    assert len(ids) == len(set(ids)) and len(ids) >= 70
    for must in ["workday", "greenhouse", "lever", "ashby", "icims", "taleo", "oracle", "successfactors", "smartrecruiters", "jobvite", "workable", "bamboohr", "linkedin"]:
        assert must in ids
    for p in reg:
        assert p["automation"] in ("full", "fill", "manual") and p["confidence"] in ("verified", "documented", "pattern")


def test_detect():
    cases = {
        "https://hpe.wd5.myworkdayjobs.com/Jobsathpe/job/San-Jose/AI_1217413": "workday",
        "https://job-boards.greenhouse.io/stripe/jobs/8333074": "greenhouse",
        "https://stripe.com/jobs/listing/x/8333074?gh_jid=8333074": "greenhouse",
        "https://jobs.lever.co/acme/0b3b3a2e-1111-2222-3333-444455556666": "lever",
        "https://careers-acme.icims.com/jobs/1234/analyst/job": "icims",
        "https://acme.taleo.net/careersection/2/jobdetail.ftl?job=1": "taleo",
        "https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/1": "oracle",
        "https://apply.workable.com/acme/j/ABC123/": "workable",
        "https://acme.bamboohr.com/careers/12": "bamboohr",
        "https://www.linkedin.com/jobs/view/123/": "linkedin",
        "https://example.com/careers/analyst": "custom",
    }
    for url, pid in cases.items():
        assert platforms.detect(url)["id"] == pid, url


def test_application_url():
    assert platforms.application_url("https://job-boards.greenhouse.io/stripe/jobs/8333074")[0] == "https://job-boards.greenhouse.io/embed/job_app?for=stripe&token=8333074"
    assert platforms.application_url("https://jobs.lever.co/acme/0b3b3a2e-1111-2222-3333-444455556666")[0].endswith("/apply")
    url, why = platforms.application_url("https://www.linkedin.com/jobs/view/123/")
    assert url is None and "linkedin.com" in why


def test_queue_blockers():
    assert "apply there yourself" in platforms.queue_blocker("https://www.linkedin.com/jobs/view/1/")
    assert "video" in platforms.queue_blocker("https://jobs.lever.co/x/1", "REQUIRED: In a 60–90 second video, tell us about a time you used data.")
    assert platforms.queue_blocker("https://job-boards.greenhouse.io/x/jobs/1", "We love video games.") is None


def test_board_learning_and_linkedin_cards():
    found = boards_in_text("Apply at https://job-boards.greenhouse.io/stripe/jobs/1 or https://acme.wd1.myworkdayjobs.com/External/job/X")
    assert {"platform": "greenhouse", "token": "stripe"} in found
    assert any(b["platform"] == "workday" and b["site"] == "External" for b in found)
    html = '<li><div data-entity-urn="urn:li:jobPosting:4012345678"><h3 class="base-search-card__title">Data Intern</h3><h4 class="base-search-card__subtitle">Acme</h4><span class="job-search-card__location">Chicago, IL</span><time datetime="2026-10-30"></time></div></li>'
    cards = parse_linkedin_cards(html)
    assert cards[0]["title"] == "Data Intern" and cards[0]["company"] == "Acme"
