import { useNavigation, type NavigationProp, type ParamListBase } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { Keyboard, View, type NativeSyntheticEvent } from "react-native";
import { Tabs, type TabSelectedEvent, type TabSelectionPreventedEvent, type TabSelectionRejectedEvent } from "react-native-screens";

import { bucketCounts, useConversationRows } from "../data/use-conversations";
import { NativeWorkspaceTabActivityContext } from "../native/v5-workspace-context";
import { ConversationsScreen } from "./ConversationsScreen";
import { HomeScreen } from "./HomeScreen";
import { ProjectsScreen } from "./ProjectsScreen";
import { SettingsScreen } from "./SettingsScreen";
import { MainTabContext, type MainTab, type ConversationFilter } from "./main-tabs-context";

const SEARCH_TAB = "search";

const TABS: readonly { key: MainTab; title: string; icon: string; selected: string }[] = [
  { key: "home", title: "Início", icon: "house", selected: "house.fill" },
  { key: "conversations", title: "Conversas", icon: "bubble.left.and.bubble.right", selected: "bubble.left.and.bubble.right.fill" },
  { key: "projects", title: "Projetos", icon: "folder", selected: "folder.fill" },
  { key: "settings", title: "Ajustes", icon: "gearshape", selected: "gearshape.fill" },
];

/**
 * A tab's content, mounted the first time it is chosen and kept afterwards (switching back keeps
 * its scroll). Only the chosen tab writes the shared header (`NativeStackScreenOptions` and
 * `NativeHeaderToolbar` read this context).
 */
function RetainedTab(props: { readonly active: boolean; readonly isActive: () => boolean; readonly children: ReactNode }) {
  const [mounted, setMounted] = useState(props.active);
  if (props.active && !mounted) setMounted(true);
  const activity = useMemo(() => ({ active: props.active, isActive: props.isActive }), [props.active, props.isActive]);
  return mounted ? <NativeWorkspaceTabActivityContext value={activity}>{props.children}</NativeWorkspaceTabActivityContext> : null;
}

/**
 * The phone's main screen: iOS's own tab bar with Início, Conversas, Projetos and Ajustes, and the
 * detached search button (iOS 26) that opens the search over every conversation. A conversation,
 * a project's page or a settings page opens over the tabs in the main stack.
 */
export function MainTabs() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const [selected, setSelected] = useState<MainTab>("home");
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [provenance, setProvenance] = useState(0);
  // The badge counts what waits on the person: approvals and questions.
  const rows = useConversationRows();
  const waiting = useMemo(() => bucketCounts(rows).attention, [rows]);
  const request = useMemo(() => ({ selectedScreenKey: selected, baseProvenance: provenance }), [selected, provenance]);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const isActive = useCallback((tab: MainTab) => () => selectedRef.current === tab, []);
  const open = useCallback((tab: MainTab, next?: ConversationFilter) => {
    if (next) setFilter(next);
    setSelected(tab);
  }, []);
  const context = useMemo(() => ({ selected, open, filter, setFilter }), [selected, open, filter]);
  const activeChecks = useMemo(() => Object.fromEntries(TABS.map((tab) => [tab.key, isActive(tab.key)])) as Record<MainTab, () => boolean>, [isActive]);

  return <MainTabContext value={context}>
    <View style={{ flex: 1 }}>
      <Tabs.Host
        navStateRequest={request}
        ios={{ tabBarControllerMode: "tabBar", tabBarMinimizeBehavior: "never" }}
        onTabSelectionPrevented={({ nativeEvent }: NativeSyntheticEvent<TabSelectionPreventedEvent>) => {
          if (nativeEvent.preventedScreenKey !== SEARCH_TAB) return;
          void Haptics.selectionAsync().catch(() => undefined);
          navigation.navigate("Search");
        }}
        onTabSelectionRejected={({ nativeEvent }: NativeSyntheticEvent<TabSelectionRejectedEvent>) => setProvenance(nativeEvent.provenance)}
        onTabSelected={({ nativeEvent }: NativeSyntheticEvent<TabSelectedEvent>) => {
          const tab = nativeEvent.selectedScreenKey as MainTab;
          setProvenance(nativeEvent.provenance);
          if (nativeEvent.actionOrigin === "programmatic-js" || tab === selected) return;
          Keyboard.dismiss();
          void Haptics.selectionAsync().catch(() => undefined);
          setSelected(tab);
        }}
      >
        {TABS.map((tab) => <Tabs.Screen
          key={tab.key}
          screenKey={tab.key}
          title={tab.title}
          badgeValue={tab.key === "home" && waiting > 0 ? String(waiting) : undefined}
          tabBarItemAccessibilityLabel={tab.title}
          specialEffects={{ repeatedTabSelection: { popToRoot: false, scrollToTop: true } }}
          ios={{
            icon: { type: "sfSymbol", name: tab.icon },
            selectedIcon: { type: "sfSymbol", name: tab.selected },
            overrideScrollViewContentInsetAdjustmentBehavior: false,
          }}
        >
          <RetainedTab active={selected === tab.key} isActive={activeChecks[tab.key]}>
            {tab.key === "home" ? <HomeScreen /> : tab.key === "conversations" ? <ConversationsScreen /> : tab.key === "projects" ? <ProjectsScreen /> : <SettingsScreen />}
          </RetainedTab>
        </Tabs.Screen>)}
        <Tabs.Screen
          key={SEARCH_TAB}
          screenKey={SEARCH_TAB}
          title="Buscar"
          preventNativeSelection
          tabBarItemAccessibilityLabel="Buscar conversas"
          ios={{ role: "search", automaticallyActivatesSearch: true, icon: { type: "sfSymbol", name: "magnifyingglass" } }}
        >
          <View />
        </Tabs.Screen>
      </Tabs.Host>
    </View>
  </MainTabContext>;
}
