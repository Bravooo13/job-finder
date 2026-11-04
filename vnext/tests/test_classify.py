from jobfinder import classify as c


def test_industry_role_and_company_keys():
    assert c.industry("DRW") == "quant" and c.industry("Databricks") == "tech" and c.industry("Chicago Trading Company") == "quant"
    assert c.industry("Some Fund", "We are a hedge fund and a proprietary trading firm.") == "quant"
    assert c.industry("Unknown Co", "", naics="52") == "finance"
    assert c.role_type("Data Science Intern") == "data-science"
    assert c.role_type("Machine Learning Engineer, Intern") == "data-science"
    assert c.role_type("Quantitative Research Intern") == "quant" and c.role_type("Software Engineer") == "software"
    assert c.company_key("GOLDMAN SACHS & CO LLC") == c.company_key("Goldman Sachs") == "goldman sachs"
    assert "amazon" in c.company_key_variants("AMAZON.COM SERVICES LLC")


def test_job_type_workplace_years_pay():
    assert c.job_type("Data Science Intern") == "internship" and c.job_type("Part-Time Data Analyst") == "part_time"
    assert c.workplace("Remote - US") == "remote" and c.workplace("Chicago, IL", "This is a hybrid role, 3 days a week in office") == "hybrid"
    assert c.years("3+ years of professional experience in SQL") == 3 and c.years("We have 25 years of history") is None
    assert c.pay("The pay is $45 - $55 per hour.") == "$45 – $55 an hour"
    assert c.pay("Base salary range: $120,000 - $150,000") == "$120,000 – $150,000 a year"
    assert c.pay("Over $5 billion in assets") == "" and c.pay("401(k) match") == ""
