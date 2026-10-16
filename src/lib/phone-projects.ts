import type { HostKind } from "@/lib/phone-host";
import { DEFAULT_PROJECT_PARENT } from "@/lib/new-project";

/**
 * Adding a project from the phone (ADR-131): the host has no folder picker there, so a
 * project is cloned from GitHub or named by its path. The host validates again
 * (`new_project.rs`); these checks only explain a typo before anything is sent.
 */

const SEGMENT = /^[A-Za-z0-9._-]+$/;
const safeSegment = (part: string) => SEGMENT.test(part) && part !== "." && part !== ".." && !part.startsWith("-");

export type CloneCheck =
  | { ok: true; source: string; folder: string | null; name: string }
  | { ok: false; reason: "empty" | "repository" | "folder" };

/**
 * `owner/repo`, `github.com/owner/repo` or `https://github.com/owner/repo(.git)`, and an
 * optional folder name (one safe segment). Returns what the host is asked to clone and the
 * folder it lands in.
 */
export function checkClone(input: string, folder = ""): CloneCheck {
  const raw = input.trim();
  if (!raw) return { ok: false, reason: "empty" };
  const path = raw
    .replace(/^https:\/\/(?:www\.)?github\.com\//i, "")
    .replace(/^github\.com\//i, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "");
  const parts = path.split("/");
  if (/\s/.test(raw) || parts.length !== 2 || !parts.every(safeSegment) || /^[a-z]+:/i.test(path)) return { ok: false, reason: "repository" };
  const typed = folder.trim();
  if (typed && (!safeSegment(typed) || typed.length > 64)) return { ok: false, reason: "folder" };
  return { ok: true, source: `${parts[0]}/${parts[1]}`, folder: typed || null, name: typed || parts[1] };
}

/** Where a phone clone lands: next to the Mac's own projects, or `~/projects` on a server. */
export function cloneParent(kind: HostKind): string {
  return kind === "mac" ? DEFAULT_PROJECT_PARENT : "~/projects";
}

/** A typed folder path is sent only when it can be absolute: `/…`, `~` or `~/…`. */
export function folderPathLooksValid(path: string): boolean {
  const value = path.trim();
  if (!value || [...value].some((char) => char.charCodeAt(0) < 32)) return false;
  if (!(value.startsWith("/") || value === "~" || value.startsWith("~/"))) return false;
  return !value.split("/").includes("..");
}
