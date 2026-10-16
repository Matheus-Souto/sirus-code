# ADR-126: Layout toggles keep settings references; stepped status pulses

**Status:** Accepted (2026-10-13). Follows the performance passes in [`docs/PERFORMANCE.md`](../PERFORMANCE.md).

## Context

Three small performance fixes were worth checking here: terminal history written every 250 ms instead of every 40 ms, panel toggles that no longer re-render the timeline and composer, and a "Thinking" shimmer that steps instead of drawing every frame. Each was checked against Sirus:

- **Terminal output.** Sirus does not persist terminal history: scrollback lives only in xterm (ADR-104), and the native emitter already drains every queued read into one `pty-output` event (up to 64 KiB, no timers). Nothing to change.
- **Panel toggles.** `App` reads the dock and sidebar state, but `SplitWorkspace` is memoized with stable props, so the transcript does not re-render through its parent. It did re-render through settings: the sidebar and Environment toggles save settings, `mergeSettings` rebuilds every array and object, and the native echo replaces the object again. Every mounted reply's `MessageActions` (and its second-opinion button) and the composer subscribed to the whole settings object, so each toggle re-rendered them twice.
- **Shimmers.** The text shimmers already step at about 15 fps and pause with ambient motion off. The running-status pulses (header tab dot, team dot, workflow member dot) still animated `box-shadow` every frame, and the workflow member dot did not rest with ambient motion off.

## Decision

- `shareSettings(previous, next)` (`src/lib/settings.ts`) keeps every field equal to the previous value by reference, and returns the previous object when nothing changed. `saveSettings` uses it for the optimistic value and for the native echo, so an equal echo does not replace the settings object.
- `MessageActions` subscribes to `settings.disabledProviders` only; the composer selects only the fields it reads (`useShallow`). A layout toggle no longer re-renders either.
- The status pulses step at about 15 fps (`steps(6)` per quarter) along keyframes that follow the old ease-out curve. The workflow member dot pauses with `data-ambient="off"`. Reduced motion and animations off still remove them.

## Consequences

- Settings consumers that read single fields stay stable across unrelated saves. Components that read the whole settings object still re-render on every save; prefer field selectors in the transcript and composer.
- `tests/settings-sharing.test.ts` covers the toggle path (optimistic merge plus native echo).
