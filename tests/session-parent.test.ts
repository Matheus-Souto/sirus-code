import assert from "node:assert/strict";
import { test } from "node:test";
import { parentLink } from "../src/lib/session-parent.ts";

const sessions = [{ id: "p", title: "Main" }, { id: "c", title: "Coordinator" }];
const delegatedBy = (notify: boolean) => ({ sessionId: "p", turn: "t", notify, settled: false, delivered: false });

test("child sessions link back to the conversation they came from", () => {
  assert.deepEqual(parentLink({ delegatedBy: delegatedBy(true) }, sessions), { kind: "delegated", title: "Main", sessionId: "p" });
  assert.equal(parentLink({ delegatedBy: delegatedBy(false) }, sessions)?.kind, "started");
  assert.deepEqual(parentLink({ teamWorker: { coordinatorSessionId: "c", taskId: "x" } }, sessions), { kind: "team", title: "Coordinator", sessionId: "c" });
});

test("no parent, or a removed one, leaves no link", () => {
  assert.equal(parentLink({}, sessions), null);
  assert.equal(parentLink({ delegatedBy: { ...delegatedBy(true), sessionId: "gone" } }, sessions), null);
});
