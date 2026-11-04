from jobfinder.geo import places


def labels(s, hint=""):
    return [p["label"] for p in places(s, hint)["places"]]


def test_job_locations_become_places():
    assert labels("Seattle, WA; SF; NYC") == ["Seattle, WA", "San Francisco, CA", "New York, NY"]
    assert labels("Chicago, New York City") == ["Chicago, IL", "New York, NY"]
    assert labels("Cary,North Carolina,United States") == ["Cary, NC"]
    assert labels("Cambridge (US), Massachusetts, United States") == ["Cambridge, MA"]
    assert labels("Washington D.C.") == ["Washington, DC"]
    assert labels("US-CA-San Jose") == ["San Jose, CA"]
    assert labels("US - Missouri") == ["Missouri"]


def test_places_outside_the_us_and_remote():
    assert labels("London") == [] and labels("India, Bengaluru") == []
    assert labels("Vancouver, British Columbia, Canada") == []
    r = places("Remote - United States")
    assert r["places"] == [] and r["remote"]
    assert labels("", "IL") == ["Illinois"]
