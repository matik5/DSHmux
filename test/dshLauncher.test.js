// T7 (04-install): the launcher's doctor-gated auto-start + doctor message
// round-trip. Contract (plan T7): a missing report (dsh-missing /
// node-missing / source-prerequisites-missing) must NEVER spawn the server;
// a ready report auto-starts exactly as before; dsh-unrunnable attempts the
// start (the manager produces the precise error). "Check again" re-runs the
// bounded doctor and re-pushes the doctor message without a webview reload.
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const Module = require("node:module");

// --- Mock the virtual `vscode` module (only exists in the extension host). ---
const openedExternal = [];
const fakeVscode = {
  Uri: {
    file: (p) => ({ fsPath: p, toString: () => "file://" + p }),
    parse: (s) => ({ toString: () => s, fsPath: s }),
  },
  env: {
    language: "en",
    remoteName: undefined,
    openExternal: async (u) => {
      openedExternal.push(u.toString());
    },
  },
  workspace: { workspaceFolders: [{ uri: { fsPath: "/tmp/fake-ws" } }] },
};
const originalLoad = Module._load;
Module._load = function (request, _parent, _isMain) {
  if (request === "vscode") return fakeVscode;
  return originalLoad.apply(this, arguments);
};

// --- Stub the install-service doctor hook (scripted reports, no real spawns). ---
let currentReport = undefined;
let doctorCalls = 0;
const installServicePath = require.resolve("../out/installService.js");
require.cache[installServicePath] = {
  id: installServicePath,
  filename: installServicePath,
  loaded: true,
  exports: {
    runDoctorForLauncher: () => {
      doctorCalls += 1;
      if (currentReport === undefined) throw new Error("no scripted doctor report");
      return currentReport;
    },
    doctorWarningTexts: (report) => report.warnings.map((w) => `warn:${w}`),
  },
};

// --- Stub the version-check service (no registry lookups in tests). ---
const vcsPath = require.resolve("../out/versionCheckService.js");
require.cache[vcsPath] = {
  id: vcsPath,
  filename: vcsPath,
  loaded: true,
  exports: { upgradeInfo: () => null },
};

const { DshLauncherView } = require("../out/launcherView.js");

// --- Fixtures -----------------------------------------------------------------

function makeReport(state, overrides = {}) {
  return {
    host: { platform: "darwin", arch: "arm64", label: "local" },
    node: { available: true, path: "/usr/local/bin/node", version: "v24.0.0", runnable: true },
    npm: { available: true, version: "11.0.0" },
    npx: { available: true, version: "11.0.0" },
    git: { available: true, version: "2.45.0" },
    pnpm: { available: true, version: "10.0.0" },
    dsh: {
      configuredPath: undefined,
      configuredValid: false,
      resolvedPath: "/usr/local/bin/dsh",
      tried: ["/usr/local/bin/dsh"],
      version: "0.1.2-rc.1",
      compatibility: "tested",
      installType: "npm-global",
    },
    state,
    warnings: [],
    ...overrides,
  };
}

const MISSING_DSH = {
  configuredPath: undefined,
  configuredValid: false,
  resolvedPath: null,
  tried: ["/usr/local/bin/dsh"],
  version: null,
  compatibility: "unknown",
  installType: "none",
};

function makeManager(state = "stopped") {
  const startCalls = [];
  return {
    state,
    serverUrl: null,
    dshVersion: null,
    dshBinPath: null,
    isRunning: false,
    startCalls,
    on: () => ({ dispose() {} }),
    start: async ({ cwd }) => {
      startCalls.push(cwd);
      return "http://127.0.0.1:12345";
    },
    stop: () => {},
    listWorkspaceSessions: async () => ({ items: [], archivedItems: [] }),
  };
}

function makeView() {
  const posted = [];
  const handlers = [];
  const webview = {
    options: {},
    html: "",
    postMessage: (m) => {
      posted.push(m);
      return Promise.resolve();
    },
    onDidReceiveMessage: (cb) => {
      handlers.push(cb);
      return { dispose() {} };
    },
  };
  const view = { webview, onDidDispose: () => ({ dispose() {} }) };
  return { view, posted, handlers };
}

const CTX = { extension: { packageJSON: { version: "0.4.4" } } };
const SESSION_HANDLERS = {
  newSession: () => {},
  openSession: () => {},
  renameSession: async () => {},
  archiveSession: () => {},
};

function resolveWith(report, manager = makeManager(), doctorActions) {
  currentReport = report;
  const launch = new DshLauncherView(CTX, manager, () => {}, SESSION_HANDLERS, () => {}, doctorActions);
  const { view, posted, handlers } = makeView();
  launch.resolveWebviewView(view);
  return { launch, manager, view, posted, handlers };
}

// --- Tests ----------------------------------------------------------------------

test("dsh-missing: no spawn, doctor message pushed, setup panel in initial HTML", () => {
  const report = makeReport("dsh-missing", { dsh: { ...MISSING_DSH } });
  const { manager, view, posted } = resolveWith(report);

  assert.deepStrictEqual(manager.startCalls, [], "must not spawn for a missing DSH");
  const doctorMsgs = posted.filter((m) => m.type === "doctor");
  assert.strictEqual(doctorMsgs.length, 1, "exactly one doctor message at view open");
  const d = doctorMsgs[0];
  assert.strictEqual(d.state, "dsh-missing");
  assert.strictEqual(d.hostLabel, "local");
  assert.strictEqual(d.git.available, true);
  assert.strictEqual(d.pnpm.available, true);
  assert.deepStrictEqual(d.warnings, []);

  const html = view.webview.html;
  assert.match(html, /id="setupPanel"[^>]*display:flex/, "setup panel visible in missing state");
  assert.match(html, /DSH is not set up on this machine yet/, "panel carries the setup title");
  assert.match(html, /id="setupPrimary"/, "primary action button present");
  assert.match(html, /id="setupAlternative"/, "alternative action button present");
  assert.match(html, /id="setupCheckAgain"/, "check-again button present");
  assert.match(html, /id="setupSource"/, "GitHub source link row present (R6)");
});

test("node-missing: no spawn, panel shows node summary + node tool link", () => {
  const report = makeReport("node-missing", {
    node: { available: false, path: null, version: null, runnable: false },
    npm: { available: false },
    npx: { available: false },
    git: { available: false },
    pnpm: { available: false },
    dsh: { ...MISSING_DSH, tried: [] },
  });
  const { manager, view, posted } = resolveWith(report);
  assert.deepStrictEqual(manager.startCalls, []);
  const html = view.webview.html;
  assert.match(html, /Node\.js is required to run DSH/, "node summary rendered");
  assert.match(html, /id="setupNode"/, "node tool link rendered");
  assert.doesNotMatch(html, /id="setupGit"/, "git link not rendered when node is missing (unprobed)");
  const d = posted.find((m) => m.type === "doctor");
  assert.strictEqual(d.state, "node-missing");
});

test("source-prerequisites-missing: no spawn, tool links only for the missing tools", () => {
  const report = makeReport("source-prerequisites-missing", {
    pnpm: { available: false },
    dsh: { ...MISSING_DSH },
  });
  const { manager, view } = resolveWith(report);
  assert.deepStrictEqual(manager.startCalls, []);
  const html = view.webview.html;
  assert.doesNotMatch(html, /id="setupGit"/, "git is present — no git link");
  assert.match(html, /id="setupPnpm"/, "pnpm is missing — pnpm link rendered");
});

// Regression (2026-09-05): an unescaped `\n` inside the webview template
// literal emitted a raw newline inside a quoted string in the page script —
// a SyntaxError that silently killed EVERY onclick handler in the panel
// ("clicked, nothing happened"). tsc cannot see inside the template string,
// so pin the emitted script's syntax here.
test("launcher webview script parses (template-literal escape regression)", () => {
  const { view } = resolveWith(makeReport("dsh-missing", { dsh: { ...MISSING_DSH } }));
  const m = view.webview.html.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(m, "webview script present");
  assert.doesNotThrow(
    () => new Function(m[1]), // compiles (parses) only; never executes the body
    "the embedded webview script must parse — a syntax error kills ALL panel handlers"
  );
});

test("ready: auto-start happens (existing behavior preserved), no setup panel", () => {
  const { manager, view, posted } = resolveWith(makeReport("ready"));
  assert.strictEqual(manager.startCalls.length, 1, "ready machine auto-starts");
  assert.strictEqual(manager.startCalls[0], "/tmp/fake-ws", "start uses the workspace root");
  const html = view.webview.html;
  assert.match(html, /id="setupPanel"[^>]*display:none/, "setup panel hidden on ready machines");
  assert.ok(posted.some((m) => m.type === "server-status"), "status still pushed");
  assert.ok(posted.some((m) => m.type === "doctor"), "doctor still pushed (harmless on ready)");
});

test("dsh-unrunnable: start attempted (manager produces the precise error)", () => {
  const report = makeReport("dsh-unrunnable", {
    dsh: {
      configuredPath: undefined,
      configuredValid: false,
      resolvedPath: "/usr/local/bin/dsh",
      tried: ["/usr/local/bin/dsh"],
      version: null,
      compatibility: "unknown",
      installType: "npm-global",
    },
  });
  const { manager, view } = resolveWith(report);
  assert.strictEqual(manager.startCalls.length, 1, "dsh-unrunnable still attempts a start");
  assert.match(view.webview.html, /id="setupPanel"[^>]*display:none/, "no setup panel for dsh-unrunnable");
});

test("already-running server: no duplicate start", () => {
  const manager = makeManager("ready");
  manager.isRunning = true;
  const { posted } = resolveWith(makeReport("ready"), manager);
  assert.deepStrictEqual(manager.startCalls, []);
  assert.ok(posted.some((m) => m.type === "doctor"));
});

test("doctor probe failure: falls back to blind auto-start (previous behavior)", () => {
  currentReport = undefined; // runDoctorForLauncher throws
  const manager = makeManager();
  const launch = new DshLauncherView(CTX, manager, () => {}, SESSION_HANDLERS, () => {});
  const { view } = makeView();
  launch.resolveWebviewView(view);
  assert.strictEqual(manager.startCalls.length, 1, "probe failure = legacy blind start");
  assert.doesNotMatch(view.webview.html, /id="setupPanel"[^>]*display:flex/, "no panel without a report");
});

test("check again: re-runs doctor, pushes doctor + status without reload", async () => {
  const before = doctorCalls;
  const { view, posted, handlers } = resolveWith(makeReport("dsh-missing", { dsh: { ...MISSING_DSH } }));
  assert.strictEqual(doctorCalls, before + 1, "one doctor run at view open");

  handlers[0]({ type: "doctor-check-again" });
  await new Promise((resolve) => setImmediate(resolve)); // let the async handler drain

  assert.strictEqual(doctorCalls, before + 2, "doctor re-ran on check-again");
  const doctorMsgs = posted.filter((m) => m.type === "doctor");
  assert.strictEqual(doctorMsgs.length, 2, "second doctor message pushed");
  const idx = posted.indexOf(doctorMsgs[1]);
  assert.ok(
    posted.slice(idx + 1).some((m) => m.type === "server-status"),
    "status re-pushed after check-again"
  );
  // No reload: the html assigned at view open is unchanged.
  assert.match(view.webview.html, /id="setupPanel"/, "same html document, no reassignment");
});

test("setup-panel actions: each routes to its doctorActions callback", () => {
  const calls = [];
  const actions = {
    checkAgain: () => calls.push("checkAgain"),
    primary: () => calls.push("primary"),
    alternative: () => calls.push("alternative"),
    node: () => calls.push("node"),
    git: () => calls.push("git"),
    pnpm: () => calls.push("pnpm"),
  };
  const { handlers } = resolveWith(makeReport("node-missing"), makeManager(), actions);
  const before = doctorCalls;
  const handler = handlers[0];
  handler({ type: "install-primary" });
  handler({ type: "install-alternative" });
  handler({ type: "install-node" });
  handler({ type: "install-git" });
  handler({ type: "install-pnpm" });
  handler({ type: "doctor-check-again" }); // wired → the full-report action
  assert.deepStrictEqual(
    calls,
    ["primary", "alternative", "node", "git", "pnpm", "checkAgain"],
    "each setup action routes to its callback (check-again too, when wired)"
  );
  assert.strictEqual(doctorCalls, before, "the light re-run is skipped when wired");
});

test("setup-panel GitHub link: install-source opens the tested branch URL externally (R6)", () => {
  const { handlers } = resolveWith(makeReport("dsh-missing", { dsh: { ...MISSING_DSH } }));
  const handler = handlers[0];
  openedExternal.length = 0;
  handler({ type: "install-source" });
  assert.deepStrictEqual(
    openedExternal,
    ["https://github.com/matik5/deepseek-harness/tree/matik/dsh-patches-0.1.2-rc.1"],
    "the exact tested branch page is opened externally"
  );
});

test("setup-panel actions without wiring: inert, no crash", () => {
  const { handlers } = resolveWith(makeReport("node-missing"));
  const handler = handlers[0];
  assert.doesNotThrow(() => {
    handler({ type: "install-primary" });
    handler({ type: "install-alternative" });
    handler({ type: "install-node" });
    handler({ type: "install-git" });
    handler({ type: "install-pnpm" });
  });
});

test("doctor message carries host-localized warnings", () => {
  const report = makeReport("ready", {
    dsh: {
      configuredPath: undefined,
      configuredValid: false,
      resolvedPath: "/usr/local/bin/dsh",
      tried: ["/usr/local/bin/dsh"],
      version: "0.2.0",
      compatibility: "newer",
      installType: "npm-global",
    },
    warnings: ["untested-version:newer", "source-tools-missing"],
  });
  const { posted } = resolveWith(report);
  const d = posted.find((m) => m.type === "doctor");
  assert.deepStrictEqual(
    d.warnings,
    ["warn:untested-version:newer", "warn:source-tools-missing"],
    "warnings arrive pre-localized by the host layer"
  );
});

test("view-ready handshake re-pushes cached doctor + status", () => {
  currentReport = makeReport("dsh-missing", { dsh: { ...MISSING_DSH, tried: [] } });
  const manager = makeManager();
  const launch = new DshLauncherView(CTX, manager, () => {}, SESSION_HANDLERS, () => {});
  const { view, posted, handlers } = makeView();
  launch.resolveWebviewView(view);
  const afterOpen = posted.length;
  handlers[0]({ type: "view-ready" });
  const newMsgs = posted.slice(afterOpen);
  assert.ok(newMsgs.some((m) => m.type === "server-status"), "status re-pushed on handshake");
  assert.ok(newMsgs.some((m) => m.type === "doctor"), "cached doctor re-pushed on handshake");
});
