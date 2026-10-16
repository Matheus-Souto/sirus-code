import { test } from "node:test";
import assert from "node:assert/strict";
import type { Message } from "../src/client/types.ts";
import type { Environment } from "../src/lib/environments.ts";
import { continueTargets, knownProjectRemote, noteProjectRemote, travellingMessages } from "../src/lib/phone-continue.ts";
import { enqueueMessage, readOutbox, retargetQueued } from "../src/lib/phone-outbox.ts";

function memory() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

const message = (role: Message["role"], content: string, streaming = false): Message => ({ id: content, sessionId: "s", role, content, createdAt: "2026-10-14T08:00:00Z", streaming });
const environment = (id: string, token = "t"): Environment => ({ id, label: "", kind: id === "home" ? "mac" : "server", baseUrl: `https://${id}.ts.net`, token, hostName: id });

test("project addresses are kept per computer and only as https", () => {
  const storage = memory();
  noteProjectRemote("home", "p1", "https://github.com/me/app", storage);
  noteProjectRemote("home", "p2", "git@github.com:me/x", storage);
  assert.equal(knownProjectRemote("home", "p1", storage), "https://github.com/me/app");
  assert.equal(knownProjectRemote("vps", "p1", storage), null);
  assert.equal(knownProjectRemote("home", "p2", storage), null);
  noteProjectRemote("home", "p1", null, storage);
  assert.equal(knownProjectRemote("home", "p1", storage), null);
});

test("only finished user and agent text travels, in order", () => {
  const list = travellingMessages([message("user", "fix it"), message("system", "note"), message("agent", "  "), message("agent", "done"), message("agent", "typing", true)]);
  assert.deepEqual(list.map((item) => [item.role, item.content]), [["user", "fix it"], ["agent", "done"]]);
});

test("conversations continue only on other computers that answer", () => {
  const targets = continueTargets([environment("home"), environment("vps"), environment("old", "")], { home: "lost", vps: "open", old: "open" }, "home");
  assert.deepEqual(targets.map((item) => item.id), ["vps"]);
});

test("waiting messages follow the conversation to its new id", () => {
  const storage = memory();
  enqueueMessage({ sessionId: "a", prompt: "one" }, storage);
  enqueueMessage({ sessionId: "b", prompt: "other" }, storage);
  enqueueMessage({ sessionId: "a", prompt: "two" }, storage);
  assert.equal(retargetQueued("a", "z", storage), 2);
  assert.deepEqual(readOutbox(storage).map((item) => `${item.sessionId}:${item.prompt}`), ["z:one", "b:other", "z:two"]);
});
