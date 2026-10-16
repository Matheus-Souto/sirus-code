/** What recordings draw over the page (ADR-112): click rings and a key caption. */

export type InputEvent = { kind: "key"; key: string; at: number } | { kind: "click"; x: number; y: number; at: number };

const RING_MS = 600;
const CAPTION_MS = 1500;
const CAPTION_KEYS = 12;

/** Clicks still animating at `now`, with how far along their ring is (0–1). */
export function clickRings(events: readonly InputEvent[], now: number) {
  return events.flatMap((event) => event.kind === "click" && now - event.at >= 0 && now - event.at < RING_MS
    ? [{ x: event.x, y: event.y, progress: (now - event.at) / RING_MS }] : []);
}

/** Recent keys as one line: typed letters run together, other keys stand apart. */
export function keyCaption(events: readonly InputEvent[], now: number): string {
  const keys = events.filter((event): event is Extract<InputEvent, { kind: "key" }> => event.kind === "key" && now - event.at < CAPTION_MS).slice(-CAPTION_KEYS);
  const parts: string[] = [];
  let word = false;
  for (const { key } of keys) {
    const single = /^[\p{L}\p{N}\p{P}]$/u.test(key) && key !== "•";
    if (single && word) parts[parts.length - 1] += key;
    else parts.push(key);
    word = single;
  }
  return parts.join(" ");
}
