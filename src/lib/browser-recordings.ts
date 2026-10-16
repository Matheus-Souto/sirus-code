import { useSyncExternalStore } from "react";
import { BrowserRecorder, type RecorderOptions } from "@/lib/browser-recorder";

/**
 * The recordings in progress, one per session (ADR-112): the pane's button and an agent's
 * `browser_record_*` tools share them, so a recording outlives the pane being closed.
 */
const active = new Map<string, BrowserRecorder>();
const listeners = new Set<() => void>();
let version = 0;
const changed = () => { version += 1; for (const listener of listeners) listener(); };

export function isRecording(sessionId: string) {
  return active.has(sessionId);
}

export async function startRecording(sessionId: string, tabId: string, options: RecorderOptions, onEnd: (path: string | null, error: unknown) => void) {
  if (active.has(sessionId)) throw new Error("This browser is already recording.");
  const recorder = new BrowserRecorder(sessionId, tabId, options, (path, error) => {
    if (active.get(sessionId) === recorder) { active.delete(sessionId); changed(); }
    onEnd(path, error);
  });
  active.set(sessionId, recorder);
  changed();
  try { await recorder.start(); }
  catch (error) { active.delete(sessionId); changed(); throw error; }
}

/** Ends the session's recording; resolves with the saved file. */
export async function stopRecording(sessionId: string, reveal = true): Promise<string | null> {
  const recorder = active.get(sessionId);
  if (!recorder) throw new Error("This browser is not recording.");
  return recorder.stop(reveal);
}

export function useBrowserRecording(sessionId: string) {
  useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => version, () => version);
  return active.has(sessionId);
}
