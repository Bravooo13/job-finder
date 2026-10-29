import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyIndustry } from "@/lib/classify/industry";
import { classifyRole } from "@/lib/classify/role";
import { classifyVisa, sentenceAround } from "@/lib/classify/visa";

test("visa wording from postings and job sites", () => {
  assert.equal(classifyVisa("Analyst", "", "US work authorization not required").status, "opt_cpt");
  assert.equal(classifyVisa("Analyst", "", "US work authorization required").status, "no_sponsorship");
  assert.equal(classifyVisa("Analyst", "We are open to candidates requiring visa sponsorship.").status, "sponsors");
  assert.equal(classifyVisa("Intern", "Unfortunately we cannot sponsor H-1B. Students on CPT or OPT are welcome to apply.").status, "opt_cpt");
  assert.equal(classifyVisa("Intern", "", "Offers Sponsorship").status, "sponsors");
  assert.equal(classifyVisa("Intern", "", "Does Not Offer Sponsorship").status, "no_sponsorship");
  assert.equal(classifyVisa("Intern", "Must be a U.S. citizen due to ITAR.").status, "citizens_only");
  assert.equal(classifyVisa("Intern", "Great team, free lunch.").status, "unknown");
});

test("visa notes are whole sentences, cut cleanly when long", () => {
  assert.equal(
    sentenceAround("Intro. Northern Trust will not sponsor applicants for U.S. work visa status. Next.", 7, 10),
    "Northern Trust will not sponsor applicants for U.S. work visa status.",
  );
  const long = `${"word ".repeat(120)}you must be a U.S. citizen ${"more ".repeat(120)}.`;
  const note = sentenceAround(long, long.indexOf("you must"), 8);
  assert.ok(note.length <= 302, `note is ${note.length} chars`);
  assert.ok(note.includes("you must be a U.S. citizen"));
  assert.ok(note.startsWith("…") && note.endsWith("…"));
});

test("role types from titles", () => {
  assert.equal(classifyRole("Equity Research Analyst"), "finance");
  assert.equal(classifyRole("Data Science Intern"), "data-science");
  assert.equal(classifyRole("Software Engineer, Trading Systems"), "software");
  assert.equal(classifyRole("Quantitative Researcher"), "quant");
});

test("industry from a description", () => {
  const intern = "We hire university students for our summer program. Candidates must be enrolled in a college or university. Students will learn from academic mentors.";
  assert.notEqual(classifyIndustry({ company: "Acme Logistics Co", description: intern }), "education");
  assert.equal(
    classifyIndustry({ company: "Gamma Holdings", description: "Gamma is a proprietary trading firm and market maker. Our trading firm uses quantitative trading." }),
    "quant",
  );
  assert.equal(classifyIndustry({ company: "Delta Learning", description: "An edtech company building curriculum tools for teachers and learners." }), "education");
});
