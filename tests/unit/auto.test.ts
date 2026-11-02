import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { readFileSync } from "node:fs";
import { HELPER_VERSION, olderVersion } from "@/lib/apply/auto-schema";
import { OUTCOME_PATTERNS, queueBlocker } from "@/lib/apply/outcome";

process.env.DATABASE_URL = `file:${path.join(mkdtempSync(path.join(tmpdir(), "jf-auto-")), "test.db")}`;

test("the expected helper version matches the extension", () => {
  const manifest = JSON.parse(readFileSync(path.join(process.cwd(), "extension", "manifest.json"), "utf8"));
  assert.equal(manifest.version, HELPER_VERSION);
  assert.ok(olderVersion("0.2.5", "0.2.7"));
  assert.ok(!olderVersion("0.2.7", "0.2.7"));
  assert.ok(!olderVersion("0.3.0", "0.2.9"));
});

test("postings Auto apply can't finish are skipped when queued", () => {
  assert.match(queueBlocker("https://hpe.wd5.myworkdayjobs.com/Jobsathpe/job/X_1") ?? "", /Workday/);
  assert.match(queueBlocker("https://jobs.example.taleo.net/careers/1") ?? "", /sign in/);
  assert.match(queueBlocker("https://job-boards.greenhouse.io/x/jobs/1", "REQUIRED: In a 60–90 second video, tell us about a time you used data. Send this to recruiting@example.com") ?? "", /video/);
  assert.match(queueBlocker("https://jobs.lever.co/x/1", "To apply, email your resume and portfolio to jobs@example.com") ?? "", /email/);
  assert.equal(queueBlocker("https://job-boards.greenhouse.io/x/jobs/1", "Questions? Email accommodations@example.com. We love video games."), null);
});

test("the after-Submit patterns read real pages", () => {
  const re = (s: string) => new RegExp(s, "i");
  assert.ok(re(OUTCOME_PATTERNS.thanks).test("Thank you for applying to Stripe!"));
  assert.ok(re(OUTCOME_PATTERNS.thanksUrl).test("/stripe/jobs/123/confirmation"));
  assert.ok(re(OUTCOME_PATTERNS.code).test("Enter the 8-character code we sent to your email"));
  assert.ok(re(OUTCOME_PATTERNS.code).test("Security code"));
  assert.ok(!re(OUTCOME_PATTERNS.code).test("Zip code"));
});

test("check first, the Submit lock and sending ready applications", async () => {
  const { enqueueApplications, reportTask, actOnTask, getTask, sendReady, TaskActionError } = await import("@/lib/apply/auto");
  const q = await enqueueApplications({ urls: ["https://job-boards.greenhouse.io/embed/job_app?for=acme&token=1", "https://acme.wd1.myworkdayjobs.com/x/job/1"], checkFirst: true });
  assert.equal(q.queued.length, 1);
  assert.match(q.skipped[0].reason, /Workday/);
  const id = q.queued[0].id;
  assert.equal((await getTask(id))?.checkOnly, true);

  // A checked form with every answer comes back ready, not held.
  await reportTask(id, { status: "running" });
  let t = await reportTask(id, { status: "held", summary: "Filled", checks: ["Why us?: …"] });
  assert.equal(t?.status, "ready");
  assert.match(t?.summary ?? "", /Ready to send/);

  // Sending it turns the check into a real application.
  const sent = await sendReady();
  assert.equal(sent.sent.length, 1);
  t = await getTask(id);
  assert.equal(t?.status, "queued");
  assert.equal(t?.checkOnly, false);

  // Submit pressed, no thank-you: unsure, never retried on its own.
  await reportTask(id, { status: "running" });
  await reportTask(id, { status: "submitting" });
  assert.ok((await getTask(id))?.submitPressedAt);
  t = await reportTask(id, { status: "held", pageNote: "New fields: Security code" });
  assert.equal(t?.status, "unsure");
  assert.equal(t?.pageNote, "New fields: Security code");
  await assert.rejects(() => actOnTask(id, "retry"), TaskActionError);
  await assert.rejects(() => actOnTask(id, "approve"), TaskActionError);

  // The owner says it didn't go through: it goes again, lock cleared.
  t = await actOnTask(id, "reopen");
  assert.equal(t?.status, "queued");
  assert.equal(t?.submitPressedAt, null);

  // Or he confirms it went through.
  await reportTask(id, { status: "running" });
  await reportTask(id, { status: "submitting" });
  await reportTask(id, { status: "failed", summary: "Tab closed" });
  assert.equal((await getTask(id))?.status, "unsure", "a failure after Submit is unsure too");
  t = await actOnTask(id, "submitted");
  assert.equal(t?.status, "submitted");
});

after(() => setTimeout(() => process.exit(), 50).unref());
