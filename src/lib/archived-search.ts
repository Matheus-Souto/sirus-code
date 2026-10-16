/**
 * Whether an archived conversation matches the phone's search (ADR-130): every word of the query is found in its title, project name or branch,
 * ignoring case and accents. An empty query matches everything.
 */
export function archivedMatches(query: string, session: { title: string; worktree: { branch: string } }, projectName?: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = fold(`${session.title} ${projectName ?? ""} ${session.worktree.branch}`);
  return words.every((word) => haystack.includes(word));
}

function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}
