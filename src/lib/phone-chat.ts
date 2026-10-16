import type { AgentProviderId, AppSettings, ApprovalMode, DiscoveredModel, ExecutionOptions, FileEntry, GitStatus, ProviderModelList } from "@/client/types";
import { modelExecutionControls, offeredCursorVariant } from "@/lib/execution-options";
import { modelDisplayName, pickerModelChoices, readableModelId, type ModelChoice } from "@/lib/model-registry";
import { modelKey } from "@/lib/settings";

/**
 * Pure helpers of the phone conversation (ADR-129): the Thread settings sheet, the Git and
 * Terminal menus of the header and the Files tree.
 */

export interface ThreadSettingsSection { provider: AgentProviderId; rows: ModelChoice[] }

/** One section per enabled, installed provider with the models the desktop picker offers; a search hides empty ones. */
export function threadSettingsSections(
  catalogs: Partial<Record<AgentProviderId, ProviderModelList>>,
  settings: AppSettings,
  providers: readonly AgentProviderId[],
  currentProvider: AgentProviderId,
  currentModel: string | null,
  query: string,
): ThreadSettingsSection[] {
  const sections = providers.map((provider) => ({ provider, rows: pickerModelChoices(catalogs, settings, providers, provider, currentProvider, currentModel, query) }));
  return query.trim() ? sections.filter((section) => section.rows.length) : sections;
}

/** The app's default model (Settings → Models) carries a "Default" tag in the sheet. */
export function isDefaultChoice(settings: Pick<AppSettings, "defaultModel">, row: Pick<ModelChoice, "provider" | "variantIds">): boolean {
  return row.variantIds.some((id) => modelKey(row.provider, id) === settings.defaultModel);
}

/**
 * A reasoning or speed choice made in the sheet, under the desktop's rules: Cursor's preset
 * models switch to the matching catalog entry; every other model keeps its id and records the
 * preference (saved per model, as the desktop effort panel does).
 */
export function chooseExecution(provider: AgentProviderId, model: string | null, models: readonly DiscoveredModel[], preference: ExecutionOptions, next: ExecutionOptions): { model: string | null; preference: ExecutionOptions; save: boolean } {
  const controls = modelExecutionControls(provider, model, [...models], preference);
  if (provider === "cursor" && !controls.parameterized) {
    const effort = next.effort !== undefined ? next.effort : controls.effort;
    const fast = next.fast ?? controls.fast;
    const id = offeredCursorVariant(controls.variants, model, effort, fast) ?? model;
    const parameterized = Boolean(models.find((row) => row.id === id)?.parameterized);
    return { model: id, preference: parameterized ? { effort, fast } : {}, save: parameterized };
  }
  return { model, preference: { ...preference, ...next }, save: Boolean(model) };
}

/** Which option rows the summary screen shows: only what the selected model (and its provider) actually has. */
export function threadSettingsOptions(controls: Pick<ReturnType<typeof modelExecutionControls>, "levels" | "fastAvailable">, approvalModes: readonly ApprovalMode[]): { reasoning: boolean; tier: boolean; access: boolean } {
  return { reasoning: controls.levels.length > 0, tier: controls.fastAvailable, access: approvalModes.length > 0 };
}

/**
 * The summary card of the sheet: the pending model's name as the composer button shows it (null
 * when no model is chosen) and its note, "switches agent" when the pending provider differs from
 * the conversation's, else "default" for the app's default model.
 */
export function threadSettingsSummary(
  settings: Pick<AppSettings, "defaultModel">,
  models: readonly Pick<DiscoveredModel, "id" | "displayName">[],
  provider: AgentProviderId,
  model: string | null,
  conversationProvider: AgentProviderId | null,
): { name: string | null; note: "switch" | "default" | null } {
  const raw = models.find((row) => row.id === model)?.displayName ?? (model ? readableModelId(model) : null);
  const name = raw ? modelDisplayName(provider, raw, models.map((row) => row.displayName)).replace(/^Claude\s+/i, "") : null;
  const note = conversationProvider && conversationProvider !== provider ? "switch" : model && isDefaultChoice(settings, { provider, variantIds: [model] }) ? "default" : null;
  return { name, note };
}

/** The approval rows of the sheet, in the desktop menu's order; unsupported ones stay visible but disabled. */
export function approvalOptions(modes: readonly ApprovalMode[]): { mode: ApprovalMode; supported: boolean }[] {
  return (["ask", "auto", "full"] as const).map((mode) => ({ mode, supported: modes.includes(mode) }));
}

/** The branch row of the Git menu: "main · Clean" or "main · 3 changed"; Commit only with something to commit. */
export function gitMenuSummary(status: Pick<GitStatus, "changes" | "dirty" | "ahead" | "behind"> | null): { changed: number; clean: boolean; canCommit: boolean } {
  const changed = status?.changes.length ?? 0;
  const clean = !!status && changed === 0 && !status.dirty;
  return { changed, clean, canCommit: !!status && (changed > 0 || status.dirty) };
}

export interface PhoneTerminalRow { paneId: string; terminalId: string; number: number; running: boolean }

/** Every terminal of a conversation, across panes, in tab order. */
export function terminalRows(workspace: { panes: readonly { id: string; terminals: readonly { id: string; number: number }[] }[] } | undefined, running: readonly string[] = []): PhoneTerminalRow[] {
  const live = new Set(running);
  return (workspace?.panes ?? []).flatMap((pane) => pane.terminals.map((terminal) => ({ paneId: pane.id, terminalId: terminal.id, number: terminal.number, running: live.has(terminal.id) })))
    .sort((a, b) => a.number - b.number);
}

export interface TreeRow { entry: FileEntry; depth: number; expanded: boolean }

/** The Files tree as rows: an open folder lists its children below it, one level deeper. */
export function visibleTreeRows(root: readonly FileEntry[], children: Readonly<Record<string, readonly FileEntry[] | undefined>>, expanded: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (entries: readonly FileEntry[], depth: number) => {
    for (const entry of entries) {
      const open = entry.isDir && expanded.has(entry.path);
      rows.push({ entry, depth, expanded: open });
      const inside = open ? children[entry.path] : undefined;
      if (inside) walk(inside, depth + 1);
    }
  };
  walk(root, 0);
  return rows;
}

/** A path from the workspace file search (relative) made absolute under the workspace root. */
export function workspacePath(root: string, path: string): string {
  if (!root || path.startsWith("/")) return path;
  return `${root.replace(/\/+$/, "")}/${path.replace(/^\.?\/+/, "")}`;
}
