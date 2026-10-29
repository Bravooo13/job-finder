import assert from "node:assert/strict";
import { test } from "node:test";
import { filtersFromParams, paramsFromRecord } from "@/lib/found/filters";

test("Found jobs filters from the URL", () => {
  const f = filtersFromParams(new URLSearchParams("visa=friendly&industry=quant,finance&role=data-science&state=IL,NY&level=internship&min=60&posted=7&sort=posted&pay=1"));
  assert.equal(f.visa, "friendly");
  assert.deepEqual(f.industries, ["quant", "finance"]);
  assert.deepEqual(f.roles, ["data-science"]);
  assert.deepEqual(f.states, ["IL", "NY"]);
  assert.deepEqual(f.levels, ["internship"]);
  assert.equal(f.minScore, 60);
  assert.equal(f.postedDays, 7);
  assert.equal(f.sort, "posted");
  assert.equal(f.hasPay, true);
  assert.equal(f.status, "new");
});

test("the old sponsor=1 link still hides no-sponsorship jobs", () => {
  const f = filtersFromParams(new URLSearchParams("sponsor=1"));
  assert.equal(f.visa, "nored");
  assert.equal(filtersFromParams(new URLSearchParams("visa=bogus")).visa, undefined);
});

test("page searchParams records become URLSearchParams", () => {
  const p = paramsFromRecord({ visa: "friendly", state: ["IL", "NY"], q: undefined });
  assert.equal(p.get("visa"), "friendly");
  assert.ok(p.getAll("state").length >= 1);
});
