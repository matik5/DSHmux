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

test("pinned sessions preserve pin order and full-text groups deduplicate pins", () => {
  const active = [
    { sessionId: "a", title: "Active", updatedAt: 3 },
    { sessionId: "b", title: "Second", updatedAt: 2 },
  ];
  const archived = [{ sessionId: "z", title: "Archived", updatedAt: 1, archived: true }];
  assert.deepEqual(
    chrome.pinnedSessions(active, archived, ["z", "missing", "a", "z"]).map((item) => item.sessionId),
    ["z", "a"]
  );
  const groups = chrome.groupedSearchResults([
    { ...active[0], snippet: "<b>plain text</b>" },
    { ...active[0], snippet: "duplicate" },
    { ...active[1], snippet: "active" },
    { ...archived[0], snippet: "old" },
  ], ["a"]);
  assert.deepEqual(groups.pinned.map((item) => item.sessionId), ["a"]);
  assert.equal(groups.pinned[0].snippet, "<b>plain text</b>");
  assert.deepEqual(groups.active.map((item) => item.sessionId), ["b"]);
  assert.deepEqual(groups.archived.map((item) => item.sessionId), ["z"]);
});

test("process menu action follows server state and Doctor gating", () => {
  const copy = {
    start: "Start DSH", stop: "Stop DSH", retryDsh: "Retry DSH",
    openDoctor: "Open Doctor", starting: "Starting", stopping: "Stopping",
  };
  assert.deepEqual(chrome.processActionFor("ready", "ready", copy), {
    command: "stop", label: "Stop DSH", disabled: false,
  });
  assert.deepEqual(chrome.processActionFor("stopped", "ready", copy), {
    command: "start", label: "Start DSH", disabled: false,
  });
  assert.deepEqual(chrome.processActionFor("error", "ready", copy), {
    command: "start", label: "Retry DSH", disabled: false,
  });
  assert.deepEqual(chrome.processActionFor("error", "dsh-missing", copy), {
    command: "open-doctor", label: "Open Doctor", disabled: false,
  });
  assert.equal(chrome.processActionFor("starting", "ready", copy).disabled, true);
  assert.equal(chrome.processActionFor("stopping", "ready", copy).command, "");
  assert.equal(chrome.isLatestSearchResult(4, 4), true);
  assert.equal(chrome.isLatestSearchResult(3, 4), false);
});

test("relative time and persisted active-session parsing are deterministic", () => {
  const now = Date.parse("2026-09-13T12:00:00Z");
  assert.equal(chrome.relativeTime(now, now, "now"), "now");
  assert.equal(chrome.relativeTime(now - 65 * 60_000, now, "now"), "1h");
  assert.equal(chrome.relativeTime(now - 8 * 86_400_000, now, "now"), "1w");
  assert.equal(chrome.sessionIdFromStorage('{"sessionId":"abc"}'), "abc");
  assert.equal(chrome.sessionIdFromStorage("not-json"), undefined);
});

test("DSH sidebar helper collapses only the first shell track", () => {
  assert.equal(
    chrome.hiddenSidebarGridTemplate("56px minmax(0px, 1fr) 320px"),
    "0px minmax(0px, 1fr) 320px"
  );
  assert.equal(chrome.hiddenSidebarGridTemplate("minmax(0px, 1fr)"), "minmax(0px, 1fr)");
});

test("DSH shell lookup skips wrappers and requires a pixel-leading grid", () => {
  const root = {};
  const frame = {
    parentElement: root,
    style: { gridTemplateColumns: "56px minmax(0px, 1fr) 320px" },
  };
  const wrapper = { parentElement: frame, style: { gridTemplateColumns: "" } };
  const anchor = { parentElement: wrapper };
  assert.equal(chrome.dshShellFrame(anchor, root), frame);
  assert.equal(chrome.dshShellFrame({ parentElement: wrapper }, frame), undefined);
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
  assert.match(html, /data-command="toggle-dsh-sidebar"/);
  assert.match(html, /id="dshmux-current-title" role="button" tabindex="0"/);
  assert.ok(html.indexOf('id="dshmux-pinned-tab"') < html.indexOf('id="dshmux-active-tab"'));
  assert.ok(html.indexOf('id="dshmux-active-tab"') < html.indexOf('id="dshmux-archived-tab"'));
  assert.match(html, /id="dshmux-full-text" type="checkbox"/);
  assert.match(html, /id="dshmux-process-action"/);
  assert.match(html, /aria-live="polite"/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /\\u003c\/script>/);
  assert.doesNotMatch(html, /dshmux-dictation-toggle/);

  const enabled = chatChromeHtml({
    lang: "en",
    currentTitle: "Session",
    serverState: "ready",
    initialSessionLoading: false,
    dictationEnabled: true,
    copy,
  }, "", "");
  assert.match(enabled, /id="dshmux-dictation-toggle"/);
  assert.match(enabled, /id="dshmux-dictation-status" role="status" aria-live="polite"/);
});

test("dictation gesture helpers allow only trusted active-state actions", () => {
  assert.equal(chrome.dictationClickRequest(false, "idle"), undefined);
  assert.equal(chrome.dictationClickRequest(true, "idle"), "dshmux-dictation-start");
  assert.equal(chrome.dictationClickRequest(true, "listening"), "dshmux-dictation-stop");
  assert.equal(chrome.dictationClickRequest(true, "stopping"), undefined);
  assert.equal(chrome.dictationCancelRequest(false, "Escape", "listening"), undefined);
  assert.equal(chrome.dictationCancelRequest(true, "Enter", "listening"), undefined);
  assert.equal(chrome.dictationCancelRequest(true, "Escape", "listening"), "dshmux-dictation-cancel");
});

test("composer insertion appends through one editing command without Send or raw DOM assignment", async () => {
  const calls = [];
  const selection = {
    removeAllRanges() { calls.push("remove"); },
    collapse(node, offset) { calls.push(["collapse", node, offset]); },
  };
  const editor = {
    innerText: "existing text",
    childNodes: [{ node: 1 }],
    focus() { calls.push("focus"); },
  };
  const doc = {
    querySelector(selector) {
      calls.push(["query", selector]);
      return editor;
    },
    getSelection() { return selection; },
    execCommand(command, ui, value) {
      calls.push(["exec", command, ui, value]);
      editor.innerText += value;
      return true;
    },
  };
  const result = await chrome.insertComposerText(doc, " dictated request ", (callback) => callback());
  assert.equal(result.ok, true);
  assert.equal(editor.innerText, "existing text dictated request");
  assert.deepEqual(calls.filter((call) => Array.isArray(call) && call[0] === "exec"), [
    ["exec", "insertText", false, " dictated request"],
  ]);
  assert.equal(calls.some((call) => Array.isArray(call) && /send/i.test(String(call[1]))), false);
});

test("composer insertion fails closed when the exact editable DSH seam is absent", async () => {
  let edited = false;
  const result = await chrome.insertComposerText({
    querySelector() { return null; },
    execCommand() { edited = true; return true; },
  }, "discard me", (callback) => callback());
  assert.deepEqual(result, { ok: false, code: "composer-unavailable" });
  assert.equal(edited, false);
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
  assert.match(css, /data-dshmux-sidebar-occupant-hidden/);
  assert.match(css, /\.dshmux-session-open\s*\{[^}]*min-height:\s*32px/s);
  assert.match(css, /grid-template-columns:\s*repeat\(3,/);
  assert.match(css, /\.dshmux-search-row\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.match(css, /#dshmux-dictation-toggle\[aria-pressed="true"\]/);
  assert.match(css, /data-dshmux-sidebar-occupant-hidden[^}]+visibility:\s*hidden/s);
  assert.doesNotMatch(css, /data-dshmux-sidebar-occupant-hidden[^}]+display:\s*none/s);
  assert.doesNotMatch(script, /require\s*\(|import\s+/);
  assert.match(
    script,
    /if \(editingSessionId\) return/,
    "session polling must not replace an active rename input"
  );
  assert.match(script, /title\.addEventListener\("dblclick", beginHeaderRename\)/);
  assert.match(script, /isLatestSearchResult\(message\.requestId, activeSearchRequestId\)/);
  assert.match(script, /snippet\.textContent = item\.snippet/);
});
