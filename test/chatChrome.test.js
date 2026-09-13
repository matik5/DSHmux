"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const chrome = require("../media/chat-chrome.js");
const { chatChromeHtml } = require("../out/chatChrome.js");

test("session helpers validate, sort by recency, and filter titles", () => {
  const items = [
    { sessionId: "old", title: "Alpha", updatedAt: "2026-01-01T00:00:00Z" },
    { sessionId: "new", title: "Beta", updatedAt: 2_000_000_000_000 },
    { sessionId: 42, title: "invalid" },
  ];
  assert.deepEqual(chrome.normalizedSessions(items).map((item) => item.sessionId), ["new", "old"]);
  assert.deepEqual(chrome.filterSessions(items, " ALP ").map((item) => item.sessionId), ["old"]);
});

test("relative time and persisted active-session parsing are deterministic", () => {
  const now = Date.parse("2026-09-13T12:00:00Z");
  assert.equal(chrome.relativeTime(now, now, "now"), "now");
  assert.equal(chrome.relativeTime(now - 65 * 60_000, now, "now"), "1h");
  assert.equal(chrome.relativeTime(now - 8 * 86_400_000, now, "now"), "1w");
  assert.equal(chrome.sessionIdFromStorage('{"sessionId":"abc"}'), "abc");
  assert.equal(chrome.sessionIdFromStorage("not-json"), undefined);
});

test("chrome HTML has accessible dialogs and safely serializes user text", () => {
  const dangerous = "</script><img src=x onerror=alert(1)>";
  const copy = new Proxy({}, { get: () => "label" });
  const html = chatChromeHtml({
    lang: "en",
    currentTitle: dangerous,
    serverState: "ready",
    initialSessionLoading: false,
    copy,
  }, "#root{}", "");
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /id="dshmux-overflow" role="dialog"/);
  assert.match(html, /aria-live="polite"/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /\\u003c\/script>/);
});

test("compact chrome stays dependency-free and covers narrow/theme adaptations", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "media", "chat-chrome.css"), "utf8");
  const script = fs.readFileSync(path.join(__dirname, "..", "media", "chat-chrome.js"), "utf8");
  assert.match(css, /--dshmux-header-height:\s*40px/);
  assert.match(css, /@media\s*\(max-width:\s*280px\)/);
  assert.match(css, /min-width:\s*0/);
  assert.match(css, /calc\(100vw\s*-\s*14px\)/);
  assert.match(css, /forced-colors:\s*active/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(script, /require\s*\(|import\s+/);
});
