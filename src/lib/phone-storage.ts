import { REMOTE_TOKEN_KEY } from "@/client/remote-pairing";
import { PHONE_PREFS_KEY } from "@/lib/phone-prefs";

/** The offline outbox's key (`phone-outbox.ts`). */
const OUTBOX_KEY = "sirus.outbox";

/** What this phone keeps in local storage for Sirus Code (Settings → About → Client storage, ADR-130). */
export interface ClientStorageSummary {
  /** The pairing token: kept until Disconnect, never cleared here. */
  paired: boolean;
  /** Appearance, keyboard or project order chosen on the phone. */
  prefsSet: boolean;
  /** Messages written offline, still waiting to go out. */
  outbox: number;
  /** Other `sirus.*` items (applied look, recent emoji, stashes): shown, never cleared here. */
  other: number;
}

type ReadableStorage = Pick<Storage, "getItem" | "key" | "length">;

export function summarizeClientStorage(storage: ReadableStorage): ClientStorageSummary {
  let outbox = 0;
  try {
    const items = JSON.parse(storage.getItem(OUTBOX_KEY) ?? "[]") as unknown;
    outbox = Array.isArray(items) ? items.length : 0;
  } catch { /* unreadable: nothing waits */ }
  let other = 0;
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith("sirus.") && ![REMOTE_TOKEN_KEY, PHONE_PREFS_KEY, OUTBOX_KEY].includes(key)) other += 1;
  }
  const prefs = storage.getItem(PHONE_PREFS_KEY);
  return { paired: Boolean(storage.getItem(REMOTE_TOKEN_KEY)), prefsSet: Boolean(prefs && prefs !== "{}"), outbox, other };
}

/** A byte count as a short size ("0 KB", "1.2 MB"). */
export function formatStorageSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
