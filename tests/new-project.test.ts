import { test } from "node:test";
import assert from "node:assert/strict";
import { cloneFolderName, DEFAULT_PROJECT_PARENT, lastProjectMode, lastProjectParent, rememberProjectMode, projectSlug, projectTarget, rememberProjectParent, validProjectName } from "../src/lib/new-project.ts";
import { readFileSync } from "node:fs";

test("project slugs match the native folder names", () => {
  assert.equal(projectSlug("Meu Projeto Incrível"), "meu-projeto-incrivel");
  assert.equal(projectSlug("  ../../etc/passwd "), "etc-passwd");
  assert.equal(projectSlug("Ação & Reação!"), "acao-reacao");
  assert.equal(projectSlug("🚀🚀"), null);
  assert.ok((projectSlug("a".repeat(200)) ?? "").length <= 64);
  // The native side folds the same accents (src-tauri/src/new_project.rs).
  const native = readFileSync(new URL("../src-tauri/src/new_project.rs", import.meta.url), "utf8");
  for (const accent of ["ã", "ç", "õ", "ü", "ñ"]) assert.ok(native.includes(`'${accent}'`), accent);
});

test("names are validated and the target previewed under the parent", () => {
  assert.equal(validProjectName("Sirus"), true);
  for (const bad of ["", "   ", "bad\nname", "x".repeat(101), "!!!"]) assert.equal(validProjectName(bad), false, bad);
  assert.equal(projectTarget("~/Projetos/", "Meu App"), "~/Projetos/meu-app");
  assert.equal(projectTarget("", "Meu App"), null);
});

test("the last parent folder is remembered", () => {
  const store = new Map<string, string>();
  const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) };
  assert.equal(lastProjectParent(storage), DEFAULT_PROJECT_PARENT);
  rememberProjectParent(" /Users/me/code ", storage);
  assert.equal(lastProjectParent(storage), "/Users/me/code");
  assert.equal(lastProjectParent(undefined), DEFAULT_PROJECT_PARENT);
});

test("the new project dialog reopens on the last tab used", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
  assert.equal(lastProjectMode(storage), "open");
  rememberProjectMode("create", storage);
  assert.equal(lastProjectMode(storage), "create");
  values.set("sirus.newProjectMode", "bogus");
  assert.equal(lastProjectMode(storage), "open");
  assert.equal(lastProjectMode({ getItem: () => { throw new Error("blocked"); } }), "open");
});

test("clone sources name their folder like the native side", () => {
  assert.equal(cloneFolderName("viannaanalyst/sirus-code"), "sirus-code");
  assert.equal(cloneFolderName("github.com/a/b.git/"), "b");
  assert.equal(cloneFolderName("https://github.com/a/repo.git"), "repo");
  assert.equal(cloneFolderName("git@github.com:a/my_repo.git"), "my_repo");
  for (const bad of ["", "-u x/y", "../repo", "a/b/c", "a b/c", "file:///etc"]) assert.equal(cloneFolderName(bad), null, bad);
  const storage = { getItem: () => "clone" };
  assert.equal(lastProjectMode(storage), "clone");
});
