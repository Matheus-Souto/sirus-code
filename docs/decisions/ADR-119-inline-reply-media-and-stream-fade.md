# ADR-119: Inline reply media and streaming text fade

**Status:** Accepted (2026-10-12). Builds on ADR-085 (reply images) and ADR-108 (`sirus-media`).

## Context

Agents often answer with local files: `![screen](/tmp/shot.png)`, `[the recording](recordings/run.mp4)`. Until now an image link showed as a link with an icon that opened the gallery, and a video link was just a link. The owner asked to show them inline, and for streaming replies to fade their newest words in instead of popping them in at the edge.

## Decision

### Local images and videos inline

- **What counts.** `localMediaKind` (`src/lib/chat-markdown.ts`) classifies a reply link as an image (png, jpg/jpeg, gif, webp) or a video (mp4, m4v, mov, webm) when it is a local path: absolute, `~/`, workspace-relative or `file:///`. Web URLs and other schemes are not touched. `![alt](path)` and `[text](path)` behave the same, since the parser already turns local `![]()` into a link.
- **How it shows.** `ReplyMedia` replaces the link with a box of fixed aspect (16:10 for images, 16:9 for videos, at most 420 px wide and 300 px high) with the link text as a caption below. The box is there before the file loads, so nothing moves. Images use `object-fit: contain` and ease in once decoded. A click on an image opens the existing gallery with every image of the message. Videos use the native controls with `preload="metadata"`, and they pause when they scroll out of view or the window is hidden.
- **Lazy.** One IntersectionObserver per preview, rooted at the transcript's scroller with a 600 px margin, asks for the file only as the box nears the viewport. The token is released when the preview unmounts.
- **Fallback.** If the native side refuses or cannot find the file, the image cannot be decoded, or the video cannot be played, the original link renders as before: the gallery link for images and the workspace file link for videos. On the phone, where there is no media scheme, images load as data URLs through `reply_image` and videos fall back to the link.
- **Authorization in Rust.** `reply_media` (`media_preview.rs`) hands out a `sirus-media` token only for:
  - an image under the ADR-085 rule, unchanged: an image extension, a regular file of at most 25 MiB, and PNG/JPEG/GIF/WebP magic bytes (`reply_image::resolve`, `checked_metadata`, `sniff_file`). The path resolves like a reply-image link (`file://`, `~/`, relative to the workspace);
  - a video with a known extension that is a regular file inside the session workspace after canonicalization (`paths::ensure_within`), so `..` and symlinks that leave the workspace are refused.
  The renderer never gives a path to the scheme. The asset protocol stays closed, and the scheme serves only token holders.
- **Streaming.** Videos stream by `Range` (at most 4 MiB per answer), as in ADR-108. A request without a range (an `<img>`) gets the whole file in one `200` when it is at most 25 MiB, so images do not need base64 over IPC. Up to 64 tokens are kept at once (16 before), oldest first out. `img-src` in the CSP now allows `sirus-media:`.

### Streaming text fade

- **Only the tail.** While a reply streams, only the reply's last text run (the last inline text of the last prose block of the last segment) renders through `StreamFadeText`. That run is one plain text node of settled text plus at most 24 chunk spans, each keyed by its start offset. A re-render keeps existing spans, so their animation does not restart and settled text never fades again. Earlier blocks stay memoized and plain. A long reply never has a span per word.
- **Words, not pieces.** While streaming, a half-written word is held back until it is whole, so a word appears once. It is held for at most 150 ms (a reply that stops mid-word before a tool call shows it as it is), and a run of more than 24 characters without spaces (URLs, CJK) is not held.
- **Cadence.** `useStreamFade` measures the gaps between the provider's own chunks (`message.content`), not the paced reveal of `useSmoothText`, as a moving average that ignores pauses over 2 s. Each new chunk fades for 1.5× that cadence, between 120 and 400 ms (220 ms before the pace is known). The duration is fixed on the chunk's span when it is created.
- **No replays, no shift.** Text already there when a message mounts (switching sessions) shows at once. A text run that appears with more than 80 characters, or whose prefix was rewritten, shows at once. Only opacity animates. After the stream ends, the fade lasts 400 ms more so the last words finish, and then the run renders as plain text.
- **Motion settings.** With reduced motion (OS or setting) or animations off, `useStreamFade` returns null and no spans are rendered. The CSS also turns the animation off for those cases.

## Consequences

- Inline previews read files only when they near the viewport, and videos are never read whole into memory.
- Video links outside the workspace (for example `/tmp/demo.mp4`) still render as links. Images outside the workspace keep working, as ADR-085 already allowed.
- The fade costs one prefix comparison and a few spans per render of the streaming block. Pure helpers are tested in `tests/stream-fade.test.ts`, link classification in `tests/chat-images.test.ts`, and authorization and whole-file serving in `media_preview.rs`.
