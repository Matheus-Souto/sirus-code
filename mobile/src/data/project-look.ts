import type { Project } from "@sirus/client/types";

/** The desktop's preset folder colours (ADR-059); custom colours are stored as `#rrggbb`. */
const PROJECT_COLORS: Record<string, string> = {
  blue: "#4f8cff", red: "#e5604d", yellow: "#f0c43a", green: "#4cc06c", pink: "#e0609a",
  purple: "#a16ae8", teal: "#45b8ac", orange: "#ee8a3a", gray: "#8e8e93",
};

/** Without a project colour, Astro icons use this tint (the desktop's `ASTRO_DEFAULT_COLOR`). */
export const ASTRO_DEFAULT_COLOR = "#8c9bff";

/** A project's own colour, if it has one. */
export function projectColor(project: Pick<Project, "look"> | undefined): string | undefined {
  const own = project?.look?.color;
  return own ? PROJECT_COLORS[own] ?? own : undefined;
}

/**
 * The desktop's line icons (`project_look::ICONS`, Phosphor there) as SF Symbols, the closest
 * system drawing of each.
 */
export const PROJECT_ICON_SYMBOLS: Record<string, string> = {
  "folder": "folder", "code": "chevron.left.forwardslash.chevron.right", "terminal": "terminal", "book-open": "book",
  "graduation-cap": "graduationcap", "pencil-simple": "pencil", "feather": "pencil.and.scribble", "briefcase": "briefcase",
  "music-notes": "music.note", "chart-bar": "chart.bar", "barbell": "dumbbell", "scales": "scalemass",
  "globe": "globe", "airplane-tilt": "airplane", "wrench": "wrench.adjustable", "paw-print": "pawprint",
  "flask": "flask", "brain": "brain", "heart": "heart", "tree": "tree", "rocket": "paperplane",
  "lightbulb": "lightbulb", "star": "star", "coffee": "cup.and.saucer", "camera": "camera",
  "shopping-cart": "cart", "house": "house", "car": "car", "game-controller": "gamecontroller",
  "palette": "paintpalette", "database": "cylinder.split.1x2", "cloud": "cloud", "lock": "lock", "key": "key",
  "currency-dollar": "dollarsign", "bank": "building.columns", "stethoscope": "stethoscope", "chat-circle": "bubble.left",
  "envelope": "envelope", "device-mobile": "iphone", "calendar-blank": "calendar", "robot": "cpu",
  "cpu": "cpu", "bug": "ant", "leaf": "leaf", "sun": "sun.max", "moon": "moon", "fire": "flame",
  "lightning": "bolt", "cube": "cube", "puzzle-piece": "puzzlepiece", "trophy": "trophy", "users": "person.2",
  "storefront": "storefront", "film-slate": "film", "newspaper": "newspaper", "atom": "atom", "cat": "cat",
};
