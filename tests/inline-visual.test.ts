import assert from "node:assert/strict";
import test from "node:test";
import { buildVisualDocument, clampVisualHeight, readVisualMessage, readVisualTheme, safeThemeVars, safeVisualLink, VISUAL_BRIDGE, VISUAL_INITIAL_HEIGHT, VISUAL_MAX_HEIGHT, VISUAL_MIN_HEIGHT, visualThemeMessage } from "../src/lib/inline-visual.ts";

test("visual heights are bounded so taller pages scroll inside", () => {
  assert.equal(clampVisualHeight(10), VISUAL_MIN_HEIGHT);
  assert.equal(clampVisualHeight(300.2), 301);
  assert.equal(clampVisualHeight(99999), VISUAL_MAX_HEIGHT);
  assert.equal(clampVisualHeight(Number.NaN), VISUAL_INITIAL_HEIGHT);
});

test("frame messages are validated field by field", () => {
  assert.deepEqual(readVisualMessage({ sirusVisual: 1, type: "height", height: 220 }), { type: "height", height: 220 });
  assert.equal(readVisualMessage({ sirusVisual: 1, type: "height", height: "220" }), null);
  assert.equal(readVisualMessage({ type: "height", height: 220 }), null);
  assert.equal(readVisualMessage(null), null);
  assert.equal(readVisualMessage({ sirusVisual: 1, type: "eval", code: "x" }), null);
  assert.deepEqual(readVisualMessage({ sirusVisual: 1, type: "wheel", dx: 0, dy: 1e9 }), { type: "wheel", dx: 0, dy: 4000 });
  assert.equal(readVisualMessage({ sirusVisual: 1, type: "wheel", dx: 0, dy: Number.POSITIVE_INFINITY }), null);
  assert.deepEqual(readVisualMessage({ sirusVisual: 1, type: "link", url: "https://example.com/a b" }), { type: "link", url: "https://example.com/a%20b" });
  assert.equal(readVisualMessage({ sirusVisual: 1, type: "link", url: "javascript:alert(1)" }), null);
});

test("only http(s) and mailto links leave a visual", () => {
  assert.equal(safeVisualLink("http://example.com"), "http://example.com/");
  assert.equal(safeVisualLink("mailto:a@b.c"), "mailto:a@b.c");
  for (const url of ["file:///etc/passwd", "sirus-preview://localhost/v/x", "data:text/html,x", "/relative", "", 42, `https://x.com/${"a".repeat(3000)}`]) {
    assert.equal(safeVisualLink(url), null, String(url).slice(0, 40));
  }
});

test("theme values can never break out of their declaration", () => {
  const vars = safeThemeVars({
    "--sirus-text": "#ececec",
    "--sirus-border": "rgb(255 255 255 / 0.1)",
    "--sirus-font": "\"Inter\", system-ui, sans-serif",
    "--sirus-evil": "red;} body{display:none",
    "--sirus-tag": "</style><script>alert(1)</script>",
    "--other": "#fff",
    "--sirus-number": 3 as unknown as string,
  });
  assert.deepEqual(Object.keys(vars), ["--sirus-text", "--sirus-border", "--sirus-font"]);
});

test("the app theme maps to the visual's variables", () => {
  const tokens: Record<string, string> = { "--text-primary": " #111 ", "--ui-font-scale": "1.2", "--brand-violet": "#9a8cff" };
  const theme = readVisualTheme((name) => tokens[name] ?? "", "light");
  assert.equal(theme.scheme, "light");
  assert.equal(theme.vars["--sirus-text"], "#111");
  assert.equal(theme.vars["--sirus-series-1"], "#9a8cff");
  assert.equal(theme.vars["--sirus-font-size"], "15.6px");
  assert.equal(theme.vars["--sirus-info"], undefined);
  assert.deepEqual(visualThemeMessage(theme), { sirusVisualTheme: 1, scheme: "light", vars: theme.vars });
});

test("the theme and bridge come before every agent byte", () => {
  const html = "<!doctype html><html><body><script>parent.postMessage('x','*')</script></body></html>";
  const document = buildVisualDocument(html, { scheme: "dark", vars: { "--sirus-text": "#eee", "--sirus-x": "a;b" } });
  assert.ok(document.startsWith("<!doctype html><html data-theme=\"dark\">"));
  assert.ok(document.endsWith(html));
  assert.ok(document.indexOf(VISUAL_BRIDGE) < document.indexOf(html));
  assert.ok(document.includes(":root{--sirus-text:#eee;color-scheme:dark}"));
  assert.ok(!document.includes("a;b"));
  assert.ok(!VISUAL_BRIDGE.includes("</script"));
  // The bridge checks who sends the theme and forwards only trusted clicks.
  assert.ok(VISUAL_BRIDGE.includes("e.source!==P"));
  assert.ok(VISUAL_BRIDGE.includes("e.isTrusted"));
  assert.doesNotThrow(() => new Function(VISUAL_BRIDGE));
});
