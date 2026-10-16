/**
 * The recording bar of composer dictation (ADR-023, ADR-129): the elapsed clock and the
 * shape of its waveform. Pure; the bars move with CSS, without an audio-level probe.
 */

/** "0:02", "1:05", "12:00". */
export function recordingClock(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Bar heights (px) and staggered delays (in --motion-slow units) for a waveform of `count` bars. */
export function waveformBars(count: number, tallest = 29, shortest = 7): { height: number; delay: number }[] {
  const span = Math.max(0, tallest - shortest);
  return Array.from({ length: Math.max(0, Math.floor(count)) }, (_, index) => ({
    height: Math.round(shortest + Math.sin(index * .63) ** 2 * span),
    delay: Number((-index * .41).toFixed(2)),
  }));
}
