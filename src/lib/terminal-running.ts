/**
 * Which sessions have a terminal shell running (ADR-121). A terminal counts from the moment
 * its PTY started until `pty-exit`, or until its tab is closed or its session removed; the
 * rows show a terminal glyph that brings that terminal into view. Event-driven, never polled.
 */
export type RunningTerminals = Readonly<Record<string, readonly string[]>>;

/** Marks one terminal of a session as running or not; returns the same object when nothing changes. */
export function withTerminalRunning(running: RunningTerminals, sessionId: string, terminalId: string, value: boolean): RunningTerminals {
  const current = running[sessionId] ?? [];
  if (current.includes(terminalId) === value) return running;
  const next = value ? [...current, terminalId] : current.filter((id) => id !== terminalId);
  if (next.length) return { ...running, [sessionId]: next };
  const rest = { ...running };
  delete rest[sessionId];
  return rest;
}

interface TerminalLayout { panes: readonly { id: string; terminals: readonly { id: string }[]; activeTerminalId: string }[] }

/**
 * The terminal to bring into view: the active tab of a region if it is running, else the first
 * running terminal in region order. Only terminals still listed in the session's workspace count.
 */
export function runningTerminalTarget(workspace: TerminalLayout | undefined, runningIds: readonly string[]): { paneId: string; terminalId: string } | null {
  if (!workspace || !runningIds.length) return null;
  const running = new Set(runningIds);
  const active = workspace.panes.find((pane) => running.has(pane.activeTerminalId) && pane.terminals.some((terminal) => terminal.id === pane.activeTerminalId));
  if (active) return { paneId: active.id, terminalId: active.activeTerminalId };
  for (const pane of workspace.panes) {
    const terminal = pane.terminals.find((item) => running.has(item.id));
    if (terminal) return { paneId: pane.id, terminalId: terminal.id };
  }
  return null;
}
