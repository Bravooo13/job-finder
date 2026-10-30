import assert from "node:assert/strict";
import { test } from "node:test";
import { applicationUrl } from "@/lib/apply/apply-url";
import { decideSubmit } from "@/lib/apply/decide";

const sure = [
  { label: "First Name*", required: true, filled: true, value: "Alex", confidence: "high" as const },
  { label: "Will you require sponsorship?*", required: true, filled: true, value: "Yes", confidence: "high" as const },
  { label: "Cover letter", required: false, filled: false },
];

test("submit only when every answer is sure (the default)", () => {
  assert.equal(decideSubmit("sure", sure).action, "submit");
  const guessed = [...sure, { label: "Do you have research experience?", required: true, filled: true, value: "Yes", confidence: "medium" as const, ai: true }];
  const held = decideSubmit("sure", guessed);
  assert.equal(held.action, "hold");
  assert.equal(held.checks.length, 1);
  assert.match(held.checks[0], /research experience.*Yes \(AI\)/);
  assert.equal(decideSubmit("sure", guessed, { approved: true }).action, "submit", "you approved it");
  assert.equal(decideSubmit("always", guessed).action, "submit");
  assert.equal(decideSubmit("review", sure).action, "hold");
  assert.equal(decideSubmit("fill", sure, { approved: true }).action, "hold", "fill only never submits");
});

test("required blanks, unticked consent and blockers need you", () => {
  const d = decideSubmit("always", [
    ...sure,
    { label: "Postal Code:*", required: true, filled: false },
    { label: "I certify that the information is true*", required: true, filled: false, consent: true },
    { label: "Transcript", type: "file", required: true, filled: false },
  ]);
  assert.equal(d.action, "needs_you");
  assert.deepEqual(d.needs, ["Postal Code:", "Tick: I certify that the information is true", "Attach: Transcript"]);
  assert.equal(decideSubmit("sure", sure, { blockers: ["A CAPTCHA"] }).action, "needs_you");
});

test("application links: Greenhouse's own form, Lever and Ashby apply pages, job sites refused", () => {
  assert.deepEqual(applicationUrl({ url: "https://job-boards.greenhouse.io/westmonroe5/jobs/6167540004" }), {
    url: "https://job-boards.greenhouse.io/embed/job_app?for=westmonroe5&token=6167540004",
  });
  assert.deepEqual(applicationUrl({ url: "https://westmonroe.com/careers/job-details-students?gh_jid=6167540004", provider: "greenhouse", boardToken: "westmonroe5" }), {
    url: "https://job-boards.greenhouse.io/embed/job_app?for=westmonroe5&token=6167540004",
  });
  assert.deepEqual(applicationUrl({ url: "https://boards.greenhouse.io/acme/jobs/123456" }), { url: "https://job-boards.greenhouse.io/embed/job_app?for=acme&token=123456" });
  const lever = "https://jobs.lever.co/acme/0b5c2a8e-1111-2222-3333-444455556666";
  assert.deepEqual(applicationUrl({ url: lever }), { url: `${lever}/apply` });
  assert.deepEqual(applicationUrl({ url: `${lever}/apply` }), { url: `${lever}/apply` });
  const ashby = "https://jobs.ashbyhq.com/acme/0b5c2a8e-1111-2222-3333-444455556666";
  assert.deepEqual(applicationUrl({ url: ashby }), { url: `${ashby}/application` });
  assert.ok("error" in applicationUrl({ url: "https://www.linkedin.com/jobs/view/4458972577/" }));
  assert.deepEqual(applicationUrl({ url: "https://www.linkedin.com/jobs/view/1/", applyUrl: "https://acme.wd5.myworkdayjobs.com/Careers/job/X_R1" }), {
    url: "https://acme.wd5.myworkdayjobs.com/Careers/job/X_R1",
  });
});
