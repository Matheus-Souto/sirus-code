import { test } from "node:test";
import assert from "node:assert/strict";
import { contextRing, formatTokens } from "../src/lib/context-meter.ts";

test("token counts never read 1000K or 1000M", () => {
  assert.equal(formatTokens(0), "0");
  assert.equal(formatTokens(999), "999");
  assert.equal(formatTokens(1_000), "1K");
  assert.equal(formatTokens(9_500), "9.5K");
  assert.equal(formatTokens(9_960), "10K");
  assert.equal(formatTokens(120_400), "120K");
  assert.equal(formatTokens(999_499), "999K");
  assert.equal(formatTokens(999_500), "1M");
  assert.equal(formatTokens(999_999), "1M");
  assert.equal(formatTokens(1_000_000), "1M");
  assert.equal(formatTokens(1_250_000), "1.3M");
  assert.equal(formatTokens(9_960_000), "10M");
});

test("the ring draws no arc while usage rounds to zero", () => {
  assert.deepEqual(contextRing(0, 200_000), { ratio: 0, percent: 0, level: "normal", arc: false });
  assert.equal(contextRing(500, 200_000).arc, false, "0.25% rounds to 0");
  assert.equal(contextRing(2_000, 200_000).arc, true);
  assert.equal(contextRing(160_000, 200_000).level, "warning");
  assert.equal(contextRing(190_000, 200_000).level, "danger");
  assert.equal(contextRing(400_000, 200_000).percent, 100);
  assert.equal(contextRing(10, 0).arc, false);
});
