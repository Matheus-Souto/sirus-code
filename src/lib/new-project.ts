/** New project from a name. The folder name mirrors `slug` in `new_project.rs`. */
export const DEFAULT_PROJECT_PARENT = "~/Projetos";
const PARENT_KEY = "sirus.newProjectParent";

const FOLD: Record<string, string> = { á: "a", à: "a", â: "a", ã: "a", ä: "a", å: "a", é: "e", è: "e", ê: "e", ë: "e", í: "i", ì: "i", î: "i", ï: "i", ó: "o", ò: "o", ô: "o", õ: "o", ö: "o", ú: "u", ù: "u", û: "u", ü: "u", ç: "c", ñ: "n" };

export function projectSlug(name: string): string | null {
  let out = "";
  for (const char of name.trim().toLowerCase()) {
    const c = FOLD[char] ?? char;
    if (/^[a-z0-9]$/.test(c)) out += c;
    else if (out && !out.endsWith("-")) out += "-";
  }
  out = out.slice(0, 64).replace(/^-+|-+$/g, "");
  return out || null;
}

export function validProjectName(name: string): boolean {
  const trimmed = name.trim();
  // eslint-disable-next-line no-control-regex
  return trimmed.length > 0 && [...trimmed].length <= 100 && !/[\u0000-\u001f\u007f]/.test(trimmed) && projectSlug(trimmed) !== null;
}

/** Where the folder will be created, for the preview line. */
export function projectTarget(parent: string, name: string): string | null {
  const slug = projectSlug(name);
  const base = parent.trim().replace(/\/+$/, "");
  return slug && base ? `${base}/${slug}` : null;
}

export function lastProjectParent(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): string {
  try { return storage?.getItem(PARENT_KEY)?.trim() || DEFAULT_PROJECT_PARENT; } catch { return DEFAULT_PROJECT_PARENT; }
}

export function rememberProjectParent(parent: string, storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage) {
  try { storage?.setItem(PARENT_KEY, parent.trim()); } catch { /* storage unavailable: keep the default */ }
}

/** The "New project" dialog's tab: open a folder that exists, or create one from a name. */
export type ProjectDialogMode = "open" | "create" | "clone";
const MODE_KEY = "sirus.newProjectMode";

export function lastProjectMode(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): ProjectDialogMode {
  try {
    const mode = storage?.getItem(MODE_KEY);
    return mode === "create" || mode === "clone" ? mode : "open";
  } catch { return "open"; }
}

export function rememberProjectMode(mode: ProjectDialogMode, storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage) {
  try { storage?.setItem(MODE_KEY, mode); } catch { /* storage unavailable: keep the default */ }
}

/** The folder a clone lands in, for the preview line; mirrors `clone_source` in `new_project.rs`. */
export function cloneFolderName(input: string): string | null {
  const value = input.trim();
  // eslint-disable-next-line no-control-regex
  if (!value || value.startsWith("-") || /[\s\u0000-\u001f]/.test(value)) return null;
  const safe = (part: string) => /^[A-Za-z0-9._-]+$/.test(part) && part !== "." && part !== "..";
  let url: string;
  if (/^(https|ssh):\/\//.test(value) || /^git@[^/:]+:.+/.test(value)) url = value;
  else {
    const parts = value.replace(/^github\.com\//, "").replace(/\/+$/, "").split("/");
    if (parts.length !== 2 || !parts.every(safe)) return null;
    url = parts.join("/");
  }
  const last = url.replace(/\/+$/, "").split(/[/:]/).pop() ?? "";
  const name = last.replace(/\.git$/, "");
  return safe(name) && name.length <= 64 ? name : null;
}
