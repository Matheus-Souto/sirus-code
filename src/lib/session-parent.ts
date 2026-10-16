import type { Session } from "@/client/types";

/** Why a session has a parent conversation (ADR-111). */
export type ParentKind = "delegated" | "started" | "team";

export interface ParentLink {
  kind: ParentKind;
  title: string;
  sessionId: string;
}

/**
 * The conversation a session was started from: the session that delegated or started it, or
 * the team coordinator. Side chats sit beside their parent and forks have their own line, so
 * neither gets one. A removed parent leaves no link.
 */
export function parentLink(session: Pick<Session, "delegatedBy" | "teamWorker">, sessions: readonly Pick<Session, "id" | "title">[]): ParentLink | null {
  const byId = (id: string) => sessions.find((item) => item.id === id);
  if (session.delegatedBy) {
    const parent = byId(session.delegatedBy.sessionId);
    return parent ? { kind: session.delegatedBy.notify ? "delegated" : "started", title: parent.title, sessionId: parent.id } : null;
  }
  if (session.teamWorker) {
    const parent = byId(session.teamWorker.coordinatorSessionId);
    return parent ? { kind: "team", title: parent.title, sessionId: parent.id } : null;
  }
  return null;
}
