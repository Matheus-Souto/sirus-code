import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSettings } from "../src/lib/settings.ts";
import { tightestUsageWindow } from "../src/lib/provider-usage.ts";
import type { AgentProviderId, ProviderUsage } from "../src/client/types.ts";

test("sidebar usage follows at most two providers that report usage", () => {
  assert.deepEqual(mergeSettings({}).sidebarUsageProviders, []);
  const chosen = ["grok", "claude", "claude", "codex", "cursor"] as AgentProviderId[];
  assert.deepEqual(mergeSettings({ sidebarUsageProviders: chosen }).sidebarUsageProviders, ["claude", "codex"]);
});

test("the ring shows the most constrained window", () => {
  const usage = { windows: [
    { id: "five_hour", usedPercent: 20, durationMinutes: 300, resetsAt: null },
    { id: "seven_day", usedPercent: 64, durationMinutes: 10080, resetsAt: null },
    { id: "unknown", usedPercent: null, durationMinutes: null, resetsAt: null },
  ] } as unknown as ProviderUsage;
  assert.equal(tightestUsageWindow(usage)?.id, "seven_day");
  assert.equal(tightestUsageWindow(undefined), undefined);
});

test("the rail ring shows the weekly quota outside and the 5-hour one inside when both exist", async () => {
  const { ringUsageWindows } = await import("../src/lib/provider-usage.ts");
  const window = (id: string, usedPercent: number | null, durationMinutes: number | null) => ({ id, usedPercent, durationMinutes, resetsAt: null });
  const usage = (windows: ReturnType<typeof window>[]) => ({ provider: "claude", status: "available", windows, updatedAt: 0, note: null, account: null, resetCount: 0, resetOffer: null }) as never;
  const claude = ringUsageWindows(usage([window("five_hour", 40, 300), window("seven_day", 12, 10080), window("seven_day_opus", 90, 10080)]));
  assert.equal(claude.outer?.id, "seven_day");
  assert.equal(claude.inner?.id, "five_hour");
  const single = ringUsageWindows(usage([window("cursor/included", 30, null)]));
  assert.equal(single.outer?.id, "cursor/included");
  assert.equal(single.inner, undefined);
  assert.deepEqual(ringUsageWindows(undefined), { outer: undefined });
});
