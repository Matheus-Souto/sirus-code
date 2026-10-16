import { memo, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import type { ActivityItem, Message } from "@sirus/client/types";
import { translate } from "@sirus/i18n";
import { activityElapsed, formatActivityDuration } from "@sirus/lib/agent-activity";
import { foldBoundary, groupFailures, groupSentence, markerSentence, stepCategory, stepSentence, timelineParts, type StepCategory, type TimelinePart } from "@sirus/lib/turn-timeline";

import { SymbolView } from "./AppSymbol";
import { AppText } from "./AppText";
import { Markdown } from "./Markdown";
import { ProviderIcon } from "./ProviderIcon";

const t = (key: string, params?: Record<string, string | number>) => translate("pt-BR", key, params);

const STEP_SYMBOL: Record<StepCategory, string> = {
  skill: "sparkles", edit: "pencil", command: "terminal", read: "doc.text", search: "magnifyingglass", web: "globe", tool: "wrench.and.screwdriver", agent: "person.2",
};

/**
 * An agent reply as the desktop show it: its text and its tool work in the order
 * they happened (`timelineParts`). Once the turn ends, everything before the final answer folds
 * into one "Trabalhou por …" line.
 */
/** The conversation's folder and how to open one of its files (file references in replies). */
export type ReplyFiles = { readonly cwd: string; readonly open: (path: string) => void };

export const AgentReply = memo(function AgentReply(props: { readonly message: Message; readonly agent: string; readonly cwd?: string; readonly files?: ReplyFiles }) {
  const { message } = props;
  const items = message.activity?.items ?? [];
  const parts = useMemo(() => timelineParts(message.content, items), [message.content, items]);
  const finished = !message.streaming;
  const fold = finished ? foldBoundary(parts) : 0;
  const [open, setOpen] = useState(false);
  const shown = fold > 0 && !open ? parts.slice(fold) : parts;
  const duration = message.activity ? formatActivityDuration(activityElapsed(message.activity, Date.now())) : null;

  if (!parts.length) {
    return message.streaming ? <View className="flex-row items-center gap-2"><ProviderIcon provider={props.agent} size={16} /><ActivityIndicator size="small" /></View> : null;
  }
  return <View className="gap-1">
    {fold > 0
      ? <Pressable onPress={() => setOpen((value) => !value)} className="flex-row items-center gap-1.5 self-start py-1.5 active:opacity-60" accessibilityRole="button">
          <AppText className="text-sm text-foreground-muted">{duration ? t("timeline.workedFor", { duration }) : t("timeline.worked")}</AppText>
          <SymbolView name={open ? "chevron.down" : "chevron.right"} size={11} weight="semibold" tintColorClassName="accent-foreground-muted" />
        </Pressable>
      : null}
    {shown.map((part, index) => <Part key={partKey(part, index)} part={part} content={message.content} cwd={props.cwd} files={props.files} />)}
  </View>;
});

function partKey(part: TimelinePart, index: number) {
  return part.kind === "text" ? `t${part.start}` : part.kind === "work" ? `w${part.items[0]?.id ?? index}` : part.kind === "marker" ? `m${part.item.id}` : `s${index}`;
}

function Part(props: { readonly part: TimelinePart; readonly content: string; readonly cwd?: string; readonly files?: ReplyFiles }) {
  const { part } = props;
  if (part.kind === "text") return <Markdown markdown={props.content.slice(part.start, part.end).trim()} files={props.files} />;
  if (part.kind === "steer") return <AppText className="self-end rounded-2xl bg-card px-3 py-1.5 text-sm text-foreground-muted">{part.text}</AppText>;
  if (part.kind === "marker") return <AppText className="py-1 text-sm text-foreground-muted">{markerSentence(part.item, t)}</AppText>;
  return <WorkGroup items={part.items} cwd={props.cwd} />;
}

/** Back-to-back steps as one line ("Leu 3 arquivos e rodou 2 comandos"); a tap lists each step. */
function WorkGroup(props: { readonly items: ActivityItem[]; readonly cwd?: string }) {
  const [open, setOpen] = useState(false);
  const running = props.items.find((item) => item.state === "running");
  const failures = groupFailures(props.items);
  const single = props.items.length === 1 ? props.items[0] : undefined;
  return <View className="py-0.5">
    <Pressable onPress={single ? undefined : () => setOpen((value) => !value)} className="flex-row items-center gap-2 py-1 active:opacity-60">
      {running ? <ActivityIndicator size="small" /> : <SymbolView name={STEP_SYMBOL[stepCategory(single ?? props.items[0]!)] as never} size={13} tintColorClassName="accent-foreground-muted" />}
      <AppText numberOfLines={1} className="flex-1 text-sm text-foreground-muted">
        {running ? stepSentence(running, t, props.cwd) : single ? stepSentence(single, t, props.cwd) : groupSentence(props.items, t)}
        {failures ? <AppText className="text-sm text-danger-foreground">{`  ${failures} ${failures === 1 ? "falhou" : "falharam"}`}</AppText> : null}
      </AppText>
      {single ? null : <SymbolView name={open ? "chevron.down" : "chevron.right"} size={10} weight="semibold" tintColorClassName="accent-foreground-tertiary" />}
    </Pressable>
    {open ? <View className="ml-[21px] gap-1 border-l border-border-subtle pb-1 pl-3">
      {props.items.map((item) => <AppText key={item.id} numberOfLines={2} className={item.state === "failed" ? "text-[13px] text-danger-foreground" : "text-[13px] text-foreground-tertiary"}>{stepSentence(item, t, props.cwd)}</AppText>)}
    </View> : null}
  </View>;
}
