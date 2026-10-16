# ADR-136: One-row composer, background capsule and the Working panel on the right

- Status: accepted
- Date: 2026-10-16

## Context

A started conversation's composer can be a one-line pill, with the activity above it folded into small capsules, so the conversation keeps more of the window. The Working panel (ADR-094) sat at the bottom-left and could only be turned off in settings.

## Decision

- **One row.** In a started conversation, while the draft is one plain line (no attachments, snippets, goal, plan, debug, team or handoff, not dictating, not "compact and send"), the composer is a pill: add menu, field, dictation, send or stop. Access, context and model sit on a row under it. A newline, or text wider than the line (measured with the field's font, with a little slack against flicker), grows it back into the block layout; it folds again once the line fits. The pill is the same element in a two-row grid: its fill, border and animated rim are absolutely placed on the first row (`grid-row: 1 / 2`; an absolutely placed item's `auto` line is the container's edge). The new-conversation landing and the phone keep their layouts.
- **Background capsule.** "Em segundo plano" (ADR-097) rests as a capsule ("2 em segundo plano") above the composer and opens its card with each task's time and stop; a chevron folds it back.
- **Working panel on the right.** The panel floats at the bottom-right, in the room right of the composer. A chevron folds it into a thin tab on the pane's right edge with the count, a pulsing dot (orange when a session waits for you) and the providers' icons; a click opens it. The choice is kept in local storage.

## Consequences

- A started conversation shows one line less of chrome until the draft grows.
- The composer's controls keep one tree in both layouts, so focus and popovers survive the switch.
