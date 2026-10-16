import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDuration, isVideoPath, videoFormat } from "../src/lib/video-preview.ts";

test("common video containers open as videos, by extension", () => {
  for (const path of ["a.mp4", "b.MOV", "c.webm", "d.mkv", "dir/e.m4v"]) assert.equal(isVideoPath(path), true, path);
  for (const path of ["notes.txt", "mp4", "image.png", "video.mp4.txt"]) assert.equal(isVideoPath(path), false, path);
  assert.equal(videoFormat("clip.mov"), "MOV");
});

test("durations read as clock time", () => {
  assert.equal(formatDuration(5), "0:05");
  assert.equal(formatDuration(65.4), "1:05");
  assert.equal(formatDuration(3725), "1:02:05");
  assert.equal(formatDuration(Number.NaN), "");
});
