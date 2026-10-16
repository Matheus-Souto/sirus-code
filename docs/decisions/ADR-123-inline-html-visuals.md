# ADR-123: Inline HTML visuals in the conversation

**Status:** Accepted (2026-10-12).

## Context

Agents often answer with numbers that read faster as a chart, a small dashboard or a diagram. ADR-072 already renders a settled reply's ```html block in a sandboxed frame, but that needs the agent to put a whole page in its text, the page shows as a white box that ignores the theme, and it is not something the agent can update while it works.

## Decision

- **Tool.** `sirus_show_visual` (`visuals.rs`) is always on, like delegation (ADR-111), because it only writes to the caller's own reply. It takes a `title` (one line, ≤120 characters) and one self-contained `html` document (≤512 KiB). It adds the visual to the calling session's current reply (the agent message after its latest user message); a call with the same title in the same reply replaces it and bumps `revision`; a reply holds at most 8. The tool description tells agents when to use it (charts, small dashboards, diagrams), the theme variables, and what the sandbox blocks.
- **Storage.** `Message.visuals` (`MessageVisual { id, title, html, createdAt, revision }`) is part of the message's JSON row in `state.db`, so it is saved, loaded and evicted with the transcript. The field is optional on both sides; older rows load unchanged. The bridge and stdio child accept lines up to 4 MiB to carry an escaped page.
- **Rendering.** The reply shows each visual as a card (title, Copy source) under its text. The page runs in `<iframe sandbox="allow-scripts">` loaded from `sirus-preview://localhost/v/<id>`, which `html_preview.rs` serves from memory with `VISUAL_CSP`. `srcdoc` was not used: it inherits the app's `script-src 'self'`, which blocks the inline scripts the page needs. A new revision mounts a fresh frame.
- **Bridge.** The front end (`lib/inline-visual.ts`) builds the document: the theme as `--sirus-*` variables, base styles at zero specificity, a bridge script, then the agent's HTML. The bridge reports the content height (clamped to 48–640 px; taller pages scroll inside), turns link clicks into requests, hands wheel gestures the page cannot use back to the transcript, removes WebRTC and applies theme changes posted by the app without reloading the page (`data-theme`, `color-scheme`, a `sirus-theme` event).

## Security

- The frame has an opaque origin (no `allow-same-origin`), so it has no app storage, cookies, DOM or Tauri IPC. Without `allow-top-navigation*`, `allow-popups`, `allow-forms` and `allow-modals` it cannot navigate the app, open windows, submit forms or show dialogs. The app's `frame-src sirus-preview:` stops the frame navigating to another origin.
- `VISUAL_CSP` blocks every connection (`connect-src 'none'`: fetch, XHR, WebSockets, EventSource), nested frames, workers, plugins, manifests, `<base>` and form targets. It allows inline and https scripts and styles, and https/data/blob images, fonts and media, so a page can use a chart library or a web font from a public CDN. A page could encode data into an image URL, but all it holds is what the agent wrote plus the theme, and the agent already has network access. `'unsafe-eval'` adds nothing an inline script cannot already do in an opaque origin.
- The app reads messages only from that frame's window and validates every field. Links open only as absolute http(s) or mailto URLs, through `openLink` → `open_external_url`, only while the frame has focus (the person clicked into it) and at most once a second. Theme values are allowlisted by name and character set, so they cannot leave their CSS declaration.

## Consequences

- Agents can show live charts and diagrams in their reply that follow light and dark themes and persist with the conversation.
- Visuals live in the message row, so a reply with large pages makes its row bigger (at most 8 × 512 KiB).
- Visuals need the `sirus-preview://` scheme, so they show in the desktop window; a browser-based remote UI shows an empty card (Copy source still gives the page). Exports and `sirus_read_session` carry the reply text only.
- No expand-to-panel view yet.
