import test from "node:test";
import assert from "node:assert/strict";
import { FADE_DEFAULT_MS, FADE_MAX_MS, FADE_MIN_MS, MAX_FADE_CHUNKS, MAX_FRESH_FADE_CHARS, advanceFade, fadeDuration, nextCadence, shownEnd, startFade, visibleEnd } from "../src/lib/stream-fade.ts";

test("the fade follows the stream's cadence within 120–400 ms", () => {
  assert.equal(fadeDuration(null), FADE_DEFAULT_MS);
  assert.equal(fadeDuration(10), FADE_MIN_MS, "a fast stream fades briefly");
  assert.equal(fadeDuration(5000), FADE_MAX_MS, "a slow one never drags");
  assert.equal(fadeDuration(160), 240);
  assert.ok(fadeDuration(100) < fadeDuration(200));
  assert.equal(nextCadence(null, 120), 120, "the first gap is the cadence");
  assert.equal(nextCadence(100, 200), 130, "later gaps move it gradually");
  assert.equal(nextCadence(null, 60_000), 2000, "a long pause counts as 2 s at most");
});

test("while streaming only whole words show; a long unbroken run shows as it is", () => {
  assert.equal(visibleEnd("Hello wor", true), 6);
  assert.equal(visibleEnd("Hello world ", true), 12);
  assert.equal(visibleEnd("Hello wor", false), 9);
  assert.equal(visibleEnd("Hel", true), 0);
  const url = `See https://${"x".repeat(40)}`;
  assert.equal(visibleEnd(url, true), url.length);
});

const step = (now: number, hold = true, duration = 200) => ({ now, duration, hold });

test("text already there shows at once; fresh text fades as one chunk", () => {
  assert.deepEqual(startFade("Hello world ", step(0), false), { text: "Hello world ", settled: 12, chunks: [] });
  assert.deepEqual(startFade("Hello world ", step(0), true).chunks, [{ start: 0, end: 12, duration: 200, at: 0 }]);
  const long = "word ".repeat(MAX_FRESH_FADE_CHARS);
  assert.equal(startFade(long, step(0), true).chunks.length, 0, "a long run never fades whole");
});

test("only the newly arrived tail animates and settled text never animates again", () => {
  let state = startFade("One ", step(0), false);
  state = advanceFade(state, "One two ", step(50));
  assert.equal(state.settled, 4);
  assert.deepEqual(state.chunks, [{ start: 4, end: 8, duration: 200, at: 50 }]);
  state = advanceFade(state, "One two thr", step(100, true, 300));
  assert.equal(shownEnd(state), 8, "the half-written word waits");
  state = advanceFade(state, "One two three ", step(120, true, 300));
  assert.deepEqual(state.chunks.map((chunk) => [chunk.start, chunk.end, chunk.duration]), [[4, 8, 200], [8, 14, 300]]);
  // A re-render with the same text keeps the same state (and so the same spans).
  assert.equal(advanceFade(state, "One two three ", step(130)), state);
  // Finished fades join the settled text, oldest first.
  state = advanceFade(state, "One two three ", step(260));
  assert.equal(state.settled, 8);
  assert.deepEqual(state.chunks.map((chunk) => chunk.start), [8]);
  state = advanceFade(state, "One two three four ", step(1000));
  assert.equal(state.settled, 14);
  assert.deepEqual(state.chunks.map((chunk) => [chunk.start, chunk.end]), [[14, 19]]);
});

test("a rewritten prefix shows at once; the stream's end lets the last word out", () => {
  let state = startFade("Alpha beta ", step(0), false);
  state = advanceFade(state, "Gamma delta ", step(10));
  assert.deepEqual(state, { text: "Gamma delta ", settled: 12, chunks: [] });
  state = advanceFade(state, "Gamma delta eps", step(20));
  assert.equal(shownEnd(state), 12);
  state = advanceFade(state, "Gamma delta eps", step(30, false));
  assert.deepEqual(state.chunks.map((chunk) => [chunk.start, chunk.end]), [[12, 15]]);
});

test("the number of fading spans stays bounded for a long reply", () => {
  let text = "";
  let state = startFade(text, step(0), false);
  for (let index = 0; index < 500; index += 1) {
    text += "word ";
    state = advanceFade(state, text, step(index));
    assert.ok(state.chunks.length <= MAX_FADE_CHUNKS);
  }
  assert.equal(shownEnd(state), text.length);
  assert.equal(state.settled + state.chunks.reduce((sum, chunk) => sum + chunk.end - chunk.start, 0), text.length, "chunks are contiguous");
});
