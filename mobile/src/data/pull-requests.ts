import type { GithubInbox, GithubItemState, PullRequestResponse } from "@sirus/client/types";
import { create } from "zustand";

import { useSirus } from "./store";

interface Entry {
  readonly inbox: GithubInbox | null;
  readonly loading: boolean;
  readonly error: string | null;
}

/**
 * Each computer's GitHub pull requests (the desktop's inbox, ADR-125's `pull_request_action`),
 * by `computerId:state`. Loaded when a screen asks and kept while the app runs.
 */
export const usePullRequests = create<{
  readonly entries: Record<string, Entry>;
  load: (computerId: string, state?: GithubItemState, force?: boolean) => Promise<void>;
}>()((set, get) => ({
  entries: {},
  load: async (computerId, state = "open", force = false) => {
    const key = `${computerId}:${state}`;
    const current = get().entries[key];
    if (current?.loading || (current?.inbox && !force)) return;
    set((store) => ({ entries: { ...store.entries, [key]: { inbox: current?.inbox ?? null, loading: true, error: null } } }));
    try {
      const result = await useSirus.getState().invoke<PullRequestResponse>(computerId, "pull_request_action", { action: { type: "list", kind: "pullRequest", state } });
      const inbox = result.type === "inbox" ? result : null;
      set((store) => ({ entries: { ...store.entries, [key]: { inbox, loading: false, error: null } } }));
    } catch (reason) {
      set((store) => ({ entries: { ...store.entries, [key]: { inbox: current?.inbox ?? null, loading: false, error: reason instanceof Error ? reason.message : String(reason) } } }));
    }
  },
}));

export const prKey = (computerId: string, state: GithubItemState = "open") => `${computerId}:${state}`;

/** The repositories (`owner/name`) a project's folder points at, from the inbox. */
export function projectRepositories(inbox: GithubInbox | null | undefined, projectId: string): string[] {
  return inbox?.repositories.filter((repository) => repository.projectIds.includes(projectId)).map((repository) => repository.repository) ?? [];
}
