import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { costOf, startOfToday } from "@/lib/control/pricing";
import { controlSettingsSchema, DEFAULT_LEVELS, resolveLevel } from "@/lib/control/shared";

// A scratch database for the parts that read and write (permissions, requests, the log).
process.env.DATABASE_URL = `file:${path.join(mkdtempSync(path.join(tmpdir(), "jf-control-")), "test.db")}`;

test("prices Claude calls per model", () => {
  assert.equal(costOf("claude-sonnet-5-5", { input: 1_000_000, output: 0 }), 2);
  assert.equal(costOf("claude-sonnet-5-5-20260901", { input: 0, output: 1_000_000 }), 10);
  assert.equal(costOf("claude-opus-5-5", { input: 1_000_000, output: 1_000_000 }), 24);
  assert.ok(Math.abs(costOf("claude-haiku-5-5", { input: 10_000, output: 1_000 }) - 0.0015) < 1e-9);
  // Over 100,000 prompt tokens, Haiku 5.5 costs five times more.
  assert.ok(Math.abs(costOf("claude-haiku-5-5", { input: 200_000, output: 0 }) - 0.1) < 1e-9);
  // Cache reads are 5% of input on Sonnet 5.5; writes 125%; a web search is a cent.
  assert.ok(Math.abs(costOf("claude-sonnet-5-5", { input: 0, output: 0, cacheRead: 1_000_000 }) - 0.1) < 1e-9);
  assert.ok(Math.abs(costOf("claude-sonnet-5-5", { input: 0, output: 0, cacheWrite: 1_000_000 }) - 2.5) < 1e-9);
  assert.ok(Math.abs(costOf("claude-sonnet-5-5", { input: 0, output: 0, webSearches: 3 }) - 0.03) < 1e-9);
  // Unknown models are priced on the safe side.
  assert.equal(costOf("some-new-model", { input: 1_000_000, output: 0 }), 3);
  assert.equal(startOfToday(new Date(2026, 9, 30, 15, 4)).getHours(), 0);
});

test("permission levels: reading is always allowed, an action's own level beats its group's", () => {
  const s = controlSettingsSchema.parse({});
  assert.equal(s.dailyCapUsd, 5);
  assert.equal(resolveLevel(s, "save_found_job", "find"), "allow");
  assert.equal(resolveLevel(s, "approve_application", "approve"), "ask");
  assert.equal(DEFAULT_LEVELS.approve, "ask");
  const custom = { groups: { find: "ask" as const, read: "never" as const }, actions: { dismiss_found_job: "never" as const } };
  assert.equal(resolveLevel(custom, "save_found_job", "find"), "ask");
  assert.equal(resolveLevel(custom, "dismiss_found_job", "find"), "never");
  assert.equal(resolveLevel(custom, "search_found_jobs", "read"), "allow");
});

test("every action has a usable tool definition", async () => {
  const { ACTIONS, inputJsonSchema } = await import("@/lib/control/actions");
  const names = new Set<string>();
  for (const a of ACTIONS) {
    assert.match(a.name, /^[a-z_]{3,64}$/, a.name);
    assert.ok(!names.has(a.name), `duplicate ${a.name}`);
    names.add(a.name);
    assert.ok(a.description.length > 20, `${a.name} needs a description`);
    const schema = inputJsonSchema(a);
    assert.equal(schema.type, "object", a.name);
    assert.equal(schema.$schema, undefined);
  }
  // The names outside AIs already use stay the same.
  for (const n of ["job_finder_status", "search_found_jobs", "save_found_job", "grab_linkedin", "auto_apply", "auto_apply_status", "write_cover_letter", "mark_applied"]) assert.ok(names.has(n), n);
});

test("AIs follow the permissions; Ask me first waits for you; you can approve or decline", async () => {
  const { runAction, decideRequest } = await import("@/lib/control/run");
  const { saveControlSettings } = await import("@/lib/control/settings");
  const { listActivity, listRequests } = await import("@/lib/control/log");
  const { getApplyProfile } = await import("@/lib/apply/profile");

  // Allowed: runs and is logged as the AI that did it.
  let out = await runAction("update_apply_profile", { changes: { city: "Springfield" } }, { actor: "outside", via: "test-client" });
  assert.equal(out.status, "done");
  assert.equal((await getApplyProfile()).city, "Springfield");
  let log = await listActivity({ limit: 5 });
  assert.equal(log[0].actor, "outside");
  assert.equal(log[0].via, "test-client");
  assert.match(log[0].title, /Changed My answers: city/);

  // Bad input is refused before anything runs.
  out = await runAction("update_my_job", { status: "applied" }, { actor: "assistant" });
  assert.equal(out.status, "invalid");

  // Ask me first: nothing changes until you approve.
  await saveControlSettings({ groups: { settings: "ask" } });
  out = await runAction("update_apply_profile", { changes: { city: "Shelbyville" } }, { actor: "assistant", via: "Job Finder assistant" });
  assert.equal(out.status, "waiting");
  assert.equal((await getApplyProfile()).city, "Springfield");
  const [req] = await listRequests({ status: ["waiting"] });
  assert.equal(req.action, "update_apply_profile");
  const approved = await decideRequest(req.id, "approve");
  assert.equal(approved.ok, true);
  assert.equal((await getApplyProfile()).city, "Shelbyville");
  assert.equal((await decideRequest(req.id, "approve")).ok, false, "a request runs once");

  // Declining runs nothing.
  out = await runAction("update_apply_profile", { changes: { city: "Ogdenville" } }, { actor: "assistant" });
  assert.equal(out.status, "waiting");
  await decideRequest((out as { requestId: string }).requestId, "decline");
  assert.equal((await getApplyProfile()).city, "Shelbyville");

  // You are never held back by the AI permissions.
  out = await runAction("update_apply_profile", { changes: { city: "Capital City" } }, { actor: "you" });
  assert.equal(out.status, "done");

  // Never: refused, and the refusal is logged.
  await saveControlSettings({ actions: { update_apply_profile: "never" } });
  out = await runAction("update_apply_profile", { changes: { city: "North Haverbrook" } }, { actor: "outside" });
  assert.equal(out.status, "blocked");
  log = await listActivity({ limit: 1 });
  assert.equal(log[0].status, "blocked");

  // Changing the submit mode counts as approving, so it asks by default.
  out = await runAction("update_auto_apply_settings", { submit: "always" }, { actor: "outside" });
  assert.equal(out.status, "waiting");
  out = await runAction("update_auto_apply_settings", { pauseSeconds: 20 }, { actor: "outside" });
  assert.equal(out.status, "waiting", "settings group is set to ask in this test");
  await saveControlSettings({ groups: { settings: "allow" } });
  out = await runAction("update_auto_apply_settings", { pauseSeconds: 20 }, { actor: "outside" });
  assert.equal(out.status, "done");

  // Reading always works and isn't logged.
  const before = (await listActivity({ limit: 500 })).length;
  out = await runAction("get_apply_profile", {}, { actor: "outside" });
  assert.equal(out.status, "done");
  assert.equal((await listActivity({ limit: 500 })).length, before);
});

// The search scheduler keeps an interval alive once its module is loaded.
after(() => setTimeout(() => process.exit(), 50).unref());
