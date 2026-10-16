import { createContext, use } from "react";

export type MainTab = "home" | "conversations" | "projects" | "settings";
/** What Conversas shows: every conversation, the ones waiting on the person, working, or done to review. */
export type ConversationFilter = "all" | "attention" | "working" | "review";

/** The main tabs: which one is chosen, and a way for a screen to move to another (Início's cards). */
export const MainTabContext = createContext<{
  readonly selected: MainTab;
  readonly open: (tab: MainTab, filter?: ConversationFilter) => void;
  readonly filter: ConversationFilter;
  readonly setFilter: (filter: ConversationFilter) => void;
} | null>(null);

export function useMainTabs() {
  return use(MainTabContext);
}
