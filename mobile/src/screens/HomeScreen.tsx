import { useNavigation, type NavigationProp, type ParamListBase } from "@react-navigation/native";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Pressable, View } from "react-native";

import { translate } from "@sirus/i18n";
import { rowMenuItems } from "@sirus/lib/phone-home";
import { relativeTime } from "@sirus/lib/session-board";
import { canSnooze, phoneSnoozeChoices, snoozeDeadline } from "@sirus/lib/snooze";
import type { MenuAction } from "@react-native-menu/menu";
import * as Clipboard from "expo-clipboard";

import { SymbolView } from "../components/AppSymbol";
import { AppText } from "../components/AppText";
import { ControlPillMenu } from "../components/ControlPillMenu";
import { ProviderIcon } from "../components/ProviderIcon";
import { computerName } from "../data/computers";
import { isScratch, projectLabel } from "../data/scratch";
import { selectRows, transcriptKey, useSirus, type RowAction, type SessionRow } from "../data/store";
import { shortDuration, statusSince, THREAD_STATUS_LABEL, threadStatus } from "../data/thread-status";
import { withNativeGlassHeaderItem } from "../features/layout/native-glass-header-items";
import { createNativeMailSearchToolbarItem } from "../features/layout/native-mail-search-toolbar";
import SIRUS_GLYPH from "../../assets/sirus-glyph.png";
import { useUniwindTheme } from "../lib/useUniwindTheme";
import { NativeStackScreenOptions } from "../native/StackHeader";

/**
 * Home: every computer's conversations in one list, a glass ellipsis for
 * settings, and the iOS 26 Mail-style bottom toolbar with filter, search and compose.
 */
export function HomeScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const data = useSirus((state) => state.data);
  const computers = useSirus((state) => state.computers);
  const connection = useSirus((state) => state.connection);
  const [query, setQuery] = useState("");
  const [computerFilter, setComputerFilter] = useState<string | null>(null);
  /** `computerId:projectId`. */
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const order = useSirus((state) => state.prefs.threadOrder);
  const rows = useMemo(() => selectRows({ data }, order), [data, order]);
  const shown = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return rows.filter((row) => (!computerFilter || row.computerId === computerFilter)
      && (!projectFilter || `${row.computerId}:${row.session.projectId}` === projectFilter)
      && (!needle || row.session.title.toLocaleLowerCase().includes(needle) || (row.project?.name ?? "").toLocaleLowerCase().includes(needle)));
  }, [rows, query, computerFilter, projectFilter]);
  const several = computers.length > 1;
  const loading = computers.some((computer) => !data[computer.id]) && !rows.length;
  const offline = computers.filter((computer) => connection[computer.id] === "lost");

  const theme = useUniwindTheme();
  const openSettings = useCallback(() => navigation.navigate("SettingsSheet"), [navigation]);

  // "Thread list options": a computer and a project submenu, the current one checked.
  const projects = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) if (row.project && (!computerFilter || row.computerId === computerFilter)) seen.set(`${row.computerId}:${row.project.id}`, row.project.name);
    return [...seen].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, computerFilter]);
  const filterMenu = useMemo(() => ({
    title: "Opções da lista",
    items: [
      { type: "submenu" as const, title: "Computador", items: [
        { type: "action" as const, title: "Todos os computadores", subtitle: "Conversas de todos os computadores", state: computerFilter === null ? "on" as const : "off" as const, onPress: () => setComputerFilter(null) },
        ...computers.map((computer) => ({ type: "action" as const, title: computerName(computer), state: computerFilter === computer.id ? "on" as const : "off" as const,
          onPress: () => { setComputerFilter(computer.id); setProjectFilter((current) => current?.startsWith(`${computer.id}:`) ? current : null); } })),
      ] },
      ...(projects.length ? [{ type: "submenu" as const, title: "Projeto", items: [
        { type: "action" as const, title: "Todos os projetos", subtitle: "Conversas de todos os projetos", state: projectFilter === null ? "on" as const : "off" as const, onPress: () => setProjectFilter(null) },
        ...projects.map((project) => ({ type: "action" as const, title: project.label, state: projectFilter === project.key ? "on" as const : "off" as const, onPress: () => setProjectFilter(project.key) })),
      ] }] : []),
    ],
  }), [computers, computerFilter, projects, projectFilter]);

  return <>
    <NativeStackScreenOptions
      optionsVersion={[filterMenu.items, computerFilter, projectFilter, offline.length, theme["--color-foreground"]]}
      options={{
        title: offline.length ? `${computerName(offline[0])} offline` : "Sirus",
        // The Sirus mark before the name, in the theme's foreground (white in dark, black in light).
        headerTitle: offline.length ? undefined : () => <View className="flex-row items-center gap-2">
          <Image source={SIRUS_GLYPH} style={{ width: 22, height: 22, tintColor: theme["--color-foreground"] }} />
          <AppText className="font-t3-bold text-[18px]">Sirus</AppText>
        </View>,
        unstable_headerRightItems: () => [
          withNativeGlassHeaderItem({ accessibilityLabel: "Ajustes", icon: { name: "ellipsis", type: "sfSymbol" } as const, identifier: "home-settings", label: "", onPress: openSettings, type: "button" }),
        ],
        headerSearchBarOptions: { autoCapitalize: "none", onCancelButtonPress: () => setQuery("") },
        unstable_headerToolbarItems: () => [
          createNativeMailSearchToolbarItem({
            composeButtonId: "home-new",
            composeSystemImageName: "square.and.pencil",
            filterMenu,
            filterButtonId: "home-filter",
            filterSystemImageName: computerFilter || projectFilter ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease",
            onComposePress: () => navigation.navigate("NewThread"),
            onSearchTextChange: setQuery,
            placeholder: "Buscar",
            searchTextChangeId: "home-search-text",
            showsSearchDismissButton: true,
          }),
        ],
      }}
    />
    <FlatList
      className="flex-1 bg-screen"
      contentInsetAdjustmentBehavior="automatic"
      data={shown}
      keyExtractor={(row) => `${row.computerId}:${row.session.id}`}
      ListHeaderComponent={shown.length ? <SectionTitle title="Recentes" count={shown.length} /> : undefined}
      ListEmptyComponent={loading ? <ActivityIndicator className="mt-16" /> : <AppText className="mt-16 text-center text-sm text-foreground-muted">{query ? "Nada encontrado." : "Nenhuma conversa ainda."}</AppText>}
      renderItem={({ item }) => <ThreadRow row={item} computerLabel={several ? computerName(computers.find((computer) => computer.id === item.computerId) ?? { hostName: "", kind: "mac" }) : null}
        onPress={() => navigation.navigate("Thread", { computerId: item.computerId, sessionId: item.session.id })} />}
      contentContainerStyle={{ paddingBottom: 96 }}
    />
  </>;
}

function SectionTitle(props: { readonly title: string; readonly count: number }) {
  return <View className="flex-row items-center gap-2 px-5 pb-1 pt-3">
    <AppText className="text-xs text-foreground-muted">{props.title}</AppText>
    <AppText className="text-xs text-foreground-tertiary">{props.count}</AppText>
    <View className="ml-2 h-px flex-1 bg-border-subtle" />
  </View>;
}

const ACTIVE = new Set(["starting", "running", "waiting"]);
const t = (key: string, params?: Record<string, string | number>) => translate("pt-BR", key, params);
const failed = (title: string) => (reason: unknown) => Alert.alert(title, reason instanceof Error ? reason.message : String(reason));

/**
 * A conversation row: agent mark, title and time; project, branch and computer
 * below. A long press lifts it into iOS's context menu with the phone web app's actions
 * (`rowMenuItems`): copy the id, archive, snooze, arrange, pin, rename, auto-archive, delete.
 */
/** A row's status: its icon and label, and how long it has been so (ticking). */
function StatusLabel(props: { readonly status: keyof typeof THREAD_STATUS_LABEL; readonly since: number | null }) {
  const label = THREAD_STATUS_LABEL[props.status];
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (props.since === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [props.since]);
  return <View className="flex-row items-center gap-1">
    <SymbolView name={label.icon as never} size={13} weight="semibold" tintColorClassName={label.iconTintClassName as never} />
    <AppText className={`font-t3-bold text-xs ${label.className}`}>{label.label}</AppText>
    {props.since !== null ? <AppText className={`text-xs tabular-nums ${label.className}`}>{shortDuration(now - props.since)}</AppText> : null}
  </View>;
}

const ThreadRow = memo(function ThreadRow(props: { readonly row: SessionRow; readonly computerLabel: string | null; readonly onPress: () => void }) {
  const { session, project, computerId, pinned } = props.row;
  const working = ACTIVE.has(session.status);
  const turn = useSirus((state) => state.turns[transcriptKey(computerId, session.id)]);
  const status = threadStatus(session, turn, props.row.childRequest);
  const order = useSirus((state) => state.prefs.threadOrder);
  const time = relativeTime(session.lastActivityAt);
  const details = [projectLabel(project), isScratch(project) ? null : session.worktree?.branch, props.computerLabel].filter(Boolean).join(" · ");
  const items = rowMenuItems({ place: "home", pinned, active: working, autoArchiveDisabled: !!session.autoArchiveDisabled, order });
  const run = (action: RowAction, title: string) => void useSirus.getState().rowAction(computerId, session.id, action).catch(failed(title));
  const labels: Record<string, string> = {
    "copy-id": t("phoneHome.copyId"), archive: t("mobile.archive"), unarchive: t("mobile.unarchive"), return: t("snooze.return"),
    arrange: t("phoneHome.arrange"), pin: t("mobile.pin"), unpin: t("mobile.unpin"), rename: t("phoneHome.rename"),
    "auto-archive": t("phoneHome.autoArchive"), delete: t("mobile.delete"),
  };
  const symbols: Record<string, string> = {
    "copy-id": "doc.on.doc", archive: "archivebox", arrange: "arrow.up.arrow.down", pin: "pin", unpin: "pin.slash",
    rename: "square.and.pencil", "auto-archive": "timer", delete: "trash",
  };
  // Order: copy, archive, snooze (each choice with its time), pin, rename, auto-archive, delete.
  const now = new Date();
  const actions: MenuAction[] = items.filter((item) => item.id !== "arrange").flatMap((item): MenuAction[] => {
    const base: MenuAction = { id: item.id, title: labels[item.id] ?? item.id, image: symbols[item.id], attributes: { destructive: item.destructive, disabled: item.disabled } };
    if (item.id === "auto-archive") {
      return [{ ...base, subactions: item.submenu?.map((option) => ({ id: `${item.id}:${option.id}`, title: t(`phoneHome.autoArchive.${option.id}`), state: option.checked ? "on" : "off" })) }];
    }
    return item.id === "archive" ? [base, {
      id: "snooze", title: t("snooze.confirm"), image: "clock", attributes: { disabled: !canSnooze(session) },
      subactions: phoneSnoozeChoices(now).map((choice) => ({ id: `snooze:${choice.at.toISOString()}`, title: t(`snooze.preset.${choice.preset}`), subtitle: snoozeDeadline(choice.at, now, "pt-BR", t) })),
    }] : [base];
  });
  const onAction = (id: string) => {
    if (id === "copy-id") void Clipboard.setStringAsync(session.id);
    else if (id === "archive" || id === "pin" || id === "unpin") run({ type: id }, labels[id]!);
    else if (id.startsWith("snooze:")) run({ type: "snooze", until: id.slice("snooze:".length) }, t("snooze.confirm"));
    else if (id.startsWith("arrange:")) useSirus.getState().setPrefs({ threadOrder: id.endsWith("created_at") ? "created_at" : "updated_at" });
    else if (id.startsWith("auto-archive:")) run({ type: "auto-archive", enabled: id.endsWith(":enabled") }, labels["auto-archive"]!);
    else if (id === "rename") Alert.prompt(t("phoneHome.rename"), undefined, [
      { text: "Cancelar", style: "cancel" },
      { text: "Salvar", onPress: (value?: string) => { if (value?.trim() && value.trim() !== session.title) run({ type: "rename", title: value }, labels.rename!); } },
    ], "plain-text", session.title);
    else if (id === "delete") Alert.alert(`Excluir "${session.title || "conversa"}"?`, "A conversa some deste computador. Não dá para desfazer.", [
      { text: "Cancelar", style: "cancel" },
      ...(session.worktree?.isolated ? [{ text: "Excluir e remover o worktree", style: "destructive" as const, onPress: () => run({ type: "delete", removeWorktree: true }, labels.delete!) }] : []),
      { text: "Excluir", style: "destructive", onPress: () => run({ type: "delete", removeWorktree: false }, labels.delete!) },
    ]);
  };
  return <ControlPillMenu actions={actions} shouldOpenOnLongPress onPressAction={({ nativeEvent }) => onAction(nativeEvent.event)}>
    <Pressable onPress={props.onPress} className="bg-screen px-5 py-2.5 active:bg-row-hover">
      <View className="flex-row items-center gap-2.5">
        <ProviderIcon provider={session.agent} size={16} />
        <AppText numberOfLines={1} className="flex-1 font-t3-medium text-base">{session.title || "Nova conversa"}</AppText>
        {pinned ? <SymbolView name="pin.fill" size={11} tintColorClassName="accent-foreground-tertiary" /> : null}
        {status ? <StatusLabel status={status} since={statusSince(status, turn)} /> : <AppText className="text-xs text-foreground-tertiary">{time === "now" ? "agora" : time}</AppText>}
      </View>
      {details ? <AppText numberOfLines={1} className="ml-[26px] mt-0.5 text-xs text-foreground-muted">{details}</AppText> : null}
    </Pressable>
  </ControlPillMenu>;
});
