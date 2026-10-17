import { test } from "node:test";
import assert from "node:assert/strict";
import { browserAddressDisplayValue, normalizeBrowserAddressInput, promptWantsBrowserCapture } from "../src/lib/browser-url.ts";

test("address input keeps explicit http(s) URLs and blank documents", () => {
  assert.equal(normalizeBrowserAddressInput("https://example.com/a?b=1#c"), "https://example.com/a?b=1#c");
  assert.equal(normalizeBrowserAddressInput("  http://localhost:1420/  "), "http://localhost:1420/");
  assert.equal(normalizeBrowserAddressInput("about:blank"), "about:blank");
  assert.equal(normalizeBrowserAddressInput(""), null);
  assert.equal(normalizeBrowserAddressInput("   "), null);
});

test("address input upgrades host-like text to https", () => {
  assert.equal(normalizeBrowserAddressInput("example.com"), "https://example.com");
  assert.equal(normalizeBrowserAddressInput("example.com/docs?q=1"), "https://example.com/docs?q=1");
  assert.equal(normalizeBrowserAddressInput("localhost:3000"), "https://localhost:3000");
  assert.equal(normalizeBrowserAddressInput("127.0.0.1:8080/app"), "https://127.0.0.1:8080/app");
});

test("address input turns words and unsafe schemes into a search", () => {
  assert.equal(normalizeBrowserAddressInput("hello world"), "https://www.google.com/search?q=hello%20world");
  assert.equal(normalizeBrowserAddressInput("javascript:alert(1)"), "https://www.google.com/search?q=javascript%3Aalert(1)");
  assert.equal(normalizeBrowserAddressInput("file:///etc/passwd"), "https://www.google.com/search?q=file%3A%2F%2F%2Fetc%2Fpasswd");
});

test("blank documents display as an empty address bar", () => {
  assert.equal(browserAddressDisplayValue("about:blank"), "");
  assert.equal(browserAddressDisplayValue("https://example.com"), "https://example.com");
});

test("only explicit mentions of the open page ask for a browser screenshot", () => {
  for (const prompt of ["Check the browser page", "o que tem no navegador?", "take a screenshot", "tira um print da tela", "fix the layout on this page", "veja a página e corrija", "o botão nesta página está torto", "qual o título desta página?", "o que tem dessa página", "captura de tela do login"]) {
    assert.equal(promptWantsBrowserCapture(prompt), true, prompt);
  }
  for (const prompt of ["add pagination to the users page component", "remove the print statement", "use print() to debug", "crie uma página de login", "imprimir o relatório"]) {
    assert.equal(promptWantsBrowserCapture(prompt), false, prompt);
  }
});
