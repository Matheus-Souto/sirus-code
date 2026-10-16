import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeSettings, shareSettings } from "../src/lib/settings.ts";

// What `saveSettings` does for a layout toggle: an optimistic merge, then the native echo.
function toggleSidebar(previous: ReturnType<typeof mergeSettings>) {
  const optimistic = shareSettings(previous, mergeSettings({ ...previous, sidebarCollapsed: !previous.sidebarCollapsed }));
  const echoed = mergeSettings(JSON.parse(JSON.stringify(optimistic)));
  return { optimistic, saved: shareSettings(optimistic, echoed) };
}

test("a layout toggle keeps every field the transcript and composer read by reference", () => {
  const previous = mergeSettings({
    disabledProviders: ["grok"],
    modelExecution: { "codex::gpt-5": { effort: "high" } },
    customShortcuts: { "toggle-context": "Meta+\\" },
  } as never);
  const { optimistic, saved } = toggleSidebar(previous);
  assert.notEqual(optimistic, previous);
  assert.equal(optimistic.sidebarCollapsed, true);
  // The native echo is equal, so it does not replace the settings object again.
  assert.equal(saved, optimistic);
  for (const key of ["disabledProviders", "modelExecution", "customShortcuts", "notifications", "usageProviders", "favoriteModels"] as const) {
    assert.equal(saved[key], previous[key], `${key} stays the same reference`);
  }
});

test("a real change still produces new values, and an unchanged save keeps the object", () => {
  const previous = mergeSettings({ disabledProviders: ["grok"] } as never);
  const next = shareSettings(previous, mergeSettings({ ...previous, disabledProviders: ["grok", "cursor"] }));
  assert.deepEqual(next.disabledProviders, ["grok", "cursor"]);
  assert.notEqual(next.disabledProviders, previous.disabledProviders);
  assert.equal(next.modelExecution, previous.modelExecution);
  assert.equal(shareSettings(previous, mergeSettings(JSON.parse(JSON.stringify(previous)))), previous);
});
