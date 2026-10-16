/** Compact token count: 950, 9.5K, 120K, 1M, 1.2M. Values that would round up to
 * 1000 of a unit move to the next one, so 999,500 reads "1M", never "1000K". */
export function formatTokens(value: number): string {
  if (value < 1000) return String(value);
  if (value < 999_500) return `${value < 9_950 ? trim((value / 1000).toFixed(1)) : Math.round(value / 1000)}K`;
  const millions = value / 1_000_000;
  return `${millions < 9.95 ? trim(millions.toFixed(1)) : Math.round(millions)}M`;
}

function trim(text: string) {
  return text.replace(/\.0$/, "");
}

export type ContextRing = { ratio: number; percent: number; level: "normal" | "warning" | "danger"; arc: boolean };

/** The ring's reading. No arc while usage rounds to 0%: a round cap on a zero-length
 * dash would still draw a dot, so the ring stays empty. */
export function contextRing(used: number, window: number): ContextRing {
  const ratio = window > 0 && used > 0 ? Math.min(1, used / window) : 0;
  const percent = Math.round(ratio * 100);
  const level = ratio >= 0.9 ? "danger" : ratio >= 0.75 ? "warning" : "normal";
  return { ratio, percent, level, arc: percent > 0 };
}
