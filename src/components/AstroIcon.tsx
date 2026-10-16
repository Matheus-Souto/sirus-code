import { useEffect, useRef, useState } from "react";
import type { AstroIconId, AstroStyle } from "@/client/types";
import { ambientActive, subscribeAmbient } from "@/lib/ambient-motion";
import { paintAstroIcon } from "@/lib/astro-art";
import { useMotionPreferences } from "@/lib/use-motion-preferences";

/**
 * One animation loop paints every mounted, animated Astro icon (the icon pickers). It runs
 * only while one is mounted and the ambient gate is open (window focused, document visible,
 * Settings closed).
 */
type Painter = (now: number) => void;
const painters = new Set<Painter>();
let frame = 0;
const STILL = 1200;

function loop(now: number) {
  for (const paint of painters) paint(now);
  frame = painters.size && ambientActive() ? requestAnimationFrame(loop) : 0;
}
function kick() {
  if (!frame && painters.size && ambientActive()) frame = requestAnimationFrame(loop);
}
if (typeof window !== "undefined") subscribeAmbient(kick);

/** An Astro project icon. `still` draws one frame and never joins the animation loop (dense lists such as the sidebar). */
export function AstroIcon({ icon, style, color, size, className, still = false }: { icon: AstroIconId; style: AstroStyle; color: string; size: number; className?: string; still?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = useMotionPreferences();
  const latest = useRef<Painter>(() => undefined);
  // A painter whose identity never changes and that always calls the latest drawing.
  const [paint] = useState<Painter>(() => (now: number) => latest.current(now));
  const pixels = Math.round(size * Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1));
  // Resizing the bitmap clears it, so a new size repaints too.
  useEffect(() => {
    latest.current = (now) => { if (canvas.current) paintAstroIcon(canvas.current, icon, style, color, now); };
    paint(reduced || still ? STILL : performance.now());
  }, [icon, style, color, pixels, reduced, still, paint]);
  const animate = !reduced && !still;
  useEffect(() => {
    if (!animate) return;
    painters.add(paint);
    kick();
    return () => { painters.delete(paint); };
  }, [paint, animate]);
  return <canvas ref={canvas} aria-hidden="true" width={pixels} height={pixels} className={className} style={{ width: size, height: size, display: "block" }} />;
}
