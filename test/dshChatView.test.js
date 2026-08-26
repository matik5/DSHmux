// Regression test for src/dshChatView.ts session switching (2026-08-25).
//
// Bug: clicking a session in the launcher used to post a "load-session" message
// that wrote `dsh.sessions.current` to localStorage and did location.reload().
// That did NOT switch the session, because the <head> session-preset script is
// baked in at assembly time and re-runs on every page load, clobbering the
// reloaded value back to the previously-baked session.
//
// Fix: loadSession now always re-assembles so the NEW session is baked into the
// <head> preset. This test pins that contract: loadSession must drive a
// re-assembly whose sessionPreset carries the chosen sessionId (and must be a
// no-op when the view already shows that exact session).
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const Module = require("node:module");
const path = require("node:path");

// --- Mock the virtual `vscode` module (only exists in the extension host). ---
const fakeVscode = {
  Uri: { file: (p) => ({ fsPath: p, toString: () => "file://" + p }) },
  ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3 },
  env: { language: "en" },
  window: {
    activeColorTheme: { kind: 2 },
    onDidChangeActiveColorTheme: () => ({ dispose() {} }),
  },
  workspace: {
    getConfiguration: () => ({ inspect: () => undefined, get: (_key, dflt) => dflt }),
    onDidChangeConfiguration: () => ({ dispose() {} }),
  },
};
const originalLoad = Module._load;
Module._load = function (request, _parent, _isMain) {
  if (request === "vscode") return fakeVscode;
  return originalLoad.apply(this, arguments);
};

// --- Stub documentAssembly to capture assembleDocument calls. ---
const assembleCalls = [];
let nextAssemblyError;
const daPath = require.resolve("../out/documentAssembly.js");
require.cache[daPath] = {
  id: daPath,
  filename: daPath,
  loaded: true,
  exports: {
    assembleDocument: async (opts) => {
      assembleCalls.push(opts);
      if (nextAssemblyError) {
        const error = nextAssemblyError;
        nextAssemblyError = undefined;
        throw error;
      }
      return { html: "<html>fake</html>", distRev: "r1", downloaded: false };
    },
  },
};

const { DshChatView } = require("../out/dshChatView.js");

// --- Fakes for the constructor dependencies. ---
function makeContext() {
  return {
    globalStorageUri: { fsPath: "/tmp/dsh-global" },
    // Real repo root: refresh() reads media/bridge-client.js from here.
    extensionUri: { fsPath: path.resolve(__dirname, "..") },
    subscriptions: [],
  };
}
function makeManager() {
  const listeners = {};
  return {
    state: "ready",
    serverUrl: "http://127.0.0.1:1",
    on(event, cb) {
      (listeners[event] ||= []).push(cb);
      return { dispose() {} };
    },
    emit(event, payload) {
      for (const cb of listeners[event] ?? []) cb(payload);
    },
  };
}
function makeWebviewView() {
  const posted = [];
  return {
    posted,
    webview: {
      options: {},
      cspSource: "vscode-resource:mock",
      html: "",
      postMessage(m) {
        posted.push(m);
      },
      onDidReceiveMessage() {
        return { dispose() {} };
      },
      asWebviewUri(uri) {
        return { toString: () => "vscode-webview://mock/" + uri.fsPath };
      },
    },
    onDidDispose() {
      return { dispose() {} };
    },
  };
}

async function flush() {
  // Let the async refresh() settle (it awaits the stubbed assembleDocument).
  await new Promise((r) => setImmediate(r));
}

test("loadSession re-assembles with the chosen session baked into the preset", async () => {
  const view = new DshChatView(makeContext(), makeManager());
  const wv = makeWebviewView();
  view.resolveWebviewView(wv);
  await flush(); // initial assembly (no session -> no preset)
  assembleCalls.length = 0;
  wv.posted.length = 0;

  view.loadSession("sess-42");

  assert.deepEqual(
    wv.posted[0],
    { type: "session-loading", loading: true },
    "the existing session must dim immediately, before re-assembly settles"
  );
  await flush();

  assert.equal(assembleCalls.length, 1, "loadSession must trigger exactly one re-assembly");
  assert.equal(
    assembleCalls[0].sessionPreset,
    JSON.stringify({ sessionId: "sess-42" }),
    "the re-assembly must bake the chosen session into the <head> preset"
  );
  assert.equal(assembleCalls[0].frameFontScale, 0.8, "side-panel DSH frame must default to 80% root font size");

  const chrome = assembleCalls[0].chromeHtml;
  assert.match(chrome, /data-mode="session"/, "session-loading overlay must have dimming styles");
  assert.match(chrome, /role="progressbar"/, "session-loading overlay must contain a progressbar");
  assert.match(chrome, /Loading session…/, "session-loading overlay must explain the delay");
  assert.match(chrome, /var initialSessionLoading = true/, "replacement document must start in the loading state");

  const scripts = [...chrome.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.ok(scripts.length > 0, "session-loading chrome script is missing");
  for (const script of scripts) {
    assert.doesNotThrow(() => new Function(script), "injected session-loading script must parse");
  }
});

test("loadSession of the already-shown session is a no-op (no re-assembly)", async () => {
  const view = new DshChatView(makeContext(), makeManager());
  const wv = makeWebviewView();
  view.resolveWebviewView(wv);
  await flush();

  view.loadSession("sess-42");
  await flush();
  assembleCalls.length = 0;
  wv.posted.length = 0;

  view.loadSession("sess-42"); // same session, already assembled
  await flush();

  assert.equal(assembleCalls.length, 0, "re-selecting the shown session must not re-assemble");
  assert.equal(wv.posted.length, 0, "re-selecting the shown session must not flash a loading overlay");
});

test("loadSession switches to a different session with a fresh preset", async () => {
  const view = new DshChatView(makeContext(), makeManager());
  const wv = makeWebviewView();
  view.resolveWebviewView(wv);
  await flush();

  view.loadSession("sess-a");
  await flush();
  assembleCalls.length = 0;

  view.loadSession("sess-b");
  await flush();

  assert.equal(assembleCalls.length, 1, "switching sessions must re-assemble");
  assert.equal(assembleCalls[0].sessionPreset, JSON.stringify({ sessionId: "sess-b" }));
});

test("loadSession can retry the same target after assembly fails", async () => {
  const view = new DshChatView(makeContext(), makeManager());
  const wv = makeWebviewView();
  view.resolveWebviewView(wv);
  await flush();

  nextAssemblyError = new Error("transient");
  view.loadSession("sess-b");
  await flush();
  assembleCalls.length = 0;

  view.loadSession("sess-b");
  await flush();
  assert.equal(assembleCalls.length, 1, "failed target must remain retryable");
  assert.equal(assembleCalls[0].sessionPreset, JSON.stringify({ sessionId: "sess-b" }));
});
