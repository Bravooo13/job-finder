import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePostedDate } from "@/lib/grab/dates";
import { jobPostingsFromHtml, pageTextAndLinks } from "@/lib/grab/html";

test("posted dates in the forms job sites show", () => {
  const now = Date.parse("2026-10-29T12:00:00Z");
  const day = (v: string | number) => parsePostedDate(v, now)?.toISOString().slice(0, 10);
  assert.equal(day("6 days ago"), "2026-10-23");
  assert.equal(day("Posted 3d ago"), "2026-10-26");
  assert.equal(day("1wk ago"), "2026-10-22");
  assert.equal(day("Reposted 2 weeks ago"), "2026-10-15");
  assert.equal(day("2026-10-20"), "2026-10-20");
  assert.equal(parsePostedDate("3mo ago", now)?.toISOString().slice(0, 7), "2026-07");
  assert.equal(parsePostedDate(1790380800, now)?.getUTCFullYear(), 2026);
  assert.equal(parsePostedDate("whenever", now), null);
});

const PAGE = `<!doctype html><html><head><title>Careers at Acme</title>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
  {"@type":"JobPosting","title":"Data Analyst Intern","url":"https://acme.example/jobs/1",
   "hiringOrganization":{"@type":"Organization","name":"Acme"},
   "jobLocation":{"@type":"Place","address":{"addressLocality":"Chicago","addressRegion":"IL","addressCountry":"US"}},
   "datePosted":"2026-10-20","employmentType":"INTERN","description":"<p>Work with SQL &amp; Python.</p>"},
  {"@type":"Organization","name":"Acme"}]}</script>
</head><body><nav><a href="/about">About &amp; team</a></nav>
<h1>Open roles</h1><ul><li><a href="https://boards.greenhouse.io/acme/jobs/123">Quant Intern</a></li></ul>
<script>var x = "<a href='/hidden'>no</a>";</script></body></html>`;

test("reads JSON-LD job postings, even inside @graph", () => {
  const jobs = jobPostingsFromHtml(PAGE, "https://acme.example/careers");
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, "Data Analyst Intern");
  assert.equal(jobs[0].company, "Acme");
  assert.match(jobs[0].location ?? "", /Chicago/);
  assert.match(jobs[0].description ?? "", /SQL & Python/);
});

test("page text and absolute links for the AI fallback", () => {
  const { text, links } = pageTextAndLinks(PAGE, "https://acme.example/careers");
  assert.ok(text.includes("Open roles"));
  assert.ok(!text.includes("var x"), "scripts are dropped");
  assert.deepEqual(
    links.map((l) => [l.text, l.href]),
    [
      ["About & team", "https://acme.example/about"],
      ["Quant Intern", "https://boards.greenhouse.io/acme/jobs/123"],
    ],
  );
});
