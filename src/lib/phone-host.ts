import type { HostInfo } from "@/client/types";
import type { Locale } from "@/i18n";

/**
 * The phone app talks to whatever host serves it (ADR-131): the Mac app, or the headless
 * `sirus-host` on a Linux server. Its words follow: a server is never called "Mac", and the
 * features the host lacks are hidden instead of failing.
 */

export type HostKind = "mac" | "server";

/** Hosts older than ADR-131 send no capabilities: they are the Mac app. */
export function hostKind(info: HostInfo | null | undefined): HostKind {
  const capabilities = info?.capabilities;
  if (!capabilities) return "mac";
  return capabilities.headless || capabilities.platform !== "macos" ? "server" : "mac";
}

const SERVER_NOUN: Record<Locale, string> = { en: "server", "pt-BR": "servidor" };

/**
 * A phone string written for the Mac, reworded for a server: every "Mac" becomes "server"
 * ("servidor"), capitalized where it opens the text or a sentence. Both nouns are masculine in
 * Portuguese, so "no Mac", "do Mac" and "ao seu Mac" stay correct.
 */
export function hostWording(text: string, kind: HostKind, locale: Locale): string {
  if (kind === "mac") return text;
  const noun = SERVER_NOUN[locale] ?? SERVER_NOUN.en;
  return text.replace(/(^|[.!?…]\s+|\s|[("“'])Mac(?=\b)/g, (_match, before: string, offset: number) => {
    const opens = offset === 0 && before === "" || /[.!?…]\s+$/.test(before);
    return `${before}${opens ? noun[0].toUpperCase() + noun.slice(1) : noun}`;
  });
}

/** A translated template with `{name}` parameters filled in after the rewording, so a value (a branch, a file) is never touched. */
export function fillParams(text: string, params?: Record<string, string | number>): string {
  return params ? text.replace(/\{(\w+)\}/g, (match, name: string) => String(params[name] ?? match)) : text;
}

/** What the phone calls the host in its header and connection rows: the machine's name on a server, else "Mac". */
export function hostLabel(info: HostInfo | null | undefined, locale: Locale): string {
  if (hostKind(info) === "mac") return "Mac";
  const name = info?.hostName?.trim();
  if (name) return name;
  const noun = SERVER_NOUN[locale] ?? SERVER_NOUN.en;
  return noun[0].toUpperCase() + noun.slice(1);
}

export interface HostFeatures {
  /** The in-app browser and its agent tools. */
  browser: boolean;
  computerUse: boolean;
  /** The host's own dictation (the phone dictates with the browser's speech recognition). */
  dictation: boolean;
  /** Native file and folder pickers: none on a server, so folders are typed or cloned. */
  pickers: boolean;
  /** Devices and the iOS Simulator need a Mac. */
  devices: boolean;
  /** Opening a folder in an editor app needs a desktop. */
  openInEditor: boolean;
}

/** The features this host offers; an older host (no capabilities) is the Mac app and offers all. */
export function hostFeatures(info: HostInfo | null | undefined): HostFeatures {
  const capabilities = info?.capabilities;
  if (!capabilities) return { browser: true, computerUse: true, dictation: true, pickers: true, devices: true, openInEditor: true };
  return {
    browser: capabilities.browser,
    computerUse: capabilities.computerUse,
    dictation: capabilities.dictation,
    pickers: capabilities.pickers,
    devices: !capabilities.headless && capabilities.platform === "macos",
    openInEditor: !capabilities.headless,
  };
}
