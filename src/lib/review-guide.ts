/**
 * Guided reviews (ADR-125): where a guide's anchors land in a parsed diff, how a tour moves,
 * and the request an agent receives to write one. Pure, so the PR page, the Changes pane and
 * the phone share it.
 */
import type { ReviewGuide, ReviewGuideAnchor, ReviewGuideTarget } from "@/client/types";
import type { DiffLine } from "./transcript";

/** One guide per key; repositories compare without case, as on the Rust side. */
export function reviewGuideKey(target: ReviewGuideTarget): string {
  return target.kind === "pullRequest" ? `pr:${target.repository.toLowerCase()}#${target.number}` : `session:${target.sessionId}`;
}

/**
 * The diff rows an anchor covers: from the first row whose line on the anchor's side falls in
 * its range to the last. Null when none does (the lines are outside the diff's hunks).
 */
export function anchorRows(lines: readonly DiffLine[], anchor: Pick<ReviewGuideAnchor, "side" | "start" | "end">): { from: number; to: number } | null {
  const start = Math.min(anchor.start, anchor.end), end = Math.max(anchor.start, anchor.end);
  let from = -1, to = -1;
  lines.forEach((line, index) => {
    const number = anchor.side === "old" ? line.oldLine : line.newLine;
    if (number === null || number < start || number > end) return;
    if (from < 0) from = index;
    to = index;
  });
  return from < 0 ? null : { from, to };
}

/** The file a path names, as `git diff` names it; agents sometimes keep the `a/` or `b/` prefix. */
export function findGuideFile<T extends { path: string }>(files: readonly T[], path: string): T | null {
  const exact = files.find((file) => file.path === path);
  if (exact) return exact;
  const bare = path.replace(/^(?:\.\/|[ab]\/)/, "");
  return files.find((file) => file.path === bare) ?? null;
}

/** A step index kept inside the tour. */
export function clampStep(index: number, count: number): number {
  if (count <= 0 || !Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), count - 1);
}

/** Written against another head than the one the pull request is at now. */
export function guideIsStale(guide: Pick<ReviewGuide, "headSha">, head: string | null | undefined): boolean {
  const written = guide.headSha?.trim().toLowerCase(), current = head?.trim().toLowerCase();
  if (!written || !current) return false;
  return !current.startsWith(written) && !written.startsWith(current);
}

/** `src/app.ts:12–20`, `src/app.ts:12`, with `(removed)` for old-side lines. */
export function anchorLabel(anchor: ReviewGuideAnchor): string {
  const lines = anchor.start === anchor.end ? `${anchor.start}` : `${Math.min(anchor.start, anchor.end)}–${Math.max(anchor.start, anchor.end)}`;
  return `${anchor.path}:${lines}${anchor.side === "old" ? " (removed)" : ""}`;
}

const RULES = [
  "Order the steps so each builds on the ones before: the data shape or contract first, then the code that implements it, then its callers and UI. One step for a trivial change, usually 2 to 6.",
  "Each step: a title saying what it accomplishes (not a file name); 2 to 4 sentences on before vs after and why it matters; the one call I should make there, only if there is a real one (a trade-off, a compatibility promise, a risk accepted; not a bug or a nit); and anchors to the lines worth reading.",
  "Anchors use line numbers inside the diff's hunks: new-side numbers for added code, side \"old\" for removed code. Group mechanical changes (renames, snapshots, lockfiles, docs) into a closing step.",
  "Do not change any code, commit or push: this is read-only.",
];

/** The request for a guide of a pull request; the person reads it before sending. */
export function pullRequestGuidePrompt(pull: { repository: string; number: number; title: string; url: string; headRef?: string | null; baseRef?: string | null; headOid?: string | null }): string {
  const reference = `${pull.repository}#${pull.number}`;
  const lines = [`Write a guided review of pull request ${reference}: ${pull.title}`, pull.url];
  if (pull.headRef) lines.push(`Branch: ${pull.headRef} → ${pull.baseRef ?? "?"}`);
  lines.push(
    "",
    `Read the change first (gh pr diff ${pull.number} --repo ${pull.repository}, and the surrounding code where you need it). Then save the tour with the sirus_write_review_guide tool, pullRequest "${reference}"${pull.headOid ? `, headSha "${pull.headOid}"` : ""}.`,
    ...RULES,
  );
  return lines.join("\n");
}

/** The request for a guide of a session's own uncommitted changes. */
export function sessionGuidePrompt(): string {
  return [
    "Write a guided review of the uncommitted changes in this worktree, so I can review them step by step.",
    "",
    "Read them first (git diff HEAD, and new untracked files). Then save the tour with the sirus_write_review_guide tool, without pullRequest.",
    ...RULES,
  ].join("\n");
}
