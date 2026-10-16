/**
 * Codex writes a few remark-style directives meant for its own app: a cited file
 * (`:codex-file-citation{path="…" purpose="output"}`) and suggested next steps
 * (`:codex-followup[Label]{prompt="…"}`). Sirus shows the file as a path, which the
 * transcript turns into a file link, and offers the next steps as reply choices.
 */
export interface CodexFollowup { label: string; prompt: string }

const ATTRS = /([a-zA-Z_][\w-]*)\s*=\s*"((?:[^"\\]|\\.)*)"/g;
// `"` may close as a typographic quote when the model writes prose around it.
const DIRECTIVE = /:codex-([a-z][a-z-]*)(?:\[([^\]\n]*)\])?\{([^}\n]*)\}/g;

function attributes(raw: string): Record<string, string> {
  const normalized = raw.replace(/[“”]/g, "\"");
  const values: Record<string, string> = {};
  for (const match of normalized.matchAll(ATTRS)) values[match[1]] = match[2].replace(/\\(.)/g, "$1");
  return values;
}

/** The text with Codex directives replaced for reading: files as code paths, next steps removed. */
export function readableCodexText(text: string): string {
  if (!text.includes(":codex-")) return text;
  const replace = (line: string) => line.replace(DIRECTIVE, (_whole, kind: string, label: string | undefined, raw: string) => {
    if (kind === "file-citation") { const path = attributes(raw).path; return path ? `\`${path}\`` : ""; }
    // Next steps become reply choices; an unknown directive keeps only its label.
    return kind === "followup" ? "" : label ?? "";
  });
  const lines: string[] = [];
  for (const line of text.split("\n")) {
    // Codex separates its next steps with lone bullets; they go with them.
    if (/^\s*[•·]\s*$/.test(line)) continue;
    if (!line.includes(":codex-")) { lines.push(line); continue; }
    const next = replace(line);
    // A list item or line that held only directives disappears with them.
    if (!next.replace(/^\s*(?:[-*•]|\d{1,2}[.)])?\s*/, "").replace(/[\s•·]+/g, "")) continue;
    lines.push(next);
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

/** Next steps Codex suggested at the end of a reply, in order, without repeats. */
export function codexFollowups(text: string): CodexFollowup[] {
  if (!text.includes(":codex-followup")) return [];
  const followups: CodexFollowup[] = [];
  for (const match of text.matchAll(DIRECTIVE)) {
    if (match[1] !== "followup") continue;
    const label = (match[2] ?? "").trim();
    const prompt = (attributes(match[3]).prompt ?? "").trim();
    if (!label || !prompt || followups.some((item) => item.label === label)) continue;
    followups.push({ label: label.slice(0, 120), prompt: prompt.slice(0, 2000) });
  }
  return followups.slice(0, 6);
}
