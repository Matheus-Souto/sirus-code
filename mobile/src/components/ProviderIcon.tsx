import { SvgXml } from "react-native-svg";

import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { PROVIDER_MARKS } from "../lib/provider-marks";

/** An agent's logo, the desktop's own marks; monochrome ones take the text colour. */
export function ProviderIcon(props: { readonly provider: string; readonly size?: number }) {
  const { themeAppearance } = useAppearancePreferences();
  const size = props.size ?? 16;
  const mark = PROVIDER_MARKS[props.provider];
  if (!mark) return null;
  return <SvgXml xml={mark.xml} width={size} height={size} color={themeAppearance === "dark" ? "#e5e5e5" : "#171717"} />;
}
