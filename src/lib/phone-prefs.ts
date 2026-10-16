import { create } from "zustand";
import type { AppSettings } from "@/client/types";

/**
 * Preferences the phone app keeps on the phone: they change
 * how this device shows the Mac's conversations and never touch the Mac's own settings. A
 * missing value follows the Mac.
 */
export interface PhonePrefs {
  theme?: AppSettings["theme"];
  /** Conversation text size, in the Mac's `uiFontSize` units. */
  textSize?: number;
  codeFontSize?: number;
  terminalFontSize?: number;
  wordWrap?: boolean;
  /** With a hardware keyboard: Return sends (Shift-Return adds a line), or adds a line (Command-Return sends). */
  returnKey: "send" | "newline";
  projectOrder: "recent" | "name";
  /** Home's arrangement (the row menu's "Arrange"): by last activity or by creation; missing follows the Mac's sidebar order. */
  threadOrder?: AppSettings["sidebarThreadSortOrder"];
  /** Home shows only this project's conversations (the dock's "List options"); missing shows every project. */
  homeProject?: string;
  /** Home shows only this computer's conversations (ADR-132); missing shows every computer. */
  homeComputer?: string;
}

export const PHONE_PREFS_KEY = "sirus.phone-prefs";
export const PHONE_TEXT_SIZES = { min: 11, max: 18 } as const;
export const PHONE_MONO_SIZES = { min: 10, max: 18 } as const;
const DEFAULTS: PhonePrefs = { returnKey: "send", projectOrder: "recent" };

export function readPhonePrefs(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): PhonePrefs {
  try {
    const raw = storage?.getItem(PHONE_PREFS_KEY);
    const stored = raw ? JSON.parse(raw) as Partial<PhonePrefs> : {};
    return {
      ...(["system", "light", "dark"].includes(stored.theme as string) ? { theme: stored.theme } : {}),
      ...(typeof stored.textSize === "number" ? { textSize: clamp(stored.textSize, PHONE_TEXT_SIZES) } : {}),
      ...(typeof stored.codeFontSize === "number" ? { codeFontSize: clamp(stored.codeFontSize, PHONE_MONO_SIZES) } : {}),
      ...(typeof stored.terminalFontSize === "number" ? { terminalFontSize: clamp(stored.terminalFontSize, PHONE_MONO_SIZES) } : {}),
      ...(typeof stored.wordWrap === "boolean" ? { wordWrap: stored.wordWrap } : {}),
      returnKey: stored.returnKey === "newline" ? "newline" : "send",
      projectOrder: stored.projectOrder === "name" ? "name" : "recent",
      ...(stored.threadOrder === "updated_at" || stored.threadOrder === "created_at" ? { threadOrder: stored.threadOrder } : {}),
      ...(typeof stored.homeProject === "string" && stored.homeProject ? { homeProject: stored.homeProject } : {}),
      ...(typeof stored.homeComputer === "string" && stored.homeComputer ? { homeComputer: stored.homeComputer } : {}),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function clamp(value: number, range: { min: number; max: number }) {
  return Math.round(Math.min(range.max, Math.max(range.min, value)));
}

interface PhonePrefsState {
  /** True only inside the phone app; the Mac window ignores these preferences. */
  active: boolean;
  prefs: PhonePrefs;
  activate: () => void;
  update: (patch: Partial<PhonePrefs>) => void;
}

export const usePhonePrefs = create<PhonePrefsState>((set, get) => ({
  active: false,
  prefs: { ...DEFAULTS },
  activate: () => set({ active: true, prefs: readPhonePrefs() }),
  update: (patch) => {
    const prefs = { ...get().prefs, ...patch };
    // `undefined` drops a value, so it follows the Mac again.
    for (const key of Object.keys(prefs) as (keyof PhonePrefs)[]) if (prefs[key] === undefined) delete prefs[key];
    try { globalThis.localStorage?.setItem(PHONE_PREFS_KEY, JSON.stringify(prefs)); } catch { /* private mode: kept for this visit */ }
    set({ prefs });
  },
}));

/** The Mac's settings as this phone shows them: its own choices win where it made any. */
export function withPhonePrefs(settings: AppSettings, prefs: PhonePrefs): AppSettings {
  return {
    ...settings,
    theme: prefs.theme ?? settings.theme,
    uiFontSize: prefs.textSize ?? settings.uiFontSize,
    codeFontSize: prefs.codeFontSize ?? settings.codeFontSize,
    terminalFontSize: prefs.terminalFontSize ?? settings.terminalFontSize,
    diffWordWrap: prefs.wordWrap ?? settings.diffWordWrap,
  };
}

/** A display setting as the current device shows it (the phone's own value inside the phone app). */
export function usePhoneSetting<K extends "terminalFontSize" | "diffWordWrap">(key: K, value: AppSettings[K]): AppSettings[K] {
  const override = usePhonePrefs((state) => {
    if (!state.active) return undefined;
    return key === "terminalFontSize" ? state.prefs.terminalFontSize : state.prefs.wordWrap;
  });
  return (override ?? value) as AppSettings[K];
}

/** Whether Return adds a line in the composer (the phone app's keyboard setting). */
export function returnAddsLine(): boolean {
  const state = usePhonePrefs.getState();
  return state.active && state.prefs.returnKey === "newline";
}
