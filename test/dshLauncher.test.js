"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const executedCommands = [];
const fakeVscode = {
  env: { language: "en", remoteName: undefined },
  commands: {
    executeCommand: async (id, ...args) => {
      executedCommands.push([id, ...args]);
    },
  },
  workspace: { workspaceFolders: [{ uri: { fsPath: "/tmp/fake-ws" } }] },
};
const originalLoad = Module._load;
Module._load = function (request) {
  if (request === "vscode") return fakeVscode;
  return originalLoad.apply(this, arguments);
};

let currentReport;
let doctorCalls = 0;
const installServicePath = require.resolve("../out/installService.js");
require.cache[installServicePath] = {
  id: installServicePath,
  filename: installServicePath,
  loaded: true,
  exports: {
    runDoctorForLauncher: () => {
      doctorCalls++;
      if (!currentReport) throw new Error("no scripted report");
      return currentReport;
    },
  },
};

const versionServicePath = require.resolve("../out/versionCheckService.js");
require.cache[versionServicePath] = {
  id: versionServicePath,
  filename: versionServicePath,
  loaded: true,
  exports: { upgradeInfo: () => null },
};

const { DshLauncherView } = require("../out/launcherView.js");

function report(state) {
  return {
    host: { platform: "win32", arch: "x64", label: "local" },
    node: { available: true, path: "C:\\node.exe", version: "v24.0.0", runnable: true, supported: true },
    npm: { available: true, version: "11.0.0" },
    dsh: {
      configuredPath: undefined,
      configuredValid: false,
      resolvedPath: state === "dsh-missing" ? null : "C:\\dsh.cmd",
      tried: [],
      version: state === "ready" ? "0.1.5-rc.2" : null,
      compatibility: state === "ready" ? "tested" : "unknown",
      installType: state === "ready" ? "managed" : "none",
    },
    state,
    warnings: [],
  };
}

function manager(state = "stopped") {
  const startCalls = [];
  return {
    state,
    serverUrl: undefined,
    dshVersion: undefined,
    dshBinPath: undefined,
    isRunning: state === "ready",
    startCalls,
    on: () => ({ dispose() {} }),
    start: async ({ cwd }) => { startCalls.push(cwd); return "http://127.0.0.1:1234"; },
    stop() {},
    listWorkspaceSessions: async () => ({ items: [], archivedItems: [] }),
  };
}

function view() {
  const posted = [];
  const handlers = [];
  const webview = {
    options: {},
    html: "",
    postMessage: (message) => { posted.push(message); return Promise.resolve(true); },
    onDidReceiveMessage: (handler) => { handlers.push(handler); return { dispose() {} }; },
  };
  return {
    surface: { webview, onDidDispose: () => ({ dispose() {} }) },
    posted,
    handlers,
  };
}

const context = {
  extension: { packageJSON: { version: "0.4.7" } },
  globalStorageUri: { fsPath: "/tmp/dshmux-storage" },
};
const sessions = {
  newSession() {}, openSession() {}, renameSession: async () => {}, archiveSession() {},
};

function resolve(state, suppliedManager = manager()) {
  currentReport = report(state);
  const launcher = new DshLauncherView(context, suppliedManager, () => {}, sessions, () => {});
  const target = view();
  launcher.resolveWebviewView(target.surface);
  return { launcher, suppliedManager, ...target };
}

test("all not-ready Doctor states show one compact Fix button and never auto-start", () => {
  for (const state of ["dsh-missing", "dsh-unrunnable", "node-missing", "node-unsupported", "npm-missing"]) {
    const { suppliedManager, surface, posted } = resolve(state);
    assert.deepEqual(suppliedManager.startCalls, [], state);
    assert.equal((surface.webview.html.match(/id="dependencyFix"/g) ?? []).length, 1, state);
    assert.match(surface.webview.html, /id="dependencyFix"[^>]*display:block/, state);
    assert.doesNotMatch(surface.webview.html, /id="setupPanel"|compatibilityWarning|install-primary/, state);
    assert.deepEqual(posted.find((item) => item.type === "doctor"), { type: "doctor", state });
  }
});

test("ready Doctor state hides Fix and preserves auto-start", () => {
  const stopped = manager();
  const { surface, posted } = resolve("ready", stopped);
  assert.deepEqual(stopped.startCalls, ["/tmp/fake-ws"]);
  assert.match(surface.webview.html, /id="dependencyFix"[^>]*display:none/);
  assert.ok(posted.some((item) => item.type === "server-status"));
});

test("Doctor probe failure retains the previous blind-start fallback", () => {
  currentReport = undefined;
  const m = manager();
  const launcher = new DshLauncherView(context, m, () => {}, sessions, () => {});
  const target = view();
  launcher.resolveWebviewView(target.surface);
  assert.deepEqual(m.startCalls, ["/tmp/fake-ws"]);
  assert.match(target.surface.webview.html, /id="dependencyFix"[^>]*display:none/);
});

test("Fix button and menu item both route through the single open-doctor message", () => {
  const { surface, handlers } = resolve("dsh-missing");
  assert.match(surface.webview.html, /dependencyFix\.onclick = function\(\)\{ vscode\.postMessage\(\{ type: "open-doctor" \}\); \};/);
  const html = surface.webview.html;
  assert.ok(html.indexOf('id="openEditor"') < html.indexOf('id="openSettings"'));
  assert.ok(html.indexOf('id="openSettings"') < html.indexOf('id="openDoctor"'));
  executedCommands.length = 0;
  handlers[0]({ type: "open-doctor" });
  assert.deepEqual(executedCommands, [["dshmux.doctor"]]);
});

test("repeated Doctor messages only toggle a static node and cannot append duplicates", () => {
  const { surface } = resolve("dsh-missing");
  const html = surface.webview.html;
  assert.equal((html.match(/id="dependencyFix"/g) ?? []).length, 1);
  const applyDoctor = html.slice(html.indexOf("function applyDoctor"), html.indexOf("upgradeLatest.onclick"));
  assert.doesNotMatch(applyDoctor, /createElement|appendChild|insertAdjacentElement/);
  assert.match(html, /dependencyFix\.style\.display = missing \? "block" : "none"/);
});

test("view-ready handshake re-pushes Doctor readiness and current status", () => {
  const { posted, handlers } = resolve("dsh-missing");
  const before = posted.length;
  handlers[0]({ type: "view-ready" });
  const fresh = posted.slice(before);
  assert.ok(fresh.some((item) => item.type === "doctor" && item.state === "dsh-missing"));
  assert.ok(fresh.some((item) => item.type === "server-status"));
});

test("launcher webview script parses", () => {
  const { surface } = resolve("dsh-missing");
  const script = surface.webview.html.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script[1]));
});
