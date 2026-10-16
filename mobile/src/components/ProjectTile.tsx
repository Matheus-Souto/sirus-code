import type { Project } from "@sirus/client/types";
import { useEffect, useState } from "react";
import { Image, View } from "react-native";

import { projectInitial, projectTint } from "../data/project-look";
import { useSirus } from "../data/store";
import { AppText } from "./AppText";

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
 * A project's tile: its own icon (`project_auto_icon`) on a soft card, else its first letter or
 * emoji on its folder colour, with a light top-to-bottom sheen.
 */
export function ProjectTile(props: { readonly computerId: string; readonly project: Project; readonly size?: number }) {
  const size = props.size ?? 40;
  const radius = Math.round(size * 0.3);
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void autoIcon(props.computerId, props.project.id).then((value) => { if (live) setUri(value); });
    return () => { live = false; };
  }, [props.computerId, props.project.id]);
  if (uri) return <View className="items-center justify-center border-continuous bg-grouped-card" style={{ width: size, height: size, borderRadius: radius }}>
    <Image source={{ uri }} style={{ width: size * 0.62, height: size * 0.62, borderRadius: size * 0.12 }} />
  </View>;
  const tint = projectTint(props.project);
  return <View className="items-center justify-center overflow-hidden border-continuous" style={{ width: size, height: size, borderRadius: radius, backgroundColor: tint, experimental_backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0) 60%)" }}>
    <AppText className="font-t3-bold text-white" style={{ fontSize: size * 0.44, lineHeight: size * 0.56 }}>{projectInitial(props.project)}</AppText>
  </View>;
}
