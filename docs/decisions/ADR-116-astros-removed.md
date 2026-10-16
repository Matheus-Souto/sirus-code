# ADR-116: Astros removed

**Status:** Accepted (2026-10-12). Supersedes ADR-069, ADR-088 and the habits of ADR-051.

## Context

The owner asked to take out everything related to Astros. That covers:
- the rail assistants and their conversations, memory and soul;
- documents;
- the menu bar icon and the floating chat;
- habits (the scheduled automations that only Astros still used);
- emoji reactions;
- the inbox rows for failing habits;
- the phone's Astros tab.

Delegation and the `sirus_*` tools reused part of the Astro start path, and Tasks reused the habit launcher.

## Decision

- **What stays moved.** The start-on-someone's-behalf path moved to `launch.rs`, which delegation, `sirus_*` tools and Tasks share:
  - starting a session and stepping its approval down to the target provider;
  - remembering which caller turn started which target turn, for the Stop cascade;
  - `session_row` and `send_from`.
- **Removed in Rust:**
  - the modules `astros.rs`, `astro_tray.rs`, `astro_documents.rs` and `automations.rs`;
  - their commands, events and MCP tools;
  - the tray feature and the `astro-float` window;
  - the session fields `astro`, `delegation` and `launched_by`, and `AppData.astros`, `automations` and `automation_runs`;
  - `Message.documents`;
  - the menu bar setting and the Astro prompt context;
  - the reaction notice.
- **Removed in the UI:**
  - the Astro components, art, float, drawer, header, cards and reply documents;
  - the habit dialog and its library;
  - reactions;
  - the phone's Astros tab and New Astro sheet;
  - the "Astros in the menu bar" setting.

  `ReplyExtras` keeps a reply's delegated task cards and its started-sessions control.
- **Data.**
  - Schema v2 drops the `astros` and `automations` tables and the `automationRuns` state.
  - Older session rows keep loading; the removed fields are ignored, so an Astro conversation becomes a normal, visible session.

## Amendment (2026-10-12): project Astro icons stay

The owner wanted the Astro *feature* gone, not the Astro icons used as project icons, so those were restored the same day:
- `ProjectLook.astro` (`{ icon, style }`), `setAstro`, its validation and the one-icon-at-a-time rule (an emoji, logo, line icon or Astro replaces the others) are back; the icon and style lists live in `project_look.rs` (`ASTRO_ICONS`, `ASTRO_STYLES`: Metal or Neon).
- The UI keeps only the icon art: `components/AstroIcon.tsx` and `lib/astro-art.ts` (no backgrounds or activity marks), the Astros tab of the project icon picker (also for project folders), the phone's project icon sheet and the sidebar glyph.
- The version without the field dropped `look.astro` whenever it re-saved a project. Schema v3 runs once: each project whose look has no icon of any kind gets back the valid Astro icon of the same project in `json-backup-before-sqlite/state.json`. A missing or unreadable backup, or an unknown icon, changes nothing; a project's current colour is kept.

## Consequences

- Nothing in the app starts work on a schedule any more.
- ADR-069, ADR-088 and ADR-051 stay as history.
