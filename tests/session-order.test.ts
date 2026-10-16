import assert from "node:assert/strict";
import { test } from "node:test";
import type { Project, Session } from "../src/client/types.ts";
import { mergeSettings } from "../src/lib/settings.ts";
import { holdSessionOrder, sessionAttentionRank, sessionOrderSignature, sessionSortKeys, sidebarGroups, type SessionOrderSnapshot } from "../src/lib/sidebar-layout.ts";
import { runningTerminalTarget, withTerminalRunning } from "../src/lib/terminal-running.ts";

const projects: Project[] = [{ id: "a", name: "a", path: "/fixture/a", addedAt: "time", lastOpenedAt: "time" }];
const session = (id: string, lastActivityAt: string, status: Session["status"] = "completed"): Session => ({ id, title: id, projectId: "a", agent: "codex", status, createdAt: lastActivityAt, lastActivityAt, worktree: { path: "/fixture", branch: "main", isolated: false }, messages: [], lastError: null });

const sessions = [
  session("newest", "2026-01-09"),
  session("unread", "2026-01-05"),
  session("working", "2026-01-03", "running"),
  session("waiting", "2026-01-02", "waiting"),
  session("oldest", "2026-01-01"),
];
const unseen = new Set(["unread"]);
const ids = (rows: readonly Session[]) => rows.map(row => row.id);

test("working and unread first is off by default and keeps the plain activity order", () => {
  const settings = mergeSettings({ sidebarThreadSortOrder: "updated_at" });
  assert.equal(settings.sidebarAttentionFirst, false);
  assert.equal(mergeSettings({ sidebarAttentionFirst: "yes" } as never).sidebarAttentionFirst, false);
  assert.deepEqual(ids(sidebarGroups(projects, sessions, settings, { unseen }).nested), ["newest", "unread", "working", "waiting", "oldest"]);
});

test("with the setting on, working, waiting and unread sessions float above the thread order", () => {
  const settings = mergeSettings({ sidebarThreadSortOrder: "updated_at", sidebarAttentionFirst: true });
  // Working and waiting rank together above finished-unread; each band keeps the thread order.
  assert.deepEqual(ids(sidebarGroups(projects, sessions, settings, { unseen }).nested), ["working", "waiting", "unread", "newest", "oldest"]);
  // A computer-use request counts as waiting; without the unread set only live status counts.
  assert.equal(sessionAttentionRank(sessions[0], new Set(), new Set(["newest"])), 2);
  assert.deepEqual(ids(sidebarGroups(projects, sessions, settings).nested), ["working", "waiting", "newest", "unread", "oldest"]);
  // Pinned sessions keep their own pin order.
  const pinned = sidebarGroups(projects, sessions, { ...settings, pinnedSessionIds: ["oldest", "working"] }, { unseen });
  assert.deepEqual(ids(pinned.pinned), ["oldest", "working"]);
  assert.deepEqual(ids(pinned.nested), ["waiting", "unread", "newest"]);
});

test("a held order keeps rows in place while hovered and applies the new order on leave", () => {
  const settings = mergeSettings({ sidebarThreadSortOrder: "updated_at", sidebarAttentionFirst: true });
  const snapshot = (rows: readonly Session[], value = settings, unread = unseen): SessionOrderSnapshot => ({ signature: sessionOrderSignature(value), keys: sessionSortKeys(rows, value, { unseen: unread }) });
  const before = snapshot(sessions);
  // While hovered, "oldest" starts working and "unread" is read: nothing moves.
  const changed = sessions.map(row => row.id === "oldest" ? { ...row, status: "running" as const, lastActivityAt: "2026-01-10" } : row);
  const live = snapshot(changed, settings, new Set());
  const held = holdSessionOrder(before, live, true);
  assert.equal(held, before);
  assert.deepEqual(ids(sidebarGroups(projects, changed, settings, { held: held.keys }).nested), ["working", "waiting", "unread", "newest", "oldest"]);
  // A session born during the hold slots in by its live key.
  const born = [...changed, session("born", "2026-01-11", "running")];
  assert.deepEqual(ids(sidebarGroups(projects, born, settings, { held: held.keys }).nested), ["born", "working", "waiting", "unread", "newest", "oldest"]);
  // Pointer leaves: the live order applies.
  const released = holdSessionOrder(held, live, false);
  assert.equal(released, live);
  assert.deepEqual(ids(sidebarGroups(projects, changed, settings, { held: released.keys }).nested), ["oldest", "working", "waiting", "newest", "unread"]);
  // Changing the order settings applies at once, even while hovered.
  const off = { ...settings, sidebarAttentionFirst: false };
  assert.equal(holdSessionOrder(before, snapshot(changed, off), true).signature, sessionOrderSignature(off));
  assert.equal(holdSessionOrder(null, live, true), live);
});

test("running terminals are tracked per session without needless copies", () => {
  const none = {};
  const one = withTerminalRunning(none, "s", "t1", true);
  assert.deepEqual(one, { s: ["t1"] });
  assert.equal(withTerminalRunning(one, "s", "t1", true), one, "marking twice changes nothing");
  assert.equal(withTerminalRunning(one, "s", "other", false), one);
  const two = withTerminalRunning(one, "s", "t2", true);
  assert.deepEqual(two, { s: ["t1", "t2"] });
  assert.deepEqual(withTerminalRunning(two, "s", "t1", false), { s: ["t2"] });
  assert.deepEqual(withTerminalRunning(one, "s", "t1", false), {}, "a session without running terminals drops out");
  assert.deepEqual(none, {});
});

test("revealing a terminal prefers the active running tab, else the first running one", () => {
  const workspace = { panes: [
    { id: "left", terminals: [{ id: "t1" }, { id: "t2" }], activeTerminalId: "t1" },
    { id: "right", terminals: [{ id: "t3" }], activeTerminalId: "t3" },
  ] };
  assert.deepEqual(runningTerminalTarget(workspace, ["t2", "t3"]), { paneId: "right", terminalId: "t3" });
  assert.deepEqual(runningTerminalTarget(workspace, ["t2"]), { paneId: "left", terminalId: "t2" });
  assert.deepEqual(runningTerminalTarget(workspace, ["t1", "t3"]), { paneId: "left", terminalId: "t1" });
  assert.equal(runningTerminalTarget(workspace, ["closed"]), null, "a terminal no longer listed is not revealed");
  assert.equal(runningTerminalTarget(workspace, []), null);
  assert.equal(runningTerminalTarget(undefined, ["t1"]), null);
});
