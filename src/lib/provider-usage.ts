import type { AgentProviderId, ProviderUsage, UsageWindow } from "@/client/types";

/** Providers whose quota native code can read (matches `provider_usage::reports_usage`). */
export const USAGE_PROVIDER_IDS: readonly AgentProviderId[] = ["codex", "claude", "cursor", "opencode"];
/** The sidebar rail follows at most this many providers (native validation agrees). */
export const SIDEBAR_USAGE_LIMIT = 2;

/** The most constrained window: the ring shows how close the provider is to any limit. */
export function tightestUsageWindow(usage: ProviderUsage | undefined): UsageWindow | undefined {
  return usage?.windows.reduce<UsageWindow | undefined>((chosen, row) =>
    row.usedPercent != null && (chosen?.usedPercent == null || row.usedPercent > chosen.usedPercent) ? row : chosen, undefined);
}

/**
 * The rail ring's windows: the provider's long quota (weekly or monthly) outside and its short
 * one (5 hours) inside, when it reports both, as Claude and Codex do. Per-model buckets and
 * Codex's reserve model stay in the popup. With a single main window there is one ring (the
 * tightest window), as before.
 */
export function ringUsageWindows(usage: ProviderUsage | undefined): { outer?: UsageWindow; inner?: UsageWindow } {
  const main = (usage?.windows ?? []).filter((window) => window.usedPercent != null && window.durationMinutes != null
    && !window.id.startsWith("base_model_inference/") && !/_(opus|sonnet|oauth_apps)$/.test(window.id));
  if (main.length >= 2) {
    const sorted = [...main].sort((a, b) => (a.durationMinutes ?? 0) - (b.durationMinutes ?? 0));
    const inner = sorted[0], outer = sorted[sorted.length - 1];
    if (inner.durationMinutes !== outer.durationMinutes) return { outer, inner };
  }
  return { outer: tightestUsageWindow(usage) };
}

/** Prefer the longer quota window for the compact footer; the popup shows every window. */
export function primaryUsageWindow(usage: ProviderUsage | undefined): UsageWindow | undefined {
  // A calendar month is longer than the fixed rolling windows, without claiming
  // its duration is always 30 days. The server supplies the actual reset date.
  const monthly = usage?.windows.find((window) => window.id === "opencode-go/monthly");
  if (monthly) return monthly;
  return usage?.windows.reduce<UsageWindow | undefined>((chosen, row) =>
    !chosen || (row.durationMinutes ?? 0) > (chosen.durationMinutes ?? 0) ? row : chosen, undefined);
}

/** The provider's main quota first (Codex `codex/…`), extra buckets after. */
export function orderedUsageWindows(usage: ProviderUsage | undefined): UsageWindow[] {
  const windows = usage?.windows ?? [];
  const main = (window: UsageWindow) => window.id.startsWith("base_model_inference/") ? 1 : 0;
  return [...windows].sort((a, b) => main(a) - main(b));
}

export function resetDuration(resetsAt: number | null, now: number): string | null {
  if (resetsAt == null || !Number.isFinite(resetsAt)) return null;
  const minutes = Math.max(0, Math.ceil((resetsAt - now) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor(minutes % 1440 / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

export function usageWindowLabel(window: UsageWindow): string {
  const labels: Record<string, string> = {
    five_hour: "5-hour usage", seven_day: "Weekly usage", seven_day_opus: "Weekly · Opus",
    seven_day_sonnet: "Weekly · Sonnet", seven_day_oauth_apps: "Weekly · OAuth apps",
    "opencode-go/rolling": "5-hour usage", "opencode-go/weekly": "Weekly usage", "opencode-go/monthly": "Monthly usage",
    "cursor/models": "Cursor models", "cursor/other-models": "Other models", "cursor/included": "Included usage",
    "cursor/member": "Individual limit", "cursor/team": "Team pool",
  };
  if (labels[window.id]) return labels[window.id];
  // Codex also reports a separate limit for its reserve model ("gpt-reserve"); it is not the main quota.
  if (window.id.startsWith("base_model_inference/")) return window.durationMinutes === 300 ? "5-hour · reserve model" : "Weekly · reserve model";
  if (window.durationMinutes === 300) return "5-hour usage";
  if (window.durationMinutes === 10_080) return "Weekly usage";
  return window.id;
}

export const resetOutcomeMessage = {
  reset: "Codex usage was reset.", alreadyRedeemed: "This reset was already used. Usage was refreshed.",
  nothingToReset: "There is no eligible usage window to reset.", noCredit: "No reset credits are available.",
} as const;
