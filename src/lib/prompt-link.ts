import type { AgentProviderId } from "../client/types.ts";
import { parseModelKey } from "./settings.ts";

/**
 * Prompt links (ADR-122). The native side reads and checks `sirus://new?…` links; this
 * module only decides what the UI shares and how a linked prompt lands in a draft.
 */

/** Matches `MAX_PROMPT` in `src-tauri/src/prompt_link.rs`. */
export const PROMPT_LINK_MAX_PROMPT = 8_000;

export interface PromptLinkSource {
  projectId: string | null;
  prompt: string;
  provider: AgentProviderId | null;
  model: string | null;
}

/**
 * What "Copy prompt link" shares: the draft of the composer that is open (the selected
 * conversation, or the project's new-thread landing) with its provider and model. Null
 * when that composer is empty.
 */
export function promptLinkSource(input: {
  selectedSessionId: string | null;
  selectedProjectId: string | null;
  sessions: ReadonlyArray<{ id: string; projectId: string; agent: AgentProviderId; model?: string | null }>;
  composerDrafts: Record<string, string>;
  defaultAgent: AgentProviderId;
  defaultModel: string | null;
}): PromptLinkSource | null {
  const session = input.selectedSessionId ? input.sessions.find((item) => item.id === input.selectedSessionId) : undefined;
  const owner = session ? `session:${session.id}` : input.selectedProjectId ? `project:${input.selectedProjectId}` : null;
  const prompt = owner ? (input.composerDrafts[owner] ?? "").trim() : "";
  if (!prompt) return null;
  if (session) return { projectId: session.projectId, prompt, provider: session.agent, model: session.model ?? null };
  const parsed = parseModelKey(input.defaultModel);
  return {
    projectId: input.selectedProjectId,
    prompt,
    provider: input.defaultAgent,
    model: parsed?.provider === input.defaultAgent ? parsed.id : null,
  };
}

/** The draft after a linked prompt arrives, and the text it replaced for an undo. */
export function placeLinkedPrompt(existing: string | undefined, linked: string): { draft: string; replaced: string | null } {
  const before = existing ?? "";
  return { draft: linked, replaced: before.trim() && before !== linked ? before : null };
}

/**
 * The model a link asked for, as the provider names it. When the provider's model list is
 * loaded and has no such model, the provider's default stands in (`known` is false).
 */
export function linkedModel(model: string | null, models: ReadonlyArray<{ id: string; displayName: string }> | undefined): { model: string | null; known: boolean } {
  if (!model) return { model: null, known: true };
  if (!models?.length) return { model, known: true };
  const wanted = model.toLowerCase();
  const match = models.find((item) => item.id.toLowerCase() === wanted) ?? models.find((item) => item.displayName.toLowerCase() === wanted);
  return match ? { model: match.id, known: true } : { model: null, known: false };
}
