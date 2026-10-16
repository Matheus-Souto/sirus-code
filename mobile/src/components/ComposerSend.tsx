import * as Haptics from "expo-haptics";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";

import { useUniwindTheme } from "../lib/useUniwindTheme";
import { SymbolView } from "./AppSymbol";

/**
 * The composer's trailing control: a microphone while the field is empty, a
 * compact white send button once there is text, stop while the agent works. Dictation is the
 * iPhone's own speech recognition: words land in the field as they are spoken.
 */
export function ComposerSend(props: {
  readonly text: string;
  readonly onTextChange: (text: string) => void;
  readonly onSend: () => void;
  readonly sending?: boolean;
  /** The agent is working and the field is empty: offer stop instead. */
  readonly onStop?: () => void;
  readonly disabled?: boolean;
  /** Whether there is something to send (text by default; attachments count too). */
  readonly canSend?: boolean;
}) {
  const theme = useUniwindTheme();
  const [listening, setListening] = useState(false);
  // What was in the field when dictation began; the live words follow it.
  const base = useRef("");
  const join = (spoken: string) => [base.current.trimEnd(), spoken.trim()].filter(Boolean).join(" ");

  useSpeechRecognitionEvent("result", (event) => {
    const spoken = event.results[0]?.transcript ?? "";
    props.onTextChange(join(spoken));
  });
  useSpeechRecognitionEvent("end", () => setListening(false));
  useSpeechRecognitionEvent("error", (event) => {
    setListening(false);
    if (event.error !== "aborted" && event.error !== "no-speech") Alert.alert("Ditado", event.message || "Não foi possível ouvir agora.");
  });

  const startDictation = async () => {
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Ditado", "Permita o microfone e o reconhecimento de fala em Ajustes → Sirus.");
      return;
    }
    base.current = props.text;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    ExpoSpeechRecognitionModule.start({ lang: "pt-BR", interimResults: true, continuous: true, addsPunctuation: true });
    setListening(true);
  };
  const stopDictation = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    ExpoSpeechRecognitionModule.stop();
  };

  const hasText = props.text.trim().length > 0;
  const canSend = props.canSend ?? hasText;
  // the microphone and the send button are both always there; while the agent works
  // and nothing is typed, send becomes stop.
  const mic = listening
    ? <Pressable onPress={stopDictation} accessibilityLabel="Concluir ditado" hitSlop={6} className="size-8 items-center justify-center rounded-full bg-foreground active:opacity-70">
        <SymbolView name="waveform" size={14} weight="semibold" tintColorClassName="accent-screen" />
      </Pressable>
    : <Pressable onPress={() => void startDictation()} accessibilityLabel="Ditar" hitSlop={6} disabled={props.disabled}
        className="size-8 items-center justify-center rounded-full active:bg-row-hover">
        <SymbolView name="mic" size={17} tintColorClassName="accent-foreground-muted" />
      </Pressable>;
  const action = !hasText && props.onStop && !listening
    ? <Pressable onPress={props.onStop} accessibilityLabel="Parar" hitSlop={6} className="size-8 items-center justify-center rounded-full bg-foreground active:opacity-70">
        <SymbolView name="stop.fill" size={11} tintColorClassName="accent-screen" />
      </Pressable>
    : <Pressable onPress={props.onSend} disabled={!canSend || props.disabled || props.sending || listening} accessibilityLabel="Enviar" hitSlop={6}
        className="size-8 items-center justify-center rounded-full bg-foreground active:opacity-70 disabled:opacity-30">
        {props.sending ? <ActivityIndicator color={theme["--color-screen"]} size="small" /> : <SymbolView name="arrow.up" size={14} weight="bold" tintColorClassName="accent-screen" />}
      </Pressable>;
  return <View className="flex-row items-center gap-1.5">{mic}{action}</View>;
}
