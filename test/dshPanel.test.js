"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

let createdPanel;
const fakeVscode = {
  Uri: { file: (value) => ({ fsPath: value, toString: () => "file://" + value }) },
  ViewColumn: { Active: -1, Beside: -2 },
  ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3 },
  env: { language: "en" },
  window: {
    activeColorTheme: { kind: 2 },
    onDidChangeActiveColorTheme: () => ({ dispose() {} }),
    createWebviewPanel() { return createdPanel; },
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: "/workspace" } }],
    getConfiguration: () => ({ inspect: () => undefined, get: (_key, fallback) => fallback }),
    onDidChangeConfiguration: () => ({ dispose() {} }),
  },
};

const originalLoad = Module._load;
Module._load = function (request) {
  if (request === "vscode") return fakeVscode;
  return originalLoad.apply(this, arguments);
};

const assemblyCalls = [];
const daPath = require.resolve("../out/documentAssembly.js");
const originalAssembly = require.cache[daPath];
require.cache[daPath] = {
  id: daPath,
  filename: daPath,
  loaded: true,
  exports: {
    assembleDocument: async (options) => {
      assemblyCalls.push(options);
      return { html: `<html data-url="${options.serverBase}"></html>` };
    },
  },
};

const { DshPanel } = require("../out/dshPanel.js");

test.after(() => {
  Module._load = originalLoad;
  if (originalAssembly) require.cache[daPath] = originalAssembly;
  else delete require.cache[daPath];
});

function makePanel() {
  let disposeHandler;
  return {
    title: "",
    reveal() {},
    dispose() { disposeHandler?.(); },
    onDidDispose(handler) { disposeHandler = handler; return { dispose() {} }; },
    webview: {
      html: "",
      options: {},
      cspSource: "vscode-resource:mock",
      postMessage: async () => true,
      onDidReceiveMessage: () => ({ dispose() {} }),
      asWebviewUri: (uri) => ({ toString: () => "vscode-webview://mock/" + uri.fsPath }),
    },
  };
}

function makeManager() {
  const listeners = [];
  return {
    state: "ready",
    serverUrl: "http://127.0.0.1:1",
    authCookie: "dsh_session=test",
    on(event, callback) { if (event === "state") listeners.push(callback); return this; },
    emit(state, url) {
      this.state = state;
      if (url) this.serverUrl = url;
      for (const callback of listeners) callback({ state, url: this.serverUrl });
    },
    async start() {},
    stop() {},
  };
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

test("open editor panel reassembles after stop to ready on a new port", async () => {
  assemblyCalls.length = 0;
  createdPanel = makePanel();
  const manager = makeManager();
  const context = {
    globalStorageUri: { fsPath: "/tmp/dsh-global" },
    extensionUri: { fsPath: path.resolve(__dirname, "..") },
    subscriptions: [],
  };
  const panel = new DshPanel(context, manager, "session-1");
  panel.open('{"sessionId":"session-1"}');
  await flush();
  assert.equal(assemblyCalls.length, 1);
  assert.equal(assemblyCalls[0].serverBase, "http://127.0.0.1:1");

  manager.emit("stopped");
  manager.emit("ready", "http://127.0.0.1:9");
  await flush();
  assert.equal(assemblyCalls.length, 2);
  assert.equal(assemblyCalls[1].serverBase, "http://127.0.0.1:9");
  assert.deepEqual(createdPanel.webview.options.portMapping, [
    { webviewPort: 9, extensionHostPort: 9 },
  ]);
  assert.match(createdPanel.webview.html, /data-url="http:\/\/127\.0\.0\.1:9"/);
});
