import type { Project } from "@sirus/client/types";
import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { SvgXml } from "react-native-svg";

import { ASTRO_DEFAULT_COLOR, PROJECT_ICON_SYMBOLS, projectColor } from "../data/project-look";
import { useSirus } from "../data/store";
import { astroSvg } from "../lib/astro-svg";
import { AppText } from "./AppText";
import { SymbolView, type AppSymbolName } from "./AppSymbol";

// One lookup per project while the app runs.
const icons = new Map<string, Promise<string | null>>();

function autoIcon(computerId: string, projectId: string) {
  const key = `${computerId}:${projectId}`;
  let icon = icons.get(key);
  if (!icon) {
    icon = useSirus.getState().invoke<string | null>(computerId, "project_auto_icon", { projectId })
      .then((value) => value && /^(data:image\/|https:)/.test(value) ? value : null, () => null);
    icons.set(key, icon);
  }
  return icon;
}

/**
 * A project's icon as the desktop's sidebar draws it (`ProjectGlyph`), with no tile behind it:
 * its line icon in its colour, its logo, its emoji, its Astro icon (the same drawing, as SVG,
 * a little larger so it reads like the folder), the folder's own icon when the project has
 * none, else a folder in its colour.
 */
export function ProjectTile(props: { readonly computerId: string; readonly project: Project; readonly size?: number }) {
  const size = props.size ?? 40;
  const look = props.project.look;
  const plain = !look?.icon && !look?.logo && !look?.emoji && !look?.astro;
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    if (!plain) return;
    let live = true;
    void autoIcon(props.computerId, props.project.id).then((value) => { if (live) setUri(value); });
    return () => { live = false; };
  }, [plain, props.computerId, props.project.id]);
  const color = projectColor(props.project);
  const box = (child: React.ReactNode) => <View className="items-center justify-center" style={{ width: size, height: size }}>{child}</View>;

  const symbol = look?.icon ? PROJECT_ICON_SYMBOLS[look.icon] : undefined;
  if (symbol) return box(<SymbolView name={symbol as AppSymbolName} size={size * 0.72} weight="regular" tintColor={color} tintColorClassName={color ? undefined : "accent-foreground-secondary"} />);
  if (look?.logo) return box(<Image source={{ uri: look.logo }} style={{ width: size * 0.82, height: size * 0.82, borderRadius: size * 0.16 }} />);
  if (look?.emoji) return box(<AppText style={{ fontSize: size * 0.72, lineHeight: size * 0.9 }}>{look.emoji}</AppText>);
  if (look?.astro) {
    const drawn = size * 1.35;
    return box(<View style={{ position: "absolute", width: drawn, height: drawn }}>
      <SvgXml xml={astroSvg(look.astro.icon, look.astro.style, color ?? ASTRO_DEFAULT_COLOR)} width={drawn} height={drawn} />
    </View>);
  }
  if (uri) return box(<Image source={{ uri }} style={{ width: size * 0.78, height: size * 0.78, borderRadius: size * 0.16 }} />);
  return box(<SymbolView name="folder.fill" size={size * 0.72} tintColor={color} tintColorClassName={color ? undefined : "accent-foreground-tertiary"} />);
}
