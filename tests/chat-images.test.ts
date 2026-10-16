import test from "node:test";
import assert from "node:assert/strict";
import { parseChatInline } from "../src/lib/chat-markdown.ts";

test("reply images render for https and data URLs; other paths stay links", () => {
  assert.deepEqual(parseChatInline("veja ![tela](https://x.dev/a.png) ok"), [{ kind: "text", text: "veja " }, { kind: "image", url: "https://x.dev/a.png", alt: "tela" }, { kind: "text", text: " ok" }]);
  assert.equal(parseChatInline("![p](data:image/png;base64,AAAA)")[0].kind, "image");
  assert.deepEqual(parseChatInline("![shot](/tmp/shot.png)"), [{ kind: "link", url: "/tmp/shot.png", children: [{ kind: "text", text: "shot" }] }]);
  assert.equal(parseChatInline("![x](javascript:alert(1))")[0].kind, "link", "never an image from another scheme");
});

test("links to image files on the Mac open in the gallery; web and other links do not", async () => {
  const { isLocalImageLink } = await import("../src/lib/chat-markdown.ts");
  for (const yes of ["/tmp/previews/a.png", "~/Desktop/b.JPG", "shots/c.webp", "file:///tmp/d.gif", "/tmp/e.jpeg?v=2"]) assert.equal(isLocalImageLink(yes), true, yes);
  for (const no of ["https://x.dev/a.png", "javascript:alert(1).png", "data:image/png;base64,AA", "/tmp/notes.md", "/tmp/a.svg", "mailto:a.png"]) assert.equal(isLocalImageLink(no), false, no);
});

test("local images and videos are shown inline; web links and other files are not (ADR-119)", async () => {
  const { localMediaKind, localMediaPath, isLocalVideoLink } = await import("../src/lib/chat-markdown.ts");
  for (const image of ["/tmp/shot.png", "shots/a.JPG", "~/Desktop/b.webp", "file:///tmp/c.gif"]) assert.equal(localMediaKind(image), "image", image);
  for (const video of ["/tmp/demo.mp4", "recordings/run.MOV", "./clip.webm", "~/Movies/x.m4v", "file:///tmp/y.mp4", "/tmp/z.mp4?t=3"]) assert.equal(localMediaKind(video), "video", video);
  for (const other of ["https://x.dev/a.mp4", "http://x.dev/a.png", "javascript:a.mp4", "data:video/mp4;base64,AA", "/tmp/a.mkv", "/tmp/notes.md", "/tmp/archive", "mailto:a.mov"]) assert.equal(localMediaKind(other), null, other);
  assert.equal(isLocalVideoLink("/tmp/a.png"), false);
  assert.equal(localMediaPath(" /tmp/z.mp4?t=3 "), "/tmp/z.mp4");
  assert.equal(localMediaPath("shots/a.png#frag"), "shots/a.png");
});
