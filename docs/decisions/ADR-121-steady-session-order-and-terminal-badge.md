# ADR-121: Steady session order and running-terminal badge

**Status:** Accepted (2026-10-12). Refines ADR-092 and ADR-104.

## Context

With "Recent activity" order, a session that starts or finishes work moves in the switcher's session list. When that happens while the person is aiming at a row, the row jumps away right before the click, and another conversation opens. Holding the order while the pointer is over the list fixes it, with an option to float working and unread conversations to the top.

Separately, a terminal started in a session keeps running while the dock shows something else (ADR-104), and nothing in the session lists says so. A terminal glyph on such rows can bring the terminal back into view.

## Decision

- **Hold while hovered.** The project switcher keeps its session order while the pointer is over it. The order is captured as plain sort keys (`SessionSortKey`: attention rank and timestamp, `sessionSortKeys` in `src/lib/sidebar-layout.ts`); `holdSessionOrder` keeps the captured snapshot while held and returns the live one otherwise. Sessions the snapshot does not know (created during the hold) slot in by their live key. The new order applies when the pointer leaves or the switcher closes. Changing the thread-order settings applies at once, even mid-hover. Pointer enter and leave on the switcher element drive it; there are no global pointer listeners and touch pointers never hold.
- **"Working and unread first".** A new setting, `sidebarAttentionFirst` (Settings → General → Sidebar organization; pt: "Trabalhando e não lidas primeiro"), off by default. When on, sessions that are working or waiting for the person (including a computer-use request) rank above finished-unseen ones, which rank above the rest; each band keeps the chosen thread order (Recent activity or Created). Pinned sessions keep their pin order. `sidebarGroups` takes the unread and computer-use sets and the held keys as options, so every list built on it follows the setting: the switcher's session column and the initial tab order of a project. Without the unread set, only live status counts.
- **Running-terminal badge.** The store keeps `runningTerminals` (session id → terminal ids), set by the terminal itself: on after its PTY starts, off on `pty-exit`, on a failed start and when the terminal is disposed (tab closed, session removed, Reopen). Nothing is polled. A session with a running terminal shows a small terminal glyph in its switcher row and its header tab (and in the single tab when tabs are off). Its accessible label says how many terminals run ("Terminal running. Show terminal" / "Terminal rodando. Mostrar terminal"). Clicking it selects the session, makes the running terminal the active tab of its region (`runningTerminalTarget`: the region's active tab if it runs, else the first running one) and opens the dock's Terminal pane. It never starts a new terminal: the session's terminal workspace already exists, so `ensureTerminal` does nothing.

## Consequences

- Rows no longer move under the pointer; a status change shows in place (dots, check) and the row takes its new position once the pointer leaves.
- "Running" means the shell is alive, not that a command is running inside it; the app has no view of the shell's child processes and does not poll for one.
- `sidebarAttentionFirst` is a new `AppSettings` field (Rust `#[serde(default)]`, false), restored by the General page's "Restore defaults".
