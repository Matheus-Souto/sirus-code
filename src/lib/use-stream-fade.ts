import { useEffect, useRef, useState } from "react";
import { useMotionPreferences } from "@/lib/use-motion-preferences";
import { FADE_MAX_MS, fadeDuration, nextCadence } from "@/lib/stream-fade";

/** What the reply's last text run needs to fade its newest words (ADR-119). */
export interface StreamFade {
  /** Fade length for a chunk arriving now, from the stream's cadence. */
  duration: number;
  /** When the message mounted: text already there then shows at once. */
  since: number;
  /** While streaming, a word being written is held back until it is whole. */
  hold: boolean;
}

/**
 * The fade for a streaming reply, or null when nothing should fade: a settled reply (after one
 * last fade so the final words finish), reduced motion, or animations turned off. The cadence
 * is measured on the provider's own chunks (`content`), not on the paced reveal.
 */
export function useStreamFade(content: string, streaming: boolean): StreamFade | null {
  const reduced = useMotionPreferences();
  const [since] = useState(() => performance.now());
  const cadence = useRef<{ last: number; gap: number | null; length: number }>({ last: 0, gap: null, length: content.length });
  const active = streaming && !reduced;
  const [lingering, setLingering] = useState(false);
  useEffect(() => {
    if (active) { setLingering(true); return; }
    const timer = window.setTimeout(() => setLingering(false), FADE_MAX_MS);
    return () => window.clearTimeout(timer);
  }, [active]);
  useEffect(() => {
    if (!streaming) return;
    const known = cadence.current;
    if (content.length === known.length) return;
    const now = performance.now();
    if (known.last) known.gap = nextCadence(known.gap, now - known.last);
    known.last = now;
    known.length = content.length;
  }, [content, streaming]);
  if (reduced || !(active || lingering)) return null;
  return { duration: fadeDuration(cadence.current.gap), since, hold: streaming };
}
