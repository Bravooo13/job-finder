import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSearchParams, elementHtml, parseJobPage, parseSearchCards, searchParamsFromUrl } from "@/lib/grab/linkedin-html";

// Shapes copied from LinkedIn's public (guest) pages; the jobs are made up.
const SEARCH = `
<li>
  <div class="base-card relative w-full base-search-card job-search-card" data-entity-urn="urn:li:jobPosting:4100000001">
    <a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/data-analyst-intern-at-acme-4100000001?position=1&amp;pageNum=0"><span class="sr-only">Data Analyst Intern</span></a>
    <div class="base-search-card__info">
      <h3 class="base-search-card__title">
        Data Analyst Intern
      </h3>
      <h4 class="base-search-card__subtitle"><a class="hidden-nested-link" href="https://www.linkedin.com/company/acme">Acme &amp; Co</a></h4>
      <div class="base-search-card__metadata">
        <span class="job-search-card__location">Chicago, IL</span>
        <span class="job-search-card__salary-info">$25.00/hr - $30.00/hr</span>
        <time class="job-search-card__listdate" datetime="2026-10-26">3 days ago</time>
      </div>
    </div>
  </div>
</li>
<li>
  <div class="base-card base-search-card job-search-card" data-entity-urn="urn:li:jobPosting:4100000002">
    <div class="base-search-card__info">
      <h3 class="base-search-card__title">Quant Research Intern</h3>
      <h4 class="base-search-card__subtitle"><a href="#">Beta Trading</a></h4>
      <span class="job-search-card__location">New York, NY (Hybrid)</span>
      <time class="job-search-card__listdate--new" datetime="2026-10-28">1 day ago</time>
    </div>
  </div>
</li>`;

const JOB = `
<section class="top-card-layout"><h2 class="top-card-layout__title font-sans topcard__title">Data Analyst Intern</h2>
<h4 class="top-card-layout__second-subline"><div class="topcard__flavor-row"><span class="topcard__flavor"><a class="topcard__org-name-link topcard__flavor--black-link" href="#">Acme &amp; Co</a></span>
<span class="topcard__flavor topcard__flavor--bullet">Chicago, IL</span></div>
<div class="topcard__flavor-row"><span class="posted-time-ago__text topcard__flavor--metadata">3 days ago</span></div></h4>
<a class="apply-button" data-tracking-control-name="public_jobs_apply-link-offsite_sign-up-modal" href="https://www.linkedin.com/jobs/view/externalApply/4100000001?url=https%3A%2F%2Fjob-boards%2Egreenhouse%2Eio%2Facme%2Fjobs%2F123&amp;urlHash=x">Apply</a></section>
<div class="compensation__salary">$25.00/hr - $30.00/hr</div>
<section class="show-more-less-html"><div class="show-more-less-html__markup show-more-less-html__markup--clamp-after-5 relative">
<p>Join our <strong>analytics</strong> team.</p><div><ul><li>SQL</li><li>Python</li></ul></div><p>We are open to candidates requiring visa sponsorship.</p></div></section>
<ul class="description__job-criteria-list">
<li class="description__job-criteria-item"><h3 class="description__job-criteria-subheader">Seniority level</h3><span class="description__job-criteria-text description__job-criteria-text--criteria">Internship</span></li>
<li class="description__job-criteria-item"><h3 class="description__job-criteria-subheader">Employment type</h3><span class="description__job-criteria-text">Internship</span></li>
<li class="description__job-criteria-item"><h3 class="description__job-criteria-subheader">Industries</h3><span class="description__job-criteria-text">Financial Services</span></li>
</ul>`;

test("job cards from a LinkedIn search page", () => {
  const cards = parseSearchCards(SEARCH);
  assert.equal(cards.length, 2);
  assert.deepEqual(cards[0], {
    id: "4100000001",
    title: "Data Analyst Intern",
    company: "Acme & Co",
    location: "Chicago, IL",
    postedAt: "2026-10-26",
    salary: "$25.00/hr - $30.00/hr",
  });
  assert.equal(cards[1].location, "New York, NY (Hybrid)");
  assert.equal(cards[1].salary, undefined);
});

test("a LinkedIn job page", () => {
  const d = parseJobPage(JOB);
  assert.equal(d.title, "Data Analyst Intern");
  assert.equal(d.company, "Acme & Co");
  assert.equal(d.location, "Chicago, IL");
  assert.equal(d.postedAt, "3 days ago");
  assert.equal(d.jobType, "Internship");
  assert.equal(d.industry, "Financial Services");
  assert.equal(d.applyUrl, "https://job-boards.greenhouse.io/acme/jobs/123");
  assert.match(d.description, /analytics/);
  assert.match(d.description, /SQL/);
  assert.match(d.description, /visa sponsorship/, "nested divs don't cut the description short");
});

test("nested tags of the same name", () => {
  assert.equal(elementHtml("<div class='x'><div class=\"a b\">1<div>2</div>3</div>4</div>", "a"), "1<div>2</div>3");
});

test("search settings from the address bar", () => {
  const p = searchParamsFromUrl("https://www.linkedin.com/jobs/search/?currentJobId=1&f_TPR=r604800&f_E=1%2C2&geoId=103112676&keywords=data%20analyst&location=Chicago%2C%20Illinois&origin=JOB_SEARCH_PAGE_JOB_FILTER&refresh=true");
  assert.ok(p);
  assert.equal(p.get("keywords"), "data analyst");
  assert.equal(p.get("geoId"), "103112676");
  assert.equal(p.get("f_TPR"), "r604800");
  assert.equal(p.get("f_E"), "1,2");
  assert.equal(p.get("currentJobId"), null);
  assert.equal(p.get("origin"), null);
  assert.equal(searchParamsFromUrl("https://example.com/jobs?keywords=x"), null);
  assert.equal(searchParamsFromUrl("https://www.linkedin.com/feed/"), null);
  const b = buildSearchParams({ keywords: "quant intern", postedDays: 7, remote: true });
  assert.equal(b.toString(), "keywords=quant+intern&location=United+States&f_TPR=r604800&f_WT=2");
});
