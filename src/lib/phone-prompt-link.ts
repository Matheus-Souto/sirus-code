import { AGENT_PROVIDER_IDS, type AgentProviderId } from "../client/types.ts";
import { PROMPT_LINK_MAX_PROMPT } from "./prompt-link.ts";

/**
 * Prompt links in the phone app (ADR-124): `/?prompt=…&project=…&provider=…&model=…` opens
 * the new-conversation sheet with the prompt filled in. It never sends. The rules mirror the
 * Mac's `sirus://new` links (ADR-122, `src-tauri/src/prompt_link.rs`): bounded values, each
 * known parameter at most once, a known provider, a model that passes the native check and a
 * prompt without invisible characters. Other parameters (`session`, the pairing's) are left
 * alone, since the app's address carries its own.
 */

export const PHONE_LINK_PARAMS = ["prompt", "project", "provider", "model"] as const;
/** The whole query, as the Mac bounds its links. */
const MAX_QUERY = 128 * 1024;
const MAX_PROJECT = 1_024;

/** Mirrors the native `LinkError` names the UI already words (`promptLink.reason.*`). */
export type PhoneLinkError = "tooLong" | "repeatedParameter" | "noPrompt" | "hiddenOnly" | "project" | "provider" | "model";

export type PhonePromptLink =
  | { kind: "open"; prompt: string; hiddenCharacters: number; project: string | null; provider: AgentProviderId | null; model: string | null }
  | { kind: "invalid"; reason: PhoneLinkError };

const HIDDEN: readonly [number, number][] = [
  [0x0000, 0x0008], [0x000b, 0x001f], [0x007f, 0x009f], [0x00ad, 0x00ad], [0x034f, 0x034f], [0x061c, 0x061c],
  [0x115f, 0x1160], [0x17b4, 0x17b5], [0x180b, 0x180f], [0x200b, 0x200c], [0x200e, 0x200f], [0x202a, 0x202e],
  [0x2060, 0x206f], [0x3164, 0x3164], [0xfe00, 0xfe0d], [0xfeff, 0xfeff], [0xffa0, 0xffa0], [0xfff0, 0xfffb],
  [0x1bca0, 0x1bca3], [0x1d173, 0x1d17a], [0xe0000, 0xe0fff],
];

/** Characters a reader cannot see (same table as `is_hidden` in `prompt_link.rs`). */
export function isHiddenCharacter(code: number): boolean {
  return HIDDEN.some(([from, to]) => code >= from && code <= to);
}

const isEmojiPart = (code: number) => (code >= 0x1f000 && code <= 0x1faff) || (code >= 0x2190 && code <= 0x2bff) || code === 0xfe0f;

/**
 * The prompt without hidden characters, and how many were removed. A zero-width joiner stays
 * only between emoji parts; line and paragraph separators become newlines; the result is trimmed.
 */
export function sanitizeLinkedPrompt(raw: string): { text: string; hidden: number } {
  let hidden = 0;
  const visible = [...raw.replace(/\r\n/g, "\n").replace(/[\r\u2028\u2029]/g, "\n")].filter((character) => {
    const keep = !isHiddenCharacter(character.codePointAt(0)!);
    if (!keep) hidden += 1;
    return keep;
  });
  let text = "";
  visible.forEach((character, index) => {
    if (character === "\u200d") {
      const before = visible[index - 1]?.codePointAt(0), after = visible[index + 1]?.codePointAt(0);
      if (!(before !== undefined && isEmojiPart(before) && after !== undefined && isEmojiPart(after))) { hidden += 1; return; }
    }
    text += character;
  });
  return { text: text.trim(), hidden };
}

/** `launch::valid_model`: what a provider's command line accepts as a model. */
export function validLinkedModel(model: string): boolean {
  return model.length > 0 && model.length <= 200 && !model.startsWith("-") && /^[A-Za-z0-9._:/@+-]+$/.test(model);
}

/** True when the address carries any prompt-link parameter. */
export function hasPromptLink(search: string): boolean {
  const params = new URLSearchParams(search);
  return PHONE_LINK_PARAMS.some((key) => params.has(key));
}

/** Reads a prompt link from the app's query string; null when there is none. */
export function parsePhonePromptLink(search: string): PhonePromptLink | null {
  if (!hasPromptLink(search)) return null;
  if (search.length > MAX_QUERY) return { kind: "invalid", reason: "tooLong" };
  const params = new URLSearchParams(search);
  const values: Partial<Record<(typeof PHONE_LINK_PARAMS)[number], string>> = {};
  for (const key of PHONE_LINK_PARAMS) {
    const all = params.getAll(key);
    if (all.length > 1) return { kind: "invalid", reason: "repeatedParameter" };
    if (all.length) values[key] = all[0];
  }
  const optional = (value: string | undefined) => value?.trim() || null;
  if (values.prompt === undefined) return { kind: "invalid", reason: "noPrompt" };
  if ([...values.prompt].length > PROMPT_LINK_MAX_PROMPT) return { kind: "invalid", reason: "tooLong" };
  const { text: prompt, hidden } = sanitizeLinkedPrompt(values.prompt);
  if (!prompt) return { kind: "invalid", reason: hidden ? "hiddenOnly" : "noPrompt" };
  const project = optional(values.project);
  // eslint-disable-next-line no-control-regex
  if (project && ([...project].length > MAX_PROJECT || [...project].some((character) => /[\u0000-\u001f\u007f-\u009f]/.test(character) || isHiddenCharacter(character.codePointAt(0)!)))) return { kind: "invalid", reason: "project" };
  const providerValue = optional(values.provider)?.toLowerCase() ?? null;
  const provider = providerValue === null ? null : (AGENT_PROVIDER_IDS as readonly string[]).includes(providerValue) ? providerValue as AgentProviderId : undefined;
  if (provider === undefined) return { kind: "invalid", reason: "provider" };
  const model = optional(values.model);
  if (model && (!provider || !validLinkedModel(model))) return { kind: "invalid", reason: "model" };
  return { kind: "open", prompt, hiddenCharacters: hidden, project, provider, model };
}

/** What the new-conversation sheet receives from a link that opened. */
export interface LinkedDraft { prompt: string; hiddenCharacters: number; missingProject: string | null; provider: AgentProviderId | null; model: string | null }

/** The query string without the prompt-link parameters, for `history.replaceState`. */
export function withoutPromptLink(search: string): string {
  const params = new URLSearchParams(search);
  for (const key of PHONE_LINK_PARAMS) params.delete(key);
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}

/**
 * The project a link names: by id, then name (any case), then path, the most recently opened
 * first. Null when it names none here (the sheet then keeps its usual project and says so).
 */
export function resolveLinkedProject<P extends { id: string; name: string; path: string; lastOpenedAt: string }>(wanted: string | null, projects: readonly P[]): P | null {
  if (!wanted) return null;
  const ordered = [...projects].sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));
  const lower = wanted.toLowerCase();
  const trim = (path: string) => path.replace(/\/+$/, "") || path;
  return ordered.find((project) => project.id === wanted)
    ?? ordered.find((project) => project.name.toLowerCase() === lower)
    ?? ordered.find((project) => trim(project.path) === trim(wanted))
    ?? null;
}
