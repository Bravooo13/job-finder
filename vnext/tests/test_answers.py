from jobfinder.answers import Field, answer_fields, gpa_option, same_question

F1 = {"firstName": "Alex", "lastName": "Doe", "email": "alex@example.edu", "city": "Chicago", "state": "Illinois", "country": "United States",
      "school": "University of Chicago", "degree": "M.S.", "major": "Applied Data Science", "gpa": "3.43", "schoolStart": "2026-09", "graduation": "2028-05",
      "authorizedToWork": "yes", "needsSponsorshipNow": "no", "needsSponsorshipLater": "yes", "visaStatus": "F-1 student (CPT/OPT)", "usCitizen": "no",
      "permanentResident": "no", "usPerson": "no", "hispanicLatino": "Not", "hearAbout": "LinkedIn", "currentEmployer": "Acme", "currentTitle": "Analyst", "custom": []}
YN = ["Yes", "No"]


def ask(label, type="select", options=None, **kw):
    return answer_fields([Field("k", label, type, options if options is not None else YN, **kw)], F1, kw.pop("ctx", {}) if "ctx" in kw else {})[0]


def test_work_authorization_wordings():
    assert ask("Are you legally authorized to work in the United States?")["value"] == "Yes"
    assert ask("Will you now or in the future require sponsorship for employment visa status (e.g., H-1B)?")["value"] == "Yes"
    assert ask("Do you require sponsorship to start this position?")["value"] == "No"
    assert ask("Are you authorized to work in the US without sponsorship now or in the future?")["value"] == "No"
    a = ask("Are you authorized to work in the U.S. without sponsorship?")
    assert a["value"] == "Yes" and a["confidence"] == "medium"
    assert ask("Are you legally authorized to work in the country where this position is located?")["value"] == "Yes"
    assert ask("Are you a U.S. citizen?")["value"] == "No"
    assert ask("What is your visa status?", options=["US Citizen", "Green Card", "F-1", "H-1B"])["value"] == "F-1"


def test_education_rows_and_gpa():
    fields = [Field("s", "School", "combobox", hint="school--1"), Field("d", "Degree", "combobox", ["Bachelor's Degree", "Master's Degree"], hint="degree--1"),
              Field("m", "Discipline", "combobox", hint="discipline--1"), Field("sm", "Start date month", "combobox", hint="start-month--1")]
    got = {a["key"]: a["value"] for a in answer_fields(fields, F1)}
    assert got == {"s": "University of Chicago", "d": "Master's Degree", "m": "Applied Data Science", "sm": "September"}
    assert gpa_option(["3.5+", "3.0-3.49", "Below 3.0"], "3.43") == "3.0-3.49"


def test_consent_follows_the_setting():
    f = [Field("c", "I certify that the information I have provided is true and accurate", "checkbox")]
    assert answer_fields(f, F1)[0]["value"] is None
    assert answer_fields(f, F1, {"consent": True})[0]["value"] is True


def test_eeo_and_saved_answers():
    assert ask("Are you Hispanic or Latinx?", options=["Yes", "No", "I don't wish to answer"])["value"] == "No"
    assert ask("Gender", options=["Male", "Female", "I don't wish to answer"])["value"] == "I don't wish to answer"
    p = {**F1, "custom": [{"question": "Are you planning on attending NeurIPS in person this year?", "answer": "No"}]}
    assert answer_fields([Field("n", "Will you attend NeurIPS this year in person?", "select", YN)], p)[0]["value"] == "No"
    assert not same_question("Do you have experience with Python?", "Do you have experience with SQL?")


def test_open_questions_need_writing():
    a = answer_fields([Field("w", "Why do you want to work here?", "textarea")], F1)[0]
    assert a["value"] is None and a["needs_writing"]


def test_file_fields_labelled_attach():
    # New Greenhouse forms: the file input's own label is the "Attach" button; the id says which file.
    out = answer_fields([Field("r", "Attach", "file", hint="resume"), Field("c", "Attach", "file", hint="cover_letter"),
                         Field("x", "Resume/CV*", "file", required=True)], {}, {})
    assert [a.get("file") for a in out] == ["resume", "cover_letter", "resume"]
    t = answer_fields([Field("t", "Please provide a copy of your most recent transcript from your highest degree level.*", "file", required=True)], {}, {})
    assert t[0].get("file") == "transcript"
