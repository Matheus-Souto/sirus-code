import { Platform, Switch } from "react-native";

import { MaterialSwitch } from "./MaterialSwitch";
import type { ThemedSwitchProps } from "./MaterialSwitch.types";

export type { ThemedSwitchProps } from "./MaterialSwitch.types";

export function ThemedSwitch(props: ThemedSwitchProps) {
  if (Platform.OS === "android") {
    return <MaterialSwitch {...props} />;
  }

  // Sirus palette: on is the foreground color (white in dark, black in light) with a knob in the
  // screen color, so it never takes the theme's blue.
  return (
    <Switch
      {...props}
      ios_backgroundColorClassName="accent-switch-inactive-track"
      trackColorOffClassName="accent-switch-inactive-track"
      trackColorOnClassName="accent-foreground"
      thumbColorClassName={props.value ? "accent-screen" : undefined}
    />
  );
}
