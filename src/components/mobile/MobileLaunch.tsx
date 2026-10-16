import { useEffect, useState } from "react";
import { useMotionPreferences } from "@/lib/use-motion-preferences";
import { useAppStore } from "@/store/app-store";
import "@/styles/mobile-launch.css";

/** The launch shows at most once per app start. */
let shown = false;
/** Shortest and longest time the orbit runs before the glyph lands. */
const MIN_MS = 900;
const MAX_MS = 6000;
/** Landing (glyph and flash), then the hand-off to Home. */
const LAND_MS = 520;
const OUT_MS = 380;

type Phase = "orbit" | "land" | "out" | "done";

/**
 * The phone app's opening (2026-10-14, after the owner's "A2 · orbit that lands"): two orbits
 * close in while a point of light circles; once the app is connected (or after six seconds)
 * the light lands, the glyph appears with a flash, and Home enters with its rows rising one by
 * one. Reduced motion skips it.
 */
export function MobileLaunch() {
  const reduced = useMotionPreferences();
  const ready = useAppStore((state) => state.ready);
  const [phase, setPhase] = useState<Phase>(() => (shown || reduced ? "done" : "orbit"));
  const [started] = useState(() => performance.now());
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    if (phase !== "orbit") return;
    const timer = window.setTimeout(() => setWaited(true), MAX_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "orbit" || !(ready || waited)) return;
    const timer = window.setTimeout(() => setPhase("land"), Math.max(0, MIN_MS - (performance.now() - started)));
    return () => window.clearTimeout(timer);
  }, [phase, ready, waited, started]);

  useEffect(() => {
    if (phase === "land") {
      const timer = window.setTimeout(() => setPhase("out"), LAND_MS);
      return () => window.clearTimeout(timer);
    }
    if (phase === "out") {
      // Home enters as the launch fades (mobile-launch.css, `data-entering`).
      document.querySelector(".mobile-app")?.setAttribute("data-entering", "");
      const timer = window.setTimeout(() => setPhase("done"), OUT_MS);
      return () => window.clearTimeout(timer);
    }
    if (phase === "done") {
      shown = true;
      const timer = window.setTimeout(() => document.querySelector(".mobile-app")?.removeAttribute("data-entering"), 900);
      return () => window.clearTimeout(timer);
    }
  }, [phase]);

  if (phase === "done") return null;
  return <div className="mobile-launch" data-phase={phase} aria-hidden="true">
    <div className="mobile-launch-orbit mobile-launch-orbit-outer" />
    <div className="mobile-launch-orbit mobile-launch-orbit-inner" />
    <div className="mobile-launch-light" />
    <div className="mobile-launch-flash" />
    <img className="mobile-launch-glyph" src="/sirus-glyph.png" alt="" draggable={false} />
  </div>;
}
