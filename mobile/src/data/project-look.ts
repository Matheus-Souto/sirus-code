import type { Project } from "@sirus/client/types";

/** The desktop's preset folder colours (ADR-059); custom colours are stored as `#rrggbb`. */
const PROJECT_COLORS: Record<string, string> = {
  blue: "#4f8cff", red: "#e5604d", yellow: "#f0c43a", green: "#4cc06c", pink: "#e0609a",
  purple: "#a16ae8", teal: "#45b8ac", orange: "#ee8a3a", gray: "#8e8e93",
};
const FALLBACK = ["#4f8cff", "#a16ae8", "#45b8ac", "#ee8a3a", "#e0609a", "#4cc06c", "#e5604d"];

/** A project's tile colour: its own folder colour, else one picked from its name (stable). */
export function projectTint(project: Pick<Project, "name" | "look"> | undefined): string {
  const own = project?.look?.color;
  if (own) return PROJECT_COLORS[own] ?? own;
  let hash = 0;
  for (const char of project?.name ?? "") hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return FALLBACK[hash % FALLBACK.length]!;
}

/** What the tile shows: the project's emoji, else its first letter. */
export function projectInitial(project: Pick<Project, "name" | "look"> | undefined): string {
  return project?.look?.emoji || (project?.name.match(/[\p{L}\p{N}]/u)?.[0]?.toLocaleUpperCase() ?? "?");
}
