import assert from "node:assert/strict";
import { test } from "node:test";
import { workflowGroups } from "../src/lib/workflow-groups.ts";

test("workflow members group under their phases with each phase's state", () => {
  const groups = workflowGroups({
    name: "review",
    phases: [{ index: 1, title: "Read" }, { index: 2, title: "Write" }, { index: 3, title: "Check" }],
    agents: [
      { index: 1, label: "a", state: "completed", phaseIndex: 1 },
      { index: 2, label: "b", state: "failed", phaseIndex: 1 },
      { index: 3, label: "c", state: "running", phaseIndex: 2 },
      { index: 4, label: "d", state: "queued", phaseIndex: 2 },
      { index: 5, label: "e", state: "queued" },
    ],
  });
  assert.deepEqual(groups.map((group) => [group.title, group.state, group.settled, group.members.length]), [
    ["Read", "failed", 2, 2],
    ["Write", "running", 0, 2],
    ["Check", "pending", 0, 0],
    [null, "pending", 0, 1],
  ]);
});
