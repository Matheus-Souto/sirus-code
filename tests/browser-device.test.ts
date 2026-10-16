import assert from "node:assert/strict";
import { test } from "node:test";
import { DEVICE_PRESETS, MAX_SIDE, MIN_SIDE, clampSide, fitDevice, presetViewport, resized, rotated } from "../src/lib/browser-device.ts";

test("presets have unique ids", () => {
  assert.equal(DEVICE_PRESETS.length, 17);
  assert.equal(new Set(DEVICE_PRESETS.map((preset) => preset.id)).size, 17);
  assert.deepEqual(presetViewport("pixel-7"), { kind: "device", width: 412, height: 915, preset: "pixel-7" });
  assert.equal(presetViewport("unknown").preset, "iphone-12-pro");
});

test("sizes are clamped, rotation swaps and presets are recognised either way round", () => {
  assert.equal(clampSide(10), MIN_SIDE);
  assert.equal(clampSide(99_999), MAX_SIDE);
  assert.equal(clampSide(Number.NaN), MIN_SIDE);
  assert.deepEqual(rotated(presetViewport("iphone-se")), { kind: "device", width: 667, height: 375, preset: "iphone-se" });
  assert.equal(resized(667, 375).preset, "iphone-se");
  assert.equal(resized(500, 700).preset, null);
  assert.deepEqual(rotated({ kind: "fill" }), { kind: "fill" });
});

test("a device box fits the pane without growing past actual size", () => {
  assert.deepEqual(fitDevice({ width: 800, height: 1000 }, { width: 390, height: 844 }), { width: 390, height: 844, scale: 1 });
  const fit = fitDevice({ width: 400, height: 422 }, { width: 390, height: 844 });
  assert.equal(fit.scale, 0.5);
  assert.deepEqual([fit.width, fit.height], [195, 422]);
});
