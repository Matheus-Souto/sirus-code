import type { Message, MovedMessage } from "@/client/types";
import type { RemoteConnection } from "@/client/remote-transport";
import type { Environment } from "@/lib/environments";

/**
 * Continuing a conversation on another computer while its own is off (ADR-133 addendum): the
 * phone sends what it has, the transcript it shows and the project's GitHub address it noted
 * while that computer answered; the other computer starts from the branch as GitHub has it.
 */

const REMOTES_KEY = "sirus.projectRemotes";
const REMOTES_LIMIT = 300;
/** The same bounds `session_move.rs` applies to a moved transcript. */
const MAX_MESSAGES = 2000;
const MAX_MESSAGE_BYTES = 256 * 1024;
const MAX_BYTES = 8 * 1024 * 1024;

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
const slot = (environmentId: string, projectId: string) => `${environmentId}:${projectId}`;

function readRemotes(storage: Storage): Record<string, string> {
  try {
    const value = JSON.parse(storage.getItem(REMOTES_KEY) ?? "{}") as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].startsWith("https://")));
  } catch {
    return {};
  }
}

/** The project's GitHub address as last seen on that computer, if any. */
export function knownProjectRemote(environmentId: string, projectId: string, storage: Storage = localStorage): string | null {
  return readRemotes(storage)[slot(environmentId, projectId)] ?? null;
}

/** Notes (or forgets, with null) a project's GitHub address; the most recent ones are kept. */
export function noteProjectRemote(environmentId: string, projectId: string, url: string | null, storage: Storage = localStorage) {
  const remotes = readRemotes(storage);
  const key = slot(environmentId, projectId);
  if ((remotes[key] ?? null) === url) return;
  delete remotes[key];
  if (url) remotes[key] = url;
  storage.setItem(REMOTES_KEY, JSON.stringify(Object.fromEntries(Object.entries(remotes).slice(-REMOTES_LIMIT))));
}

/** The transcript as it can travel: finished user and agent text, the most recent within bounds. */
export function travellingMessages(messages: readonly Message[]): MovedMessage[] {
  const kept: MovedMessage[] = [];
  let bytes = 0;
  const encoder = new TextEncoder();
  for (let index = messages.length - 1; index >= 0 && kept.length < MAX_MESSAGES; index -= 1) {
    const message = messages[index];
    if ((message.role !== "user" && message.role !== "agent") || message.streaming) continue;
    let content = message.content.replace(/\0/g, "").trim();
    if (!content) continue;
    while (encoder.encode(content).length > MAX_MESSAGE_BYTES) content = content.slice(0, Math.floor(content.length * 0.9));
    const size = encoder.encode(content).length;
    if (bytes + size > MAX_BYTES) break;
    bytes += size;
    kept.push({ role: message.role, content, createdAt: message.createdAt.slice(0, 64) });
  }
  return kept.reverse();
}

/** Where an out-of-reach computer's conversation can continue: the other computers that answer. */
export function continueTargets(environments: readonly Environment[], connection: Record<string, RemoteConnection | undefined>, sourceId: string): Environment[] {
  return environments.filter((item) => item.id !== sourceId && item.token && connection[item.id] === "open");
}
