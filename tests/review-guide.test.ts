import { test } from "node:test";
import assert from "node:assert/strict";
import { anchorLabel, anchorRows, clampStep, findGuideFile, guideIsStale, pullRequestGuidePrompt, reviewGuideKey, sessionGuidePrompt } from "../src/lib/review-guide.ts";
import { reviewDiffLines } from "../src/lib/diff-comment.ts";

const diff = [
  "diff --git a/src/a.ts b/src/a.ts",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -10,4 +10,5 @@",
  " const a = 1;",
  "-const b = 2;",
  "+const b = 3;",
  "+const c = 4;",
  " const d = 5;",
  " const e = 6;",
  "@@ -40,2 +41,2 @@",
  " export {};",
  "-old();",
  "+next();",
].join("\n");

test("anchors land on the diff rows of their side and range", () => {
  const lines = reviewDiffLines(diff);
  // New side 11–12 are the two added lines (rows 6 and 7).
  assert.deepEqual(anchorRows(lines, { side: "new", start: 11, end: 12 }), { from: 6, to: 7 });
  // A reversed range reads the same; context lines count on both sides.
  assert.deepEqual(anchorRows(lines, { side: "new", start: 13, end: 10 }), { from: 4, to: 8 });
  // Old side 11 is the removed line.
  assert.deepEqual(anchorRows(lines, { side: "old", start: 11, end: 11 }), { from: 5, to: 5 });
  // Across hunks, the range spans both.
  assert.deepEqual(anchorRows(lines, { side: "new", start: 12, end: 42 }), { from: 7, to: 13 });
  // Outside every hunk, or on headers only: nothing to point at.
  assert.equal(anchorRows(lines, { side: "new", start: 20, end: 30 }), null);
  assert.equal(anchorRows([], { side: "new", start: 1, end: 1 }), null);
  // Untracked files number their lines from 1.
  assert.deepEqual(anchorRows(reviewDiffLines("+++ untracked\none\ntwo\nthree\n"), { side: "new", start: 2, end: 3 }), { from: 1, to: 2 });
});

test("files match as git names them, tolerating a/ and b/ prefixes", () => {
  const files = [{ path: "src/a.ts" }, { path: "b/real.ts" }];
  assert.equal(findGuideFile(files, "src/a.ts"), files[0]);
  assert.equal(findGuideFile(files, "b/src/a.ts"), files[0]);
  assert.equal(findGuideFile(files, "./src/a.ts"), files[0]);
  assert.equal(findGuideFile(files, "b/real.ts"), files[1]);
  assert.equal(findGuideFile(files, "src/missing.ts"), null);
});

test("steps stay inside the tour and stale guides are told apart", () => {
  assert.equal(clampStep(-3, 4), 0);
  assert.equal(clampStep(9, 4), 3);
  assert.equal(clampStep(1.7, 4), 1);
  assert.equal(clampStep(2, 0), 0);
  assert.equal(clampStep(Number.NaN, 3), 0);
  assert.equal(guideIsStale({ headSha: "abc1234" }, "ABC1234def"), false);
  assert.equal(guideIsStale({ headSha: "abc1234def" }, "abc1234"), false);
  assert.equal(guideIsStale({ headSha: "abc1234" }, "fff0000"), true);
  assert.equal(guideIsStale({ headSha: null }, "fff0000"), false);
  assert.equal(guideIsStale({ headSha: "abc1234" }, null), false);
});

test("keys match the Rust side and labels read as path and lines", () => {
  assert.equal(reviewGuideKey({ kind: "pullRequest", repository: "Acme/Site", number: 7 }), "pr:acme/site#7");
  assert.equal(reviewGuideKey({ kind: "session", sessionId: "s1" }), "session:s1");
  assert.equal(anchorLabel({ path: "src/a.ts", side: "new", start: 12, end: 4 }), "src/a.ts:4–12");
  assert.equal(anchorLabel({ path: "src/a.ts", side: "old", start: 3, end: 3 }), "src/a.ts:3 (removed)");
});

test("requests name the tool, the target and stay read-only", () => {
  const prompt = pullRequestGuidePrompt({ repository: "acme/site", number: 7, title: "Move the picker", url: "https://github.com/acme/site/pull/7", headRef: "picker", baseRef: "main", headOid: "abc1234" });
  assert.match(prompt, /^Write a guided review of pull request acme\/site#7: Move the picker\n/);
  assert.match(prompt, /Branch: picker → main/);
  assert.match(prompt, /sirus_write_review_guide tool, pullRequest "acme\/site#7", headSha "abc1234"\./);
  assert.match(prompt, /Do not change any code/);
  assert.doesNotMatch(pullRequestGuidePrompt({ repository: "a/b", number: 1, title: "t", url: "u" }), /headSha|Branch:/);
  assert.match(sessionGuidePrompt(), /without pullRequest/);
  assert.match(sessionGuidePrompt(), /Do not change any code/);
});
