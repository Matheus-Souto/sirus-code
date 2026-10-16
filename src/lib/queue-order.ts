/**
 * Reordering what waits to be sent (ADR-124): the composer's request queue and the phone's
 * offline outbox. Items that are `fixed` (already sending, or tried once) keep the head of
 * the line, so nothing moves past them and they do not move.
 */
export function moveItem<T extends { id: string }>(items: readonly T[], id: string, delta: -1 | 1, fixed: (item: T) => boolean = () => false): T[] | null {
  const from = items.findIndex((item) => item.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= items.length || fixed(items[from]) || fixed(items[to])) return null;
  const next = [...items];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Whether `moveItem` would move the item that way. */
export function canMove<T extends { id: string }>(items: readonly T[], id: string, delta: -1 | 1, fixed?: (item: T) => boolean): boolean {
  return moveItem(items, id, delta, fixed) !== null;
}
