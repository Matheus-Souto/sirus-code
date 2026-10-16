import { useEffect, useReducer, useRef } from "react";
import { HOLD_MS, advanceFade, shownEnd, startFade, type FadeState } from "@/lib/stream-fade";
import type { StreamFade } from "@/lib/use-stream-fade";

/** Text that mounts this soon after its message is treated as already there (a session switch). */
const MOUNT_GRACE_MS = 150;

/**
 * The last text run of a streaming reply (ADR-119): settled text as one plain node, and the
 * chunks that just arrived as spans fading in (`.stream-fade`). Chunk spans are keyed by their
 * start, so a re-render keeps them (and their running animation) and settled text never fades
 * again. Opacity only, so nothing moves. A word still being written waits for its end, but
 * never longer than HOLD_MS: a reply that pauses mid-word (a tool call) shows it as it is.
 */
export function StreamFadeText({ text, fade }: { text: string; fade: StreamFade }) {
  const state = useRef<FadeState | null>(null);
  const changed = useRef({ text, at: performance.now() });
  const [, refresh] = useReducer((count: number) => count + 1, 0);
  const now = performance.now();
  if (changed.current.text !== text) changed.current = { text, at: now };
  const step = { now, duration: fade.duration, hold: fade.hold && now - changed.current.at < HOLD_MS };
  state.current = state.current ? advanceFade(state.current, text, step) : startFade(text, step, now - fade.since > MOUNT_GRACE_MS);
  const { settled, chunks } = state.current;
  const held = shownEnd(state.current) < text.length;
  useEffect(() => {
    if (!held) return;
    const timer = window.setTimeout(refresh, HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [held, text]);
  return <>
    {text.slice(0, settled)}
    {chunks.map((chunk) => <span key={chunk.start} className="stream-fade" style={{ animationDuration: `${chunk.duration}ms` }}>{text.slice(chunk.start, chunk.end)}</span>)}
  </>;
}
