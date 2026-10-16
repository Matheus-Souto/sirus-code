import assert from "node:assert/strict";
import { test } from "node:test";
import { upwardIntent } from "../src/lib/transcript-scroll.ts";

const viewport = { clientWidth: 600, getBoundingClientRect: () => ({ left: 100 }) } as unknown as HTMLElement;
const node = (props: Record<string, unknown>) => ({ closest: () => null, parentElement: null, scrollHeight: 0, clientHeight: 0, scrollTop: 0, ...props });

test("keys, the scrollbar and upward wheels release following; typing does not", () => {
  assert.equal(upwardIntent(viewport, node({}) as never, { kind: "key", key: "PageUp" }), -1);
  assert.equal(upwardIntent(viewport, node({}) as never, { kind: "key", key: "ArrowDown" }), undefined);
  assert.equal(upwardIntent(viewport, node({ closest: () => ({}) }) as never, { kind: "key", key: "ArrowUp" }), undefined);
  assert.equal(upwardIntent(viewport, null, { kind: "pointer", clientX: 705 }), -1);
  assert.equal(upwardIntent(viewport, null, { kind: "pointer", clientX: 400 }), undefined);
  assert.equal(upwardIntent(viewport, node({}) as never, { kind: "wheel", deltaY: -30 }), -30);
  assert.equal(upwardIntent(viewport, node({}) as never, { kind: "wheel", deltaY: 30 }), undefined);
  assert.equal(upwardIntent(viewport, node({}) as never, { kind: "touch", deltaY: -12 }), -12);
});
