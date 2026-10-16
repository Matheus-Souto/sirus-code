import assert from "node:assert/strict";
import { test } from "node:test";
import { clickRings, keyCaption, type InputEvent } from "../src/lib/recording-overlay.ts";

test("click rings grow over 600 ms and then disappear", () => {
  const events: InputEvent[] = [{ kind: "click", x: 10, y: 20, at: 1000 }];
  assert.deepEqual(clickRings(events, 1300), [{ x: 10, y: 20, progress: 0.5 }]);
  assert.deepEqual(clickRings(events, 1600), []);
});

test("typed letters run together while other keys and old ones drop out", () => {
  const key = (k: string, at: number): InputEvent => ({ kind: "key", key: k, at });
  const events = [key("X", 0), key("H", 1000), key("I", 1100), key("↩", 1200), key("⌘K", 1300), key("•", 1400), key("•", 1450)];
  assert.equal(keyCaption(events, 2000), "HI ↩ ⌘K • •");
  assert.equal(keyCaption(events, 5000), "");
});
