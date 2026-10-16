import { test } from "node:test";
import assert from "node:assert/strict";
import { AvccDemuxer, avcCodecString, deviceUrl, displayRotation, fitFrame, hidUsage, nextOrientation, rawPoint, taggedJson } from "../src/lib/device-stream.ts";

function envelope(tag: number, payload: number[]): Uint8Array {
  const out = new Uint8Array(5 + payload.length);
  new DataView(out.buffer).setUint32(0, payload.length + 1, false);
  out[4] = tag;
  out.set(payload, 5);
  return out;
}

test("AVCC envelopes come out whole however the body is chunked", () => {
  const stream = new Uint8Array([
    ...envelope(4, [0xff, 0xd8]),
    ...envelope(1, [0x01, 0x64, 0x00, 0x33]),
    ...envelope(2, [9, 9, 9]),
    ...envelope(3, [7]),
    ...envelope(9, [1]),
  ]);
  const demuxer = new AvccDemuxer();
  const chunks = [];
  for (let offset = 0; offset < stream.length; offset += 3) chunks.push(...demuxer.push(stream.subarray(offset, offset + 3)));
  assert.deepEqual(chunks.map((chunk) => chunk.type), ["seed", "description", "keyframe", "delta"], "unknown tags are skipped");
  assert.deepEqual([...chunks[2]!.payload], [9, 9, 9]);
  assert.equal(avcCodecString(chunks[1]!.payload), "avc1.640033");
});

test("large envelopes grow the buffer", () => {
  const big = Array.from({ length: 200_000 }, (_, index) => index % 256);
  const chunks = new AvccDemuxer().push(envelope(3, big));
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0]!.payload.length, big.length);
});

test("input packets are a tag byte and JSON", () => {
  const packet = taggedJson(0x03, { type: "begin", x: 0.5, y: 0.25 });
  assert.equal(packet[0], 0x03);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(packet.subarray(1))), { type: "begin", x: 0.5, y: 0.25 });
});

test("keyboard codes map to USB HID usages", () => {
  assert.equal(hidUsage("KeyA"), 0x04);
  assert.equal(hidUsage("KeyZ"), 0x1d);
  assert.equal(hidUsage("Digit1"), 0x1e);
  assert.equal(hidUsage("Digit0"), 0x27);
  assert.equal(hidUsage("Enter"), 0x28);
  assert.equal(hidUsage("ArrowUp"), 0x52);
  assert.equal(hidUsage("F13"), null);
});

test("touches map from the rotated picture to the raw portrait framebuffer", () => {
  const portrait = { width: 1170, height: 2532, orientation: "portrait" as const };
  assert.deepEqual(rawPoint(portrait, 0.2, 0.3), { x: 0.2, y: 0.3 });
  assert.deepEqual(rawPoint({ ...portrait, orientation: "landscape_left" }, 0.2, 0.3), { x: 0.3, y: 0.8 });
  assert.deepEqual(rawPoint({ ...portrait, orientation: "landscape_right" }, 0.2, 0.3), { x: 0.7, y: 0.2 });
  assert.deepEqual(rawPoint({ ...portrait, orientation: "portrait_upside_down" }, 0.2, 0.3), { x: 0.8, y: 0.7 });
  // A framebuffer that is already landscape needs no remapping.
  assert.deepEqual(rawPoint({ width: 2532, height: 1170, orientation: "landscape_left" }, 0.2, 0.3), { x: 0.2, y: 0.3 });
  assert.equal(displayRotation({ ...portrait, orientation: "landscape_left" }), 90);
  assert.equal(displayRotation(null), 0);
  assert.equal(nextOrientation("portrait"), "landscape_left");
  assert.equal(nextOrientation("landscape_right"), "portrait");
});

test("hub URLs carry the token in the query", () => {
  const access = { httpBase: "http://127.0.0.1:5000", wsBase: "ws://127.0.0.1:5000", token: "a+b" };
  assert.equal(deviceUrl(access, "/helper/X/stream.avcc"), "http://127.0.0.1:5000/vendor/serve-sim/helper/X/stream.avcc?token=a%2Bb");
  assert.equal(deviceUrl(access, "/helper/ws?device=X", true), "ws://127.0.0.1:5000/vendor/serve-sim/helper/ws?device=X&token=a%2Bb");
});

test("the screen is the largest box at its aspect that fits the stage", () => {
  assert.deepEqual(fitFrame(0.5, 400, 400), { width: 200, height: 400 });
  assert.deepEqual(fitFrame(2, 400, 400), { width: 400, height: 200 });
  assert.deepEqual(fitFrame(0.5, 0, 400), { width: 0, height: 0 });
});
