import { test } from "node:test";
import assert from "node:assert/strict";
import type { AppSettings } from "../src/client/types.ts";
import { PHONE_PREFS_KEY, readPhonePrefs, withPhonePrefs } from "../src/lib/phone-prefs.ts";

const storage = (value: unknown) => ({ getItem: (key: string) => key === PHONE_PREFS_KEY ? JSON.stringify(value) : null });

test("Phone preferences read safely and follow the Mac where unset", () => {
  assert.deepEqual(readPhonePrefs(storage({})), { returnKey: "send", projectOrder: "recent" });
  assert.deepEqual(readPhonePrefs({ getItem: () => "{broken" }), { returnKey: "send", projectOrder: "recent" });
  const prefs = readPhonePrefs(storage({ theme: "light", textSize: 40, codeFontSize: 2, wordWrap: true, returnKey: "newline", projectOrder: "name", theme2: "x" }));
  assert.deepEqual(prefs, { theme: "light", textSize: 18, codeFontSize: 10, wordWrap: true, returnKey: "newline", projectOrder: "name" });
  assert.equal(readPhonePrefs(storage({ theme: "neon" })).theme, undefined);
});

test("Home's list filter is kept per phone and drops anything that is not a name", () => {
  assert.deepEqual(readPhonePrefs(storage({ homeProject: "p1", homeComputer: "vps" })), { returnKey: "send", projectOrder: "recent", homeProject: "p1", homeComputer: "vps" });
  assert.deepEqual(readPhonePrefs(storage({ homeProject: "", homeComputer: 3 })), { returnKey: "send", projectOrder: "recent" });
});

test("The phone's own look wins over the Mac's settings, and nothing else changes", () => {
  const mac = { theme: "dark", uiFontSize: 13, codeFontSize: 13, terminalFontSize: 13, diffWordWrap: false, locale: "pt-BR" } as AppSettings;
  assert.deepEqual(withPhonePrefs(mac, { returnKey: "send", projectOrder: "recent" }), mac);
  const shown = withPhonePrefs(mac, { theme: "light", textSize: 16, wordWrap: true, returnKey: "send", projectOrder: "recent" });
  assert.equal(shown.theme, "light");
  assert.equal(shown.uiFontSize, 16);
  assert.equal(shown.diffWordWrap, true);
  assert.equal(shown.codeFontSize, 13);
  assert.equal(shown.locale, "pt-BR");
});
