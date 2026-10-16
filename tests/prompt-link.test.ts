import assert from "node:assert/strict";
import { test } from "node:test";
import { linkedModel, placeLinkedPrompt, promptLinkSource } from "../src/lib/prompt-link.ts";

const sessions = [{ id: "s1", projectId: "p1", agent: "claude" as const, model: "claude-opus-4-5" }];

test("a prompt link shares the open composer's draft with its provider and model", () => {
  const base = { sessions, defaultAgent: "codex" as const, defaultModel: "codex::gpt-5.5" };
  assert.deepEqual(
    promptLinkSource({ ...base, selectedSessionId: "s1", selectedProjectId: "p1", composerDrafts: { "session:s1": "  Fix it  " } }),
    { projectId: "p1", prompt: "Fix it", provider: "claude", model: "claude-opus-4-5" },
  );
  // The landing uses the default provider and model.
  assert.deepEqual(
    promptLinkSource({ ...base, selectedSessionId: null, selectedProjectId: "p1", composerDrafts: { "project:p1": "Start" } }),
    { projectId: "p1", prompt: "Start", provider: "codex", model: "gpt-5.5" },
  );
  // A default model of another provider is not carried.
  assert.equal(
    promptLinkSource({ ...base, defaultModel: "claude::sonnet", selectedSessionId: null, selectedProjectId: "p1", composerDrafts: { "project:p1": "Start" } })?.model,
    null,
  );
  assert.equal(promptLinkSource({ ...base, selectedSessionId: "s1", selectedProjectId: "p1", composerDrafts: { "session:s1": "  " } }), null);
  assert.equal(promptLinkSource({ ...base, selectedSessionId: null, selectedProjectId: null, composerDrafts: {} }), null);
});

test("a linked prompt replaces the draft and keeps what it replaced", () => {
  assert.deepEqual(placeLinkedPrompt(undefined, "New"), { draft: "New", replaced: null });
  assert.deepEqual(placeLinkedPrompt("   ", "New"), { draft: "New", replaced: null });
  assert.deepEqual(placeLinkedPrompt("New", "New"), { draft: "New", replaced: null });
  assert.deepEqual(placeLinkedPrompt("Mine", "New"), { draft: "New", replaced: "Mine" });
});

test("a linked model resolves against the provider's list when it is loaded", () => {
  const models = [{ id: "gpt-5.5", displayName: "GPT-5.5" }, { id: "gpt-5", displayName: "GPT-5" }];
  assert.deepEqual(linkedModel(null, models), { model: null, known: true });
  assert.deepEqual(linkedModel("gpt-5.5", undefined), { model: "gpt-5.5", known: true });
  assert.deepEqual(linkedModel("GPT-5", models), { model: "gpt-5", known: true });
  assert.deepEqual(linkedModel("gpt-9", models), { model: null, known: false });
});
