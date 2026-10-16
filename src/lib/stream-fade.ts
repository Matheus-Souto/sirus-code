/**
 * Streaming text fade (ADR-119): while a reply streams, the words that just
 * arrived fade in. Only the tail of the reply's last text run is wrapped, in a few chunk spans
 * keyed by where they start, so settled text keeps its node and never fades twice, and a long
 * reply never holds a span per word. Everything here is pure; `use-stream-fade.ts` and
 * `StreamFadeText.tsx` hold the React side.
 */

/** Fade bounds: a quick stream fades briefly, a slow one more gently. */
export const FADE_MIN_MS = 120;
export const FADE_MAX_MS = 400;
/** Used before the stream has shown its pace. */
export const FADE_DEFAULT_MS = 220;
/** At most this many chunks animate at once; older ones join the settled text. */
export const MAX_FADE_CHUNKS = 24;
/** A word still being written is held back, unless it is this long (a URL, text without spaces). */
export const MAX_HELD_CHARS = 24;
/** How long a half-written word may wait for the rest before it shows as it is. */
export const HOLD_MS = 150;
/** A text run that mounts with more than this already in it shows at once instead of fading. */
export const MAX_FRESH_FADE_CHARS = 80;

/** The smoothed time between chunks: a moving average that ignores pauses longer than 2 s. */
export function nextCadence(previous: number | null, gapMs: number): number {
  const gap = Math.min(2000, Math.max(0, gapMs));
  return previous === null ? gap : previous * 0.7 + gap * 0.3;
}

/** How long a newly arrived chunk fades, from the stream's cadence. */
export function fadeDuration(cadenceMs: number | null): number {
  if (cadenceMs === null || !Number.isFinite(cadenceMs)) return FADE_DEFAULT_MS;
  return Math.round(Math.min(FADE_MAX_MS, Math.max(FADE_MIN_MS, cadenceMs * 1.5)));
}

const isSpace = (char: string) => char === " " || char === "\n" || char === "\t" || char === "\r";

/**
 * How much of `text` to show: everything once the stream is over (`hold` false); while it
 * streams, up to the last whole word, so a word appears (and fades) once and never in pieces.
 */
export function visibleEnd(text: string, hold: boolean): number {
  if (!hold || !text || isSpace(text[text.length - 1])) return text.length;
  let end = text.length;
  while (end > 0 && !isSpace(text[end - 1])) end -= 1;
  return text.length - end > MAX_HELD_CHARS ? text.length : end;
}

export interface FadeChunk { start: number; end: number; duration: number; at: number }
/** `text.slice(0, settled)` is plain; each chunk after it is a fading span. */
export interface FadeState { text: string; settled: number; chunks: FadeChunk[] }

export interface FadeStep { now: number; duration: number; hold: boolean }

/** The first state of a text run: shown at once, or (when `animate`) fading in as one chunk. */
export function startFade(text: string, step: FadeStep, animate: boolean): FadeState {
  const end = visibleEnd(text, step.hold);
  if (!animate || end === 0 || end > MAX_FRESH_FADE_CHARS) return { text, settled: end, chunks: [] };
  return { text, settled: 0, chunks: [{ start: 0, end, duration: step.duration, at: step.now }] };
}

/** Where the shown text ends. */
export function shownEnd(state: FadeState): number {
  return state.chunks.length ? state.chunks[state.chunks.length - 1].end : state.settled;
}

/**
 * The next state for `text`. Finished fades join the settled text (oldest first); newly
 * visible text becomes one new chunk. A rewritten prefix shows everything at once.
 */
export function advanceFade(state: FadeState, text: string, step: FadeStep): FadeState {
  const shown = shownEnd(state);
  const end = visibleEnd(text, step.hold);
  if (end < shown || (text !== state.text && !text.startsWith(state.text.slice(0, shown)))) {
    return { text, settled: end, chunks: [] };
  }
  let settled = state.settled;
  let first = 0;
  while (first < state.chunks.length && (state.chunks[first].at + state.chunks[first].duration <= step.now || state.chunks.length - first >= MAX_FADE_CHUNKS)) {
    settled = state.chunks[first].end;
    first += 1;
  }
  const grows = end > shown;
  if (!grows && first === 0 && text === state.text) return state;
  const chunks = state.chunks.slice(first);
  if (grows) chunks.push({ start: shown, end, duration: step.duration, at: step.now });
  return { text, settled, chunks };
}
