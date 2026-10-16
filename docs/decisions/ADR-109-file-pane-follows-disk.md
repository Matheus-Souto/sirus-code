# ADR-109: The file pane follows the disk

**Status:** Accepted (2026-10-10)

## Context

The file tree read each folder once, when it opened. Files created or removed by an agent, a terminal or another app appeared only after closing and reopening the pane.

## Decision

- **A native watcher** (`workspace_watch.rs`, the `notify` crate, FSEvents on macOS) follows a session's workspace while its tree is shown.
  - The tree calls `workspace_watch(sessionId, true)` when it mounts and `false` when it unmounts.
  - The command returns the canonical path its events carry, so the renderer matches events exactly.
  - Each workspace has one watcher however many panes show it, counted by views; at most 8 workspaces are watched, and the oldest is dropped first.
- **Changes are batched.** Changes inside `.git`, `node_modules`, `target`, `dist`, `build`, `.next`, `.turbo`, `.cache`, `__pycache__` and `.venv` are ignored. Others are gathered over 300 ms and emitted as one `workspace-changed { path }`.
- **The tree re-reads every open folder** on that event. Closed folders read when opened, as before.
- There is no polling.

## Consequences

- New, renamed and deleted files show in the tree about a third of a second later, whoever changed them.
- The watcher stops with its last view. A burst of changes (an install, a build) outside the ignored folders causes one re-read per 300 ms window, not one per file.
