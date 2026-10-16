import { useNavigation, useRoute, type NavigationProp, type ParamListBase, type RouteProp } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, Share, View } from "react-native";

import type { FileEntry, TextFileSnapshot } from "@sirus/client/types";

import { SymbolView } from "../components/AppSymbol";
import { AppText } from "../components/AppText";
import { FileIcon } from "../components/FileIcon";
import { Markdown } from "../components/Markdown";
import { useSirus } from "../data/store";
import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { NativeHeaderToolbar, NativeStackScreenOptions } from "../native/StackHeader";

type FilesParams = {
  Files: { computerId: string; sessionId: string; path?: string; title?: string };
  File: { computerId: string; sessionId: string; path: string };
};

const errorText = (reason: unknown) => reason instanceof Error ? reason.message : String(reason);

/**
 * The conversation's folder on its computer (`list_dir`), one level per screen, folders first,
 * with a search over the level's names. A file opens as rendered markdown or as code.
 */
export function FilesScreen() {
  const { computerId, sessionId, path, title } = useRoute<RouteProp<FilesParams, "Files">>().params;
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const [entries, setEntries] = useState<FileEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    useSirus.getState().invoke<FileEntry[]>(computerId, "list_dir", { sessionId, path })
      .then(setEntries, (reason: unknown) => setError(errorText(reason)));
  }, [computerId, sessionId, path]);

  const shown = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (entries ?? [])
      .filter((entry) => !needle || entry.name.toLocaleLowerCase().includes(needle))
      .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
  }, [entries, query]);

  return <View className="flex-1 bg-thread-canvas">
    <NativeStackScreenOptions options={{
      title: title ?? "Arquivos",
      unstable_headerSubtitle: path ?? undefined,
      headerSearchBarOptions: { placeholder: "Filtrar", autoCapitalize: "none", onChangeText: (event) => setQuery(event.nativeEvent.text), onCancelButtonPress: () => setQuery("") },
    }} optionsVersion={[title, path]} />
    {entries === null && !error ? <ActivityIndicator className="mt-24" /> : <FlatList
      className="flex-1"
      contentInsetAdjustmentBehavior="automatic"
      data={shown}
      keyExtractor={(entry) => entry.path}
      ListEmptyComponent={<AppText className="mt-16 px-8 text-center text-sm text-foreground-muted">{error ?? (query ? "Nada encontrado." : "Pasta vazia.")}</AppText>}
      renderItem={({ item }) => <Pressable
        onPress={() => item.isDir
          ? navigation.dispatch({ type: "PUSH", payload: { name: "Files", params: { computerId, sessionId, path: item.path, title: item.name } } })
          : navigation.navigate("File", { computerId, sessionId, path: item.path })}
        className="flex-row items-center gap-3 px-5 py-3 active:bg-row-hover">
        <FileIcon name={item.name} directory={item.isDir} size={20} />
        <AppText numberOfLines={1} className="flex-1 text-base">{item.name}</AppText>
        {item.isDir ? <SymbolView name="chevron.right" size={12} tintColorClassName="accent-foreground-tertiary" /> : null}
      </Pressable>}
      contentContainerStyle={{ paddingBottom: 40 }}
    />}
  </View>;
}

export function FileScreen() {
  const codeSize = useAppearancePreferences().appearance.codeFontSize;
  const { computerId, sessionId, path } = useRoute<RouteProp<FilesParams, "File">>().params;
  const [file, setFile] = useState<TextFileSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState(false);
  const name = path.split("/").pop() ?? path;
  const markdown = /\.(md|markdown|mdx)$/i.test(name);

  useEffect(() => {
    useSirus.getState().invoke<TextFileSnapshot>(computerId, "read_text_file", { sessionId, path })
      .then(setFile, (reason: unknown) => setError(errorText(reason)));
  }, [computerId, sessionId, path]);

  return <View className="flex-1 bg-thread-canvas">
    <NativeStackScreenOptions options={{ title: name, unstable_headerSubtitle: path }} />
    <NativeHeaderToolbar placement="right">
      <NativeHeaderToolbar.Menu accessibilityLabel="Mais" icon="ellipsis">
        {markdown ? <NativeHeaderToolbar.MenuAction icon={raw ? "doc.richtext" : "chevron.left.forwardslash.chevron.right"} onPress={() => setRaw((value) => !value)}>
          <NativeHeaderToolbar.Label>{raw ? "Ver formatado" : "Ver código"}</NativeHeaderToolbar.Label>
        </NativeHeaderToolbar.MenuAction> : null}
        <NativeHeaderToolbar.MenuAction icon="doc.on.doc" onPress={() => void Clipboard.setStringAsync(file?.content ?? "")}>
          <NativeHeaderToolbar.Label>Copiar conteúdo</NativeHeaderToolbar.Label>
        </NativeHeaderToolbar.MenuAction>
        <NativeHeaderToolbar.MenuAction icon="link" onPress={() => void Clipboard.setStringAsync(path)}>
          <NativeHeaderToolbar.Label>Copiar caminho</NativeHeaderToolbar.Label>
        </NativeHeaderToolbar.MenuAction>
        <NativeHeaderToolbar.MenuAction icon="square.and.arrow.up" onPress={() => void Share.share({ message: file?.content ?? "", title: name })}>
          <NativeHeaderToolbar.Label>Compartilhar</NativeHeaderToolbar.Label>
        </NativeHeaderToolbar.MenuAction>
      </NativeHeaderToolbar.Menu>
    </NativeHeaderToolbar>
    {!file && !error ? <ActivityIndicator className="mt-24" />
      : error || file?.binary ? <AppText className="mt-16 px-8 text-center text-sm text-foreground-muted">{error ?? "Este arquivo não é texto."}</AppText>
      : <ScrollView className="flex-1" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 18, paddingBottom: 60 }}>
          {markdown && !raw ? <Markdown markdown={file!.content} />
            : <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <AppText selectable style={{ fontFamily: "Menlo", fontSize: codeSize, lineHeight: Math.round(codeSize * 1.5) }}>{file!.content}</AppText>
              </ScrollView>}
        </ScrollView>}
  </View>;
}
