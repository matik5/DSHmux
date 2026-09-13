"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const executedCommands = [];
const configurationValues = {};
const fakeVscode = {
  Uri: {
    file: (value) => ({ fsPath: value, toString: () => "file://" + value }),
    parse: (value) => ({ toString: () => value }),
  },
  ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3 },
  env: {
    language: "en",
    appRoot: "/mock/code-app",
    remoteName: undefined,
    clipboard: { writeText: async () => undefined, readText: async () => "" },
  },
  commands: {
    executeCommand: async (...args) => { executedCommands.push(args); },
  },
  window: {
    activeColorTheme: { kind: 2 },
    onDidChangeActiveColorTheme: () => ({ dispose() {} }),
    showWarningMessage: async () => undefined,
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: "/workspace" } }],
    getConfiguration: (namespace) => ({
      inspect: (key) => configurationValues[`${namespace}.${key}`] === undefined
        ? undefined
        : { globalValue: configurationValues[`${namespace}.${key}`] },
      get: (key, fallback) => configurationValues[`${namespace}.${key}`] ?? fallback,
    }),
    onDidChangeConfiguration: () => ({ dispose() {} }),
  },
};

const originalLoad = Module._load;
Module._load = function (request, _parent, _isMain) {
  if (request === "vscode") return fakeVscode;
  return originalLoad.apply(this, arguments);
};

const assembleCalls = [];
let nextAssemblyError;
const daPath = require.resolve("../out/documentAssembly.js");
const installPath = require.resolve("../out/installService.js");
const localDictationPath = require.resolve("../out/localDictation.js");
const versionServicePath = require.resolve("../out/versionCheckService.js");
const originalCache = new Map(
  [daPath, installPath, localDictationPath, versionServicePath].map((key) => [key, require.cache[key]])
);

let doctorState = "ready";
let doctorThrows = false;
let upgradeCalls = [];
let availableUpgrade;
let dictationPreflightCalls = [];
let dictationControllers = [];

class FakeLocalDictationError extends Error {
  constructor(code) { super(code); this.code = code; }
}

class FakeLocalDictationController {
  constructor(options) {
    this.options = options;
    this.currentState = "idle";
    this.startCalls = [];
    this.stopCalls = 0;
    this.cancelCalls = 0;
    this.disposed = false;
    dictationControllers.push(this);
  }

  async start(options) {
    this.startCalls.push(options);
    this.currentState = "preparing";
    this.options.onEvent({ type: "state", generation: 1, state: "preparing" });
    this.currentState = "listening";
    this.options.onEvent({ type: "state", generation: 1, state: "listening" });
  }

  async stop() {
    this.stopCalls += 1;
    this.currentState = "stopping";
    this.options.onEvent({ type: "state", generation: 1, state: "stopping" });
  }

  async cancel() {
    this.cancelCalls += 1;
    this.currentState = "idle";
    this.options.onEvent({ type: "state", generation: null, state: "idle" });
  }

  dispose() { this.disposed = true; }

  emit(event) { this.options.onEvent(event); }
}

require.cache[daPath] = {
  id: daPath,
  filename: daPath,
  loaded: true,
  exports: {
    assembleDocument: async (options) => {
      assembleCalls.push(options);
      if (nextAssemblyError) {
        const error = nextAssemblyError;
        nextAssemblyError = undefined;
        throw error;
      }
      return { html: "<html>fake</html>", distRev: "r1", downloaded: false };
    },
  },
};
require.cache[installPath] = {
  id: installPath,
  filename: installPath,
  loaded: true,
  exports: {
    runDoctorForLauncher: () => {
      if (doctorThrows) throw new Error("probe failed");
      return { state: doctorState };
    },
  },
};
require.cache[localDictationPath] = {
  id: localDictationPath,
  filename: localDictationPath,
  loaded: true,
  exports: {
    LocalDictationController: FakeLocalDictationController,
    LocalDictationError: FakeLocalDictationError,
    supportsLocalDictationTarget: () => true,
    preflightLocalDictation: async (environment, settings) => {
      dictationPreflightCalls.push({ environment, settings });
      return {
        platformKey: "darwin-arm64",
        language: settings.language,
        ffmpegPath: "/ffmpeg",
        ffmpegArgs: [],
        modelCacheDir: "/models",
        modelDirectory: "/models/model",
        runtimeDir: "/runtime",
        sdkEntry: "/sdk/index.js",
      };
    },
  },
};
require.cache[versionServicePath] = {
  id: versionServicePath,
  filename: versionServicePath,
  loaded: true,
  exports: {
    upgradeInfo: () => availableUpgrade,
    showUpgradeOptions: async (_context, _version, _path, channel) => {
      upgradeCalls.push(channel);
    },
  },
};

const { DshChatView } = require("../out/dshChatView.js");

test.after(() => {
  Module._load = originalLoad;
  for (const [key, value] of originalCache) {
    if (value) require.cache[key] = value;
    else delete require.cache[key];
  }
});

test.beforeEach(() => {
  assembleCalls.length = 0;
  executedCommands.length = 0;
  upgradeCalls = [];
  nextAssemblyError = undefined;
  doctorState = "ready";
  doctorThrows = false;
  availableUpgrade = undefined;
  dictationPreflightCalls = [];
  dictationControllers = [];
  for (const key of Object.keys(configurationValues)) delete configurationValues[key];
  fakeVscode.env.remoteName = undefined;
});

function makeWorkspaceState(initial = {}, updateError) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    get(key) { return values.get(key); },
    async update(key, value) {
      if (updateError) throw updateError;
      values.set(key, value);
    },
  };
}

function makeContext(workspaceState = makeWorkspaceState()) {
  return {
    globalStorageUri: { fsPath: "/tmp/dsh-global" },
    extensionUri: { fsPath: path.resolve(__dirname, "..") },
    extension: { packageJSON: { version: "0.4.8" } },
    workspaceState,
    subscriptions: [],
  };
}

function makeSession(sessionId, updatedAt, options = {}) {
  return {
    sessionId,
    updatedAt,
    running: false,
    blank: options.blank === true,
    cwd: options.cwd ?? "/workspace",
    title: options.title ?? null,
  };
}

function makeManager(overrides = {}) {
  const listeners = {};
  const manager = {
    state: overrides.state ?? "ready",
    serverUrl: overrides.serverUrl ?? "http://127.0.0.1:1",
    dshVersion: overrides.dshVersion ?? "0.1.5-rc.2",
    dshBinPath: "/usr/local/bin/dsh",
    authCookie: "dsh_session=test",
    startCalls: 0,
    stopCalls: 0,
    listCalls: 0,
    workspaceIdCalls: 0,
    createCalls: 0,
    renameCalls: [],
    archiveCalls: [],
    searchCalls: [],
    get isRunning() { return this.state === "ready"; },
    on(event, callback) {
      (listeners[event] ||= []).push(callback);
      return this;
    },
    emitState(state, extra = {}) {
      this.state = state;
      if (state === "ready" && extra.url) this.serverUrl = extra.url;
      for (const callback of listeners.state ?? []) {
        callback({ state, url: this.serverUrl, version: this.dshVersion, ...extra });
      }
    },
    async start() { this.startCalls += 1; return this.serverUrl; },
    stop() { this.stopCalls += 1; },
    async listWorkspaceSessions() {
      this.listCalls += 1;
      return overrides.sessions ?? { items: [], archivedItems: [] };
    },
    async workspaceIdFor() { this.workspaceIdCalls += 1; return "ws-1"; },
    async createSession() { this.createCalls += 1; return "created-1"; },
    async renameSession(sessionId, title) {
      this.renameCalls.push([sessionId, title]);
      return { title, seq: 1 };
    },
    async archiveSession(sessionId) {
      this.archiveCalls.push(sessionId);
      return [sessionId];
    },
    async searchSessions(query) {
      this.searchCalls.push(query);
      return overrides.searchResult ?? { items: [], hasMore: false };
    },
    ...overrides.methods,
  };
  return manager;
}

function makeWebviewView() {
  const posted = [];
  const messageHandlers = [];
  let visibilityHandler;
  let disposeHandler;
  const view = {
    visible: true,
    posted,
    webview: {
      options: {},
      cspSource: "vscode-resource:mock",
      html: "",
      postMessage(message) { posted.push(message); return Promise.resolve(true); },
      onDidReceiveMessage(callback) {
        messageHandlers.push(callback);
        return { dispose() {} };
      },
      asWebviewUri(uri) {
        return { toString: () => "vscode-webview://mock/" + uri.fsPath };
      },
    },
    onDidChangeVisibility(callback) { visibilityHandler = callback; return { dispose() {} }; },
    onDidDispose(callback) { disposeHandler = callback; return { dispose() {} }; },
    emitMessage(message) { for (const handler of messageHandlers) handler(message); },
    setVisible(visible) { this.visible = visible; visibilityHandler?.(); },
    dispose() { disposeHandler?.(); },
  };
  return view;
}

async function flush(rounds = 2) {
  for (let index = 0; index < rounds; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function lastPosted(view, type) {
  return [...view.posted].reverse().find((message) => message.type === type);
}

test("loadSession reassembles with preset and compact loading chrome", async () => {
  const controller = new DshChatView(makeContext(), makeManager());
  const view = makeWebviewView();
  controller.resolveWebviewView(view);
  await flush();
  assembleCalls.length = 0;
  view.posted.length = 0;

  controller.loadSession("sess-42");
  assert.deepEqual(view.posted[0], { type: "session-loading", loading: true });
  await flush();

  assert.equal(assembleCalls.length, 1);
  assert.equal(assembleCalls[0].sessionPreset, JSON.stringify({ sessionId: "sess-42" }));
  assert.equal(assembleCalls[0].frameFontScale, 0.9);
  assert.match(assembleCalls[0].chromeHtml, /id="dshmux-chat-header"/);
  assert.match(assembleCalls[0].chromeHtml, /role="dialog"/);
  assert.match(assembleCalls[0].chromeHtml, /"initialSessionLoading":true/);
});

test("maps localhost and keeps the same shown session as a no-op", async () => {
  const controller = new DshChatView(makeContext(), makeManager());
  const view = makeWebviewView();
  controller.resolveWebviewView(view);
  await flush();
  assert.deepEqual(view.webview.options.portMapping, [{ webviewPort: 1, extensionHostPort: 1 }]);

  controller.loadSession("sess-42");
  await flush();
  assembleCalls.length = 0;
  view.posted.length = 0;
  controller.loadSession("sess-42");
  await flush();
  assert.equal(assembleCalls.length, 0);
  assert.equal(view.posted.length, 0);
});

test("latest refresh wins and a failed target remains retryable", async () => {
  const controller = new DshChatView(makeContext(), makeManager());
  const view = makeWebviewView();
  controller.resolveWebviewView(view);
  await flush();
  nextAssemblyError = new Error("transient");
  controller.loadSession("sess-a");
  await flush();
  assembleCalls.length = 0;
  controller.loadSession("sess-a");
  await flush();
  assert.equal(assembleCalls.length, 1);
  assert.equal(assembleCalls[0].sessionPreset, JSON.stringify({ sessionId: "sess-a" }));

  controller.loadSession("sess-b");
  controller.loadSession("sess-c");
  await flush();
  assert.equal(controller.shownSessionId, "sess-c");
  assert.equal(view.webview.html, "<html>fake</html>");
});

test("Doctor gates auto-start and chrome-ready replays current state", async () => {
  const readyManager = makeManager({ state: "stopped", serverUrl: undefined });
  const readyController = new DshChatView(makeContext(), readyManager);
  const readyView = makeWebviewView();
  readyController.resolveWebviewView(readyView);
  assert.equal(readyManager.startCalls, 1);
  readyView.posted.length = 0;
  readyView.emitMessage({ type: "chrome-ready" });
  await flush();
  assert.equal(lastPosted(readyView, "server-status").state, "stopped");

  doctorState = "dsh-missing";
  const blockedManager = makeManager({ state: "stopped", serverUrl: undefined });
  const blockedController = new DshChatView(makeContext(), blockedManager);
  blockedController.resolveWebviewView(makeWebviewView());
  assert.equal(blockedManager.startCalls, 0);
});

test("session snapshot is workspace-scoped, recency-sorted, and title-mapped", async () => {
  const manager = makeManager({
    sessions: {
      items: [
        makeSession("older", 10, { title: null, cwd: "/workspace/older-dir" }),
        makeSession("newer", 30, { title: "Durable title" }),
        makeSession("blank", 20, { blank: true }),
      ],
      archivedItems: [makeSession("archived", 40, { title: "Old work" })],
    },
  });
  const controller = new DshChatView(makeContext(), manager);
  const view = makeWebviewView();
  controller.resolveWebviewView(view);
  await flush();
  controller.loadSession("newer");
  await flush();
  view.emitMessage({ type: "chrome-ready" });
  await flush();

  const snapshot = lastPosted(view, "sessions-snapshot");
  assert.deepEqual(snapshot.items.map((item) => item.sessionId), ["newer", "blank", "older"]);
  assert.deepEqual(snapshot.items.map((item) => item.title), ["Durable title", "New Session", "older-dir"]);
  assert.equal(snapshot.archivedItems[0].archived, true);
  assert.equal(snapshot.currentSessionId, "newer");
});

test("new-session pending guard prevents duplicates and selects exactly one result", async () => {
  let release;
  const created = new Promise((resolve) => { release = resolve; });
  const manager = makeManager({ methods: {
    async createSession() { this.createCalls += 1; return created; },
  } });
  const controller = new DshChatView(makeContext(), manager);
  const view = makeWebviewView();
  controller.resolveWebviewView(view);
  await flush();
  view.emitMessage({ type: "new-session" });
  view.emitMessage({ type: "new-session" });
  await flush();
  assert.equal(manager.createCalls, 1);
  assert.equal(lastPosted(view, "session-operation").state, "pending");
  assembleCalls.length = 0;
  release("created-once");
  await flush(4);
  assert.equal(controller.shownSessionId, "created-once");
  assert.equal(manager.workspaceIdCalls, 1);
  assert.equal(assembleCalls.length, 1);
  assert.equal(assembleCalls[0].sessionPreset, JSON.stringify({ sessionId: "created-once" }));
  assert.deepEqual(lastPosted(view, "session-loading"), {
    type: "session-loading",
    loading: true,
  });
});

test("new-session failure preserves the current chat and reports a localized operation", async () => {
  const manager = makeManager({ methods: {
    async createSession() { this.createCalls += 1; throw new Error("offline"); },
  } });
  const controller = new DshChatView(makeContext(), manager);
  const view = makeWebviewView();
  controller.resolveWebviewView(view);
  await flush();
  controller.loadSession("keep-me");
  await flush();
  view.emitMessage({ type: "new-session" });
  await flush();
  assert.equal(controller.shownSessionId, "keep-me");
  assert.equal(lastPosted(view, "session-operation").state, "error");
  assert.equal(lastPosted(view, "session-operation").message, "offline");
});

test("rename and archive use manager APIs and notify editor-panel hooks", async () => {
  const renamed = [];
  const archived = [];
  const sessionData = {
    items: [makeSession("s1", 1, { title: "Before" })],
    archivedItems: [],
  };
  const manager = makeManager({
    sessions: sessionData,
    methods: {
      async renameSession(sessionId, title) {
        this.renameCalls.push([sessionId, title]);
        sessionData.items[0].title = title;
        return { title, seq: 1 };
      },
      async archiveSession(sessionId) {
        this.archiveCalls.push(sessionId);
        sessionData.archivedItems.push({ ...sessionData.items.shift(), archived: true });
        return [sessionId];
      },
    },
  });
  const controller = new DshChatView(makeContext(), manager, {
    onSessionRenamed: (...args) => renamed.push(args),
    onSessionArchived: (id) => archived.push(id),
  });
  const view = makeWebviewView();
  controller.resolveWebviewView(view);
  await flush();
  controller.loadSession("s1");
  await flush();
  view.emitMessage({ type: "rename-session", sessionId: "s1", title: "After" });
  await flush();
  assert.deepEqual(manager.renameCalls, [["s1", "After"]]);
  assert.deepEqual(renamed, [["s1", "After"]]);
  assert.equal(lastPosted(view, "sessions-snapshot").items[0].title, "After");

  view.emitMessage({ type: "archive-session", sessionId: "s1" });
  await flush();
  assert.deepEqual(manager.archiveCalls, ["s1"]);
  assert.deepEqual(archived, ["s1"]);
  assert.equal(lastPosted(view, "sessions-snapshot").items.length, 0);
});

test("an in-flight poll cannot overwrite a successful rename", async () => {
  const sessionData = {
    items: [makeSession("s1", 1, { title: "Before" })],
    archivedItems: [],
  };
  let releasePoll;
  let deferPoll = false;
  const manager = makeManager({
    sessions: sessionData,
    methods: {
      async listWorkspaceSessions() {
        this.listCalls += 1;
        if (!deferPoll) return sessionData;
        return new Promise((resolve) => { releasePoll = resolve; });
      },
    },
  });
  const controller = new DshChatView(makeContext(), manager);
  const view = makeWebviewView();
  controller.resolveWebviewView(view);
  await flush();

  deferPoll = true;
  view.emitMessage({ type: "refresh-sessions" });
  await flush();
  view.emitMessage({ type: "rename-session", sessionId: "s1", title: "After" });
  await flush();
  assert.equal(lastPosted(view, "sessions-snapshot").items[0].title, "After");

  releasePoll(sessionData);
  await flush();
  assert.equal(lastPosted(view, "sessions-snapshot").items[0].title, "After");
});

test("pins persist per workspace, preserve order, and prune stale session ids", async () => {
  const state = makeWorkspaceState({
    "dshmux.pinnedSessionIds": ["stale", "s1", "archived", "s1", 42],
  });
  const sessions = {
    items: [makeSession("s1", 2, { title: "One" }), makeSession("s2", 1, { title: "Two" })],
    archivedItems: [makeSession("archived", 3, { title: "Old" })],
  };
  const controller = new DshChatView(makeContext(state), makeManager({ sessions }));
  const view = makeWebviewView();
  controller.resolveWebviewView(view);
  await flush();

  assert.deepEqual(lastPosted(view, "sessions-snapshot").pinnedSessionIds, ["s1", "archived"]);
  assert.deepEqual(state.get("dshmux.pinnedSessionIds"), ["s1", "archived"]);

  view.emitMessage({ type: "toggle-pin", sessionId: "s2" });
  await flush();
  assert.deepEqual(lastPosted(view, "sessions-snapshot").pinnedSessionIds, ["s2", "s1", "archived"]);

  view.emitMessage({ type: "toggle-pin", sessionId: "s1" });
  await flush();
  assert.deepEqual(state.get("dshmux.pinnedSessionIds"), ["s2", "archived"]);

  const restored = new DshChatView(makeContext(state), makeManager({ sessions }));
  const restoredView = makeWebviewView();
  restored.resolveWebviewView(restoredView);
  await flush();
  assert.deepEqual(lastPosted(restoredView, "sessions-snapshot").pinnedSessionIds, ["s2", "archived"]);
  view.dispose();
  restoredView.dispose();
});

test("failed pin persistence keeps the previous pins and reports an error", async () => {
  const state = makeWorkspaceState({}, new Error("storage unavailable"));
  const manager = makeManager({ sessions: {
    items: [makeSession("s1", 1, { title: "One" })],
    archivedItems: [],
  } });
  const controller = new DshChatView(makeContext(state), manager);
  const view = makeWebviewView();
  controller.resolveWebviewView(view);
  await flush();
  view.emitMessage({ type: "toggle-pin", sessionId: "s1" });
  await flush();
  assert.equal(lastPosted(view, "session-operation").state, "error");
  assert.match(lastPosted(view, "session-operation").message, /storage unavailable/);
  assert.deepEqual(lastPosted(view, "sessions-snapshot").pinnedSessionIds, []);
});

test("full-text search maps known workspace sessions and drops duplicates and foreign ids", async () => {
  const manager = makeManager({
    sessions: {
      items: [makeSession("s1", 2, { title: "Active title" })],
      archivedItems: [makeSession("a1", 1, { title: "Archived title" })],
    },
    searchResult: {
      items: [
        { sessionId: "foreign", snippet: "must not leak" },
        { sessionId: "s1", snippet: "first match" },
        { sessionId: "s1", snippet: "duplicate" },
        { sessionId: "a1", snippet: "archived match" },
      ],
      hasMore: true,
    },
  });
  const controller = new DshChatView(makeContext(), manager);
  const view = makeWebviewView();
  controller.resolveWebviewView(view);
  await flush();
  view.emitMessage({ type: "search-sessions", requestId: 7, query: " needle " });
  await flush();

  assert.deepEqual(manager.searchCalls, ["needle"]);
  const result = lastPosted(view, "session-search-result");
  assert.equal(result.requestId, 7);
  assert.equal(result.hasMore, true);
  assert.deepEqual(result.items.map((item) => item.sessionId), ["s1", "a1"]);
  assert.equal(result.items[0].snippet, "first match");
  assert.equal(result.items[1].archived, true);
});

test("full-text search errors are request-local and invalid requests are ignored", async () => {
  const manager = makeManager({ methods: {
    async searchSessions(query) {
      this.searchCalls.push(query);
      throw new Error("search unavailable");
    },
  } });
  const controller = new DshChatView(makeContext(), manager);
  const view = makeWebviewView();
  controller.resolveWebviewView(view);
  await flush();
  view.emitMessage({ type: "search-sessions", requestId: -1, query: "x" });
  view.emitMessage({ type: "search-sessions", requestId: 8, query: "x" });
  await flush();
  assert.deepEqual(manager.searchCalls, ["x"]);
  assert.deepEqual(lastPosted(view, "session-search-result"), {
    type: "session-search-result",
    requestId: 8,
    items: [],
    hasMore: false,
    error: "search unavailable",
  });
});

test("a search started by an old webview document cannot post into a reloaded session", async () => {
  let releaseSearch;
  const pendingSearch = new Promise((resolve) => { releaseSearch = resolve; });
  const manager = makeManager({
    sessions: { items: [makeSession("s1", 1, { title: "One" })], archivedItems: [] },
    methods: {
      async searchSessions() { return pendingSearch; },
    },
  });
  const controller = new DshChatView(makeContext(), manager);
  const view = makeWebviewView();
  controller.resolveWebviewView(view);
  await flush();
  view.posted.length = 0;
  view.emitMessage({ type: "search-sessions", requestId: 1, query: "needle" });
  await flush();
  controller.loadSession("s1");
  await flush();
  releaseSearch({ items: [{ sessionId: "s1", snippet: "old result" }], hasMore: false });
  await flush();
  assert.equal(lastPosted(view, "session-search-result"), undefined);
});

test("invalid messages are ignored and approved overflow routes stay discoverable", async () => {
  const manager = makeManager();
  const controller = new DshChatView(makeContext(), manager);
  const view = makeWebviewView();
  controller.resolveWebviewView(view);
  await flush();
  view.emitMessage({ type: "open-session", sessionId: 42 });
  view.emitMessage({ type: "rename-session", sessionId: "s", title: "   " });
  view.emitMessage({ type: "upgrade", channel: "nightly" });
  await flush();
  assert.equal(manager.renameCalls.length, 0);
  assert.equal(upgradeCalls.length, 0);

  view.emitMessage({ type: "open-in-editor" });
  view.emitMessage({ type: "open-settings" });
  view.emitMessage({ type: "open-doctor" });
  view.emitMessage({ type: "show-status" });
  view.emitMessage({ type: "upgrade", channel: "next" });
  await flush();
  assert.deepEqual(executedCommands, [
    ["dshmux.openPanel"],
    ["workbench.action.openSettings", "@ext:matik5.dshmux"],
    ["dshmux.doctor"],
  ]);
  assert.deepEqual(upgradeCalls, ["next"]);
  assert.deepEqual(lastPosted(view, "status-detail"), {
    type: "status-detail",
    state: "ready",
    extensionVersion: "0.4.8",
    dshVersion: "0.1.5-rc.2",
  });
});

test("failed rename and archive do not notify editor panels", async () => {
  const renamed = [];
  const archived = [];
  const manager = makeManager({ methods: {
    async renameSession() { throw new Error("rename failed"); },
    async archiveSession() { throw new Error("archive failed"); },
  } });
  const controller = new DshChatView(makeContext(), manager, {
    onSessionRenamed: (...args) => renamed.push(args),
    onSessionArchived: (id) => archived.push(id),
  });
  const view = makeWebviewView();
  controller.resolveWebviewView(view);
  await flush();
  view.emitMessage({ type: "rename-session", sessionId: "s1", title: "After" });
  view.emitMessage({ type: "archive-session", sessionId: "s1" });
  await flush();
  assert.deepEqual(renamed, []);
  assert.deepEqual(archived, []);
  assert.equal(lastPosted(view, "session-operation").state, "error");
});

test("upstream selection updates host state without reassembling", async () => {
  const manager = makeManager({ sessions: {
    items: [makeSession("s1", 2, { title: "One" }), makeSession("s2", 1, { title: "Two" })],
    archivedItems: [],
  } });
  const controller = new DshChatView(makeContext(), manager);
  const view = makeWebviewView();
  controller.resolveWebviewView(view);
  await flush();
  assembleCalls.length = 0;
  view.emitMessage({ type: "active-session-changed", sessionId: "s2" });
  await flush();
  assert.equal(controller.shownSessionId, "s2");
  assert.equal(assembleCalls.length, 0);
  assert.equal(lastPosted(view, "sessions-snapshot").currentSessionId, "s2");
});

test("stop to ready marks the document stale and reassembles for the new port", async () => {
  const manager = makeManager();
  const controller = new DshChatView(makeContext(), manager);
  const view = makeWebviewView();
  controller.resolveWebviewView(view);
  await flush();
  assembleCalls.length = 0;
  manager.emitState("stopped");
  manager.emitState("ready", { url: "http://127.0.0.1:9" });
  await flush();
  assert.equal(assembleCalls.length, 1);
  assert.equal(assembleCalls[0].serverBase, "http://127.0.0.1:9");
});

test("visibility changes pause background polling and refresh on reveal", async () => {
  const manager = makeManager();
  const controller = new DshChatView(makeContext(), manager);
  const view = makeWebviewView();
  controller.resolveWebviewView(view);
  await flush();
  const before = manager.listCalls;
  view.setVisible(false);
  view.setVisible(true);
  await flush();
  assert.ok(manager.listCalls > before);
  view.dispose();
});

test("dictation stays hidden and cannot preflight while disabled", async () => {
  const controller = new DshChatView(makeContext(), makeManager());
  const view = makeWebviewView();
  controller.resolveWebviewView(view);
  await flush();
  assert.doesNotMatch(assembleCalls.at(-1).chromeHtml, /<button id="dshmux-dictation-toggle"/);
  view.emitMessage({ type: "dshmux-dictation-start" });
  await flush();
  assert.equal(dictationPreflightCalls.length, 0);
  assert.deepEqual(lastPosted(view, "dshmux-dictation-state"), {
    type: "dshmux-dictation-state",
    generation: null,
    state: "error",
    errorCode: "disabled",
  });
});

test("enabled dictation lazily preflights, routes lifecycle events, and never uses the bridge", async () => {
  configurationValues["dshmux.experimental.localDictation.enabled"] = true;
  configurationValues["dshmux.experimental.localDictation.language"] = "et-EE";
  const controller = new DshChatView(makeContext(), makeManager());
  const view = makeWebviewView();
  controller.resolveWebviewView(view);
  await flush();
  assert.match(assembleCalls.at(-1).chromeHtml, /<button id="dshmux-dictation-toggle"/);

  view.emitMessage({ type: "dshmux-dictation-start" });
  await flush();
  assert.equal(dictationPreflightCalls.length, 1);
  assert.equal(dictationPreflightCalls[0].settings.language, "et-EE");
  assert.equal(dictationControllers.length, 1);
  assert.equal(dictationControllers[0].startCalls.length, 1);
  assert.equal(lastPosted(view, "dshmux-dictation-state").state, "listening");

  dictationControllers[0].emit({
    type: "transcript",
    generation: 1,
    phase: "interim",
    text: "tere",
  });
  assert.deepEqual(lastPosted(view, "dshmux-dictation-transcript"), {
    type: "dshmux-dictation-transcript",
    generation: 1,
    phase: "interim",
    text: "tere",
  });
  view.emitMessage({ type: "dshmux-dictation-stop" });
  await flush();
  assert.equal(dictationControllers[0].stopCalls, 1);
  assert.equal(lastPosted(view, "dshmux-dictation-state").state, "stopping");

  view.emitMessage({ type: "active-session-changed", sessionId: "other" });
  await flush();
  assert.equal(dictationControllers[0].cancelCalls, 1);
  controller.dispose();
  assert.equal(dictationControllers[0].disposed, true);
});

test("remote host and untested DSH version fail closed before native work", async () => {
  configurationValues["dshmux.experimental.localDictation.enabled"] = true;
  fakeVscode.env.remoteName = "ssh-remote";
  const remote = new DshChatView(makeContext(), makeManager());
  const remoteView = makeWebviewView();
  remote.resolveWebviewView(remoteView);
  await flush();
  assert.doesNotMatch(assembleCalls.at(-1).chromeHtml, /<button id="dshmux-dictation-toggle"/);
  remoteView.emitMessage({ type: "dshmux-dictation-start" });
  await flush();
  assert.equal(dictationPreflightCalls.length, 0);

  fakeVscode.env.remoteName = undefined;
  const versioned = new DshChatView(makeContext(), makeManager({ dshVersion: "0.1.5-rc.3" }));
  const versionedView = makeWebviewView();
  versioned.resolveWebviewView(versionedView);
  await flush();
  assert.doesNotMatch(assembleCalls.at(-1).chromeHtml, /<button id="dshmux-dictation-toggle"/);
  versionedView.emitMessage({ type: "dshmux-dictation-start" });
  await flush();
  assert.equal(dictationPreflightCalls.length, 0);
});
