# ADR-114: SQLite storage

**Status:** Accepted (2026-10-11)

## Context

Since ADR-047 and ADR-099, the state lived in `state.json` plus one `sessions/<id>.json` per transcript. Every change to a conversation rewrote its whole file, so a save costs the size of the conversation. The owner chose to move before the first public release, while the data is still small.

## Decision

- **One SQLite database** next to the old state file (`state.db`), using `rusqlite` with SQLite bundled.
  - WAL journal with `synchronous = NORMAL`. A crash or a kill never corrupts the database; a power loss can lose only the last transactions.
  - Numbered schema versions in `schema_migrations`.
- **Tables:**
  - `settings`: one row;
  - `app_state`: the other top-level fields, one row each;
  - `projects`, `tasks`, `astros`, `automations`: one row per item (id, position, JSON);
  - `sessions`: one row per session, without its messages, with the transcript counts;
  - `messages`: one row per message (session, position, id, JSON).
- **The app is unchanged above storage.**
  - `AppData` stays in memory as before, and `persist.rs` keeps its functions (`load_or_create`, `save`, `checkpoint_soon`, `read_origin`, `read_only`, `read_raw`, `saved`, `mark_saved`). `store.rs` implements them over SQLite.
  - Transcripts still load on demand (ADR-099). Unloaded ones are never written. Older checkpoints are still dropped by generation.
- **A save is one transaction.**
  - It writes only the rows whose JSON hash changed since they were last written or read, and deletes rows that are gone.
  - A removed session takes its messages with it.
  - Measured with 20 saves, each after one new message in a conversation of about 4.5 MB: 4.0 ms per save in SQLite, against 11.2 ms when rewriting the JSON file. Only the new message is written, not the whole conversation.
- **Migration on first open:**
  1. `state.json` and `sessions/` are copied untouched to `json-backup-before-sqlite/`.
  2. The JSON layout is loaded as before.
  3. Every transcript is written into a new database, read back and compared (index and messages).
  4. Only then is the database used.

  When anything differs or cannot be read, the database is deleted and the JSON files stay in use, so the migration never loses or hides data. The original files stay in place; nothing writes them afterwards.
- **Stopping and resuming delegated tasks.** This replaces the separate run journal first proposed: the saved state already records what that journal would hold (which sessions were running at shutdown, `delegated_by`, `stopped_by_user_at`).
  - Stop on a session also stops the delegated tasks still working, through `delegated_by` (ADR-111). This still works after a restart.
  - After a restart, delegated tasks that the app's closing cut are continued with "Continue where you left off". This applies only when they were not finished and neither they nor their parent were stopped by the person. Their result wakes the parent as usual.

## Consequences

- Copies of the data folder must include `state.db-wal` while the app runs; the app checkpoints WAL on its own.
- Opening the data folder in a text editor no longer shows conversations; `sqlite3 state.db` does.
- The JSON loader stays as the migration source and fallback. Its tests pin a path to the JSON layout.
