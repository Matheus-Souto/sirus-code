# ADR-108: Video previews, idle agents setting, Astro reactions and counts, committed files leave reviews

**Status:** Accepted (2026-10-10)

## Context

The owner chose this batch:

- video previews in the file pane;
- a setting for idle agents kept ready;
- emoji reactions from Monos (our Astros);
- unread counts on the rail;
- a compact changes button;
- committed files leaving the review;
- manual scrolling that always stops following;
- no replayed entrance animations when a tab returns.

## Decision

- **Video previews** (`media_preview.rs`, `VideoPreview.tsx`).
  - MP4, M4V, MOV, WebM, MKV and OGV files open in the file pane with native controls, dimensions, duration, size and format.
  - The renderer asks `media_preview` for a token for a workspace file. Only regular files inside the session's workspace with a video extension get one; tokens are random, at most 16 are kept, and `media_release` forgets one.
  - The `sirus-media` scheme serves a token's file by byte range (206, at most 4 MiB a response), so the player can seek. CSP gains `media-src sirus-media:`.
  - Playback pauses when the pane or the window is hidden, and the source is released on close.
  - A video macOS cannot decode offers Retry and "Open in default player".
- **Keep idle agents ready** (Providers → Advanced, `keepIdleAgents`).
  - Choices: None, 1, 2, 3, 5 or All. The default is All (16 at most).
  - Lowering the value stops the longest idle processes at once (`agent_pool::set_limit`). Each kept process still stops after 30 idle minutes (ADR-107).
- **Astro reactions.**
  - The Astro prompt allows answering a message that needs no words with a single emoji (`reaction_rules`).
  - A settled Astro reply of one to three emoji and nothing else is shown as a reaction on the user's message, which pops in once; the reply's own row is hidden (`reactions.ts`).
  - A failed reply keeps its row.
  - Its notification reads "Reacted with 👍" (`notifications::is_reaction`).
- **Astro unread counts.** The sidebar and floating rails show the unread reply count (up to `99+`) instead of a dot, with the count in the button's accessible label.
- **Compact changes for Astros.** An Astro turn that changed files shows one button with the file count and +/− lines that opens the diff, instead of the full review card.
- **Committed files leave reviews.**
  - After a commit made through Sirus (`git_commit`, used by the Changes pane and the Environment card), the committed paths (`git diff-tree`) are marked `committedAt` in the turn reviews of the sessions in that workspace whose transcripts are loaded.
  - Marked files leave the review card and pane, stay out if edited again, and are never undone.
- **Following stops on every manual gesture** (`upwardIntent`).
  - Up keys (↑, PageUp, Home), a touch moving the content down and a press on the scrollbar now release following at once, like a wheel step up already did, so a streamed frame cannot snap the reader back.
  - Gestures inside nested content that scrolls on its own (code blocks, wide tables) stay there.
  - Keys typed into fields change nothing.
- **No replayed entrances.** A subagent's steps that were already there when its card appeared render still. Only steps arriving afterwards animate, so returning to a running conversation does not replay them. Streamed text already resumed fully shown.

## Consequences

- A committed file leaves the reviews of loaded transcripts only; an unloaded transcript keeps showing it until a later commit includes it while that transcript is loaded.
- Video playback depends on macOS codecs, so MKV and some WebM files may only open externally.
