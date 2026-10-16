import { Archive, House } from "@phosphor-icons/react";

/** Rail navigation glyphs (Phosphor); the active section uses the filled weight. */
export function SidebarNavigationIcon({ section, filled = false, size = 15 }: { section: "home" | "archived"; filled?: boolean; size?: number }) {
  const Glyph = section === "home" ? House : Archive;
  return <Glyph size={size} weight={filled ? "fill" : "regular"} aria-hidden="true" focusable="false" />;
}
