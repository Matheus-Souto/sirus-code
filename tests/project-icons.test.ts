import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROJECT_ICON_NAMES, searchProjectIcons } from "../src/lib/project-icons.ts";
import { ASTRO_ICONS, ASTRO_STYLES } from "../src/lib/astro-art.ts";
import { translate } from "../src/i18n/index.ts";

test("project icons match the native list and search in both languages", () => {
  const native = readFileSync(new URL("../src-tauri/src/project_look.rs", import.meta.url), "utf8");
  const list = /pub const ICONS: \[&str; \d+\] = \[([\s\S]*?)\];/.exec(native)?.[1] ?? "";
  assert.deepEqual([...list.matchAll(/"([^"]+)"/g)].map((match) => match[1]), PROJECT_ICON_NAMES);
  assert.ok(searchProjectIcons("dinheiro").includes("currency-dollar"));
  assert.ok(searchProjectIcons("rocket").includes("rocket"));
  assert.equal(searchProjectIcons("").length, PROJECT_ICON_NAMES.length);
});

test("Astro project icons and styles match the native lists and are translated", () => {
  const native = readFileSync(new URL("../src-tauri/src/project_look.rs", import.meta.url), "utf8");
  const names = (constant: string) => [...(new RegExp(`pub const ${constant}: \\[&str; \\d+\\] = \\[([\\s\\S]*?)\\];`).exec(native)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(names("ASTRO_ICONS"), ASTRO_ICONS);
  assert.deepEqual(names("ASTRO_STYLES"), ASTRO_STYLES);
  for (const key of [...ASTRO_ICONS.map((icon) => `astros.icon.${icon}`), ...ASTRO_STYLES.map((style) => `astros.style.${style}`), "projectLook.tab.astros", "projectLook.searchAstros", "projectLook.astro"]) {
    assert.notEqual(translate("en", key), key);
    assert.notEqual(translate("pt-BR", key), key);
  }
});
