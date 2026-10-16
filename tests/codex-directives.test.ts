import { test } from "node:test";
import assert from "node:assert/strict";
import { codexFollowups, readableCodexText } from "../src/lib/codex-directives.ts";

const reply = [
  "Preparei a planilha. Nada foi lançado.",
  "",
  ':codex-file-citation{path="/Users/g/out/Previa SL.xlsx" purpose="output"}',
  "",
  "- 99 lançamentos.",
  "",
  '- :codex-followup[Revisar as pendências]{prompt="Mostre as nove pendências da prévia."}',
  "•",
  ':codex-followup[Preparar prévia do Itaú]{prompt="Prepare a mesma conferência para o Itaú, sem lançar nada.”}',
].join("\n");

test("Codex directives read as plain text: cited files as paths, next steps removed", () => {
  const text = readableCodexText(reply);
  assert.ok(text.includes("`/Users/g/out/Previa SL.xlsx`"));
  assert.ok(text.includes("- 99 lançamentos."));
  assert.ok(!text.includes(":codex-"));
  assert.ok(!/^\s*•\s*$/m.test(text));
  assert.equal(readableCodexText("no directives here"), "no directives here");
});

test("Codex next steps become reply choices with their full prompts", () => {
  assert.deepEqual(codexFollowups(reply), [
    { label: "Revisar as pendências", prompt: "Mostre as nove pendências da prévia." },
    { label: "Preparar prévia do Itaú", prompt: "Prepare a mesma conferência para o Itaú, sem lançar nada." },
  ]);
  assert.deepEqual(codexFollowups("nothing"), []);
});
