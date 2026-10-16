import type { Session, TurnActivity } from "@sirus/client/types";

// The store's `ACTIVE_STATUS`, kept here: the store imports this module.
const ACTIVE_STATUS = new Set(["starting", "running", "waiting"]);

/**
 * What a conversation's row says: it needs an approval or an
 * answer (its own, or a delegated session's or team worker's under it), the agent is working,
 * the reply ended while background work still runs ("Aguardando"), or the turn failed.
 */
export type ThreadStatus = "approval" | "input" | "working" | "waiting" | "failed";

export interface ThreadStatusLabel {
  readonly label: string;
  readonly icon: string;
  readonly className: string;
  readonly iconTintClassName: string;
}

/** Each status's label, icon and colors. */
export const THREAD_STATUS_LABEL: Record<ThreadStatus, ThreadStatusLabel> = {
  approval: { label: "Aprovação", icon: "exclamationmark.shield", className: "text-warning-foreground", iconTintClassName: "accent-warning-foreground" },
  input: { label: "Pergunta", icon: "questionmark.bubble", className: "text-adaptive-indigo-600-300", iconTintClassName: "accent-adaptive-indigo-600-300" },
  working: { label: "Trabalhando", icon: "circle.dashed", className: "text-adaptive-sky-600-400", iconTintClassName: "accent-adaptive-sky-600-400" },
  waiting: { label: "Aguardando", icon: "circle.dashed.inset.filled", className: "text-foreground-muted", iconTintClassName: "accent-foreground-muted" },
  failed: { label: "Falhou", icon: "exclamationmark.circle", className: "text-danger-foreground", iconTintClassName: "accent-danger-foreground" },
};

type Request = "approval" | "input" | null;

function ownRequest(session: Session): Request {
  const requests = session.pendingRequests ?? [];
  if (requests.some((request) => request.kind.type !== "userInput")) return "approval";
  if (requests.some((request) => request.kind.type === "userInput")) return "input";
  return session.status === "waiting" ? "approval" : null;
}

/**
 * Sessions above a delegated session or team worker that waits on the person, by what it
 * waits on; every session up the chain carries it, and an approval outranks a question.
 */
export function childRequests(sessions: readonly Session[]): Map<string, "approval" | "input"> {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const result = new Map<string, "approval" | "input">();
  for (const session of sessions) {
    const request = ownRequest(session);
    if (!request) continue;
    const seen = new Set([session.id]);
    let parentId = session.delegatedBy?.sessionId ?? session.teamWorker?.coordinatorSessionId ?? null;
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      if (result.get(parentId) !== "approval") result.set(parentId, request);
      const parent = byId.get(parentId);
      parentId = parent?.delegatedBy?.sessionId ?? parent?.teamWorker?.coordinatorSessionId ?? null;
    }
  }
  return result;
}

/** Background subagents or shell commands still running after the reply ended. */
function backgroundRunning(turn: TurnActivity | undefined): boolean {
  return !!turn?.endedAt && turn.items.some((item) => (item.background || item.shell) && item.state === "running");
}

export function threadStatus(session: Session, turn: TurnActivity | undefined, child: "approval" | "input" | undefined): ThreadStatus | null {
  const own = ownRequest(session);
  if (own === "approval" || child === "approval") return "approval";
  if (own === "input" || child === "input") return "input";
  if (ACTIVE_STATUS.has(session.status)) return "working";
  if (backgroundRunning(turn)) return "waiting";
  if (session.status === "failed") return "failed";
  return null;
}

/** When the shown state began: the turn's start while working, its end while waiting, else none. */
export function statusSince(status: ThreadStatus | null, turn: TurnActivity | undefined): number | null {
  if (!turn) return null;
  if (status === "working") return turn.startedAt + turn.pausedMs;
  if (status === "waiting") return turn.endedAt;
  if (status === "approval" || status === "input") return turn.waitingSince;
  return null;
}

/** "45s", "3m", "1h 20m": short. */
export function shortDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** Where a conversation falls on Início and in Conversas' filter. */
export type ConversationBucket = "attention" | "working" | "review";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A row's bucket: waiting on the person (an approval or a question), working (or still running
 * background work), or done in the last day and ready to look at. Older and failed ones have none.
 */
export function conversationBucket(status: ThreadStatus | null, lastActivityAt: string, now = Date.now()): ConversationBucket | null {
  if (status === "approval" || status === "input") return "attention";
  if (status === "working" || status === "waiting") return "working";
  if (status === "failed") return null;
  return now - Date.parse(lastActivityAt) < DAY_MS ? "review" : null;
}
