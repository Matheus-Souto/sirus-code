import assert from "node:assert/strict";
import { test } from "node:test";
import { recordingBitrate, recordingFormat } from "../src/lib/recording-format.ts";

test("recordings prefer MP4 and fall back to WebM", () => {
  assert.deepEqual(recordingFormat(() => true), { mime: "video/mp4;codecs=avc1", extension: "mp4" });
  assert.deepEqual(recordingFormat((type) => type.startsWith("video/webm")), { mime: "video/webm;codecs=vp9", extension: "webm" });
  assert.equal(recordingFormat(() => false), null);
});

test("bitrate follows the frame size within bounds", () => {
  assert.equal(recordingBitrate(100, 100), 2_500_000);
  assert.equal(recordingBitrate(3840, 2160), 6_220_800);
  assert.equal(recordingBitrate(9000, 9000), 50_000_000);
});
