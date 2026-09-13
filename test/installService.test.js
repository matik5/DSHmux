"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const { EventEmitter } = require("node:events");

let modalAnswer;
let messages;
let errors;
let opened;
let outputChannels;
let progressCalls;
let quickPickAnswers;
let quickPickCalls;

function reset() {
  modalAnswer = undefined;
  messages = [];
  errors = [];
  opened = [];
  outputChannels = [];
  progressCalls = [];
  quickPickAnswers = [];
  quickPickCalls = 0;
}

const token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) };
const fakeVscode = {
  Uri: { parse: (value) => ({ toString: () => value, fsPath: value }) },
  ProgressLocation: { Notification: 15 },
  env: {
    language: "en",
    remoteName: undefined,
    openExternal: async (uri) => opened.push(uri.toString()),
  },
  workspace: {
    getConfiguration: () => ({
      inspect: () => undefined,
      get: (_key, fallback) => fallback,
    }),
  },
  window: {
    showInformationMessage: async (message, options) => {
      messages.push(message);
      return options && options.modal ? modalAnswer : undefined;
    },
    showErrorMessage: async (message) => { errors.push(message); return undefined; },
    showQuickPick: async () => {
      quickPickCalls++;
      return quickPickAnswers.shift();
    },
    createOutputChannel: (name) => {
      const channel = {
        name, text: "", clearCalls: 0, showCalls: 0,
        clear() { this.text = ""; this.clearCalls++; },
        show() { this.showCalls++; },
        append(value) { this.text += value; },
        dispose() {},
      };
      outputChannels.push(channel);
      return channel;
    },
    withProgress: async (options, task) => {
      progressCalls.push(options);
      return task({ report() {} }, token);
    },
  },
};

const originalLoad = Module._load;
Module._load = function (request) {
  if (request === "vscode") return fakeVscode;
  return originalLoad.apply(this, arguments);
};

function fresh() {
  reset();
  const path = require.resolve("../out/installService.js");
  delete require.cache[path];
  return require(path);
}

const context = {
  globalStorageUri: { fsPath: "C:\\Users\\me\\Code Storage" },
};

function runtime(overrides = {}) {
  const calls = { mkdir: [], run: [], validate: [] };
  return {
    calls,
    value: {
      mkdir: async (dir) => calls.mkdir.push(dir),
      run: async (spec, _token, onOutput) => {
        calls.run.push(spec);
        onOutput("installed\n");
        return { ok: true, cancelled: false, exitCode: 0 };
      },
      validate: (spec) => {
        calls.validate.push(spec);
        return { valid: true, version: "0.1.5-rc.2" };
      },
      ...overrides,
    },
  };
}

test("managed install cancellation at confirmation makes no changes", async () => {
  const svc = fresh();
  const rt = runtime();
  assert.equal(await svc.runManagedInstall(context, rt.value), false);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /@deepseek-ai\/dsh@0\.1\.5-rc\.2/);
  assert.match(messages[0], /Code Storage/);
  assert.deepEqual(rt.calls.mkdir, []);
  assert.deepEqual(rt.calls.run, []);
  assert.equal(outputChannels.length, 0);
});

test("managed install runs exact pinned non-global npm spec and verifies it", async () => {
  const svc = fresh();
  modalAnswer = "Install";
  const rt = runtime();
  assert.equal(await svc.runManagedInstall(context, rt.value), true);
  assert.equal(rt.calls.mkdir.length, 1);
  assert.equal(rt.calls.run.length, 1);
  const spec = rt.calls.run[0];
  assert.equal(spec.command, "npm");
  assert.deepEqual(spec.args, [
    "install", "--prefix", spec.cwd, "--no-save", "--no-audit", "--no-fund",
    "@deepseek-ai/dsh@0.1.5-rc.2",
  ]);
  assert.ok(!spec.args.includes("-g"));
  assert.deepEqual(rt.calls.validate, [spec]);
  assert.equal(progressCalls.length, 1);
  assert.equal(progressCalls[0].cancellable, true);
  assert.equal(outputChannels.length, 1);
  assert.equal(outputChannels[0].name, "DSHmux Doctor");
  assert.match(outputChannels[0].text, /npm install --prefix/);
  assert.match(outputChannels[0].text, /installed/);
  assert.ok(messages.some((message) => /installed and verified/.test(message)));
});

test("cancelled child is not validated or reported as success", async () => {
  const svc = fresh();
  modalAnswer = "Install";
  const rt = runtime({
    run: async () => ({ ok: false, cancelled: true, exitCode: null }),
  });
  assert.equal(await svc.runManagedInstall(context, rt.value), false);
  assert.deepEqual(rt.calls.validate, []);
  assert.deepEqual(errors, []);
});

test("owned npm child cancellation waits for close before repair returns", async () => {
  const svc = fresh();
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  let killCalls = 0;
  child.kill = () => { killCalls++; return true; };
  let cancel;
  let disposed = false;
  const childToken = {
    isCancellationRequested: false,
    onCancellationRequested: (listener) => {
      cancel = listener;
      return { dispose: () => { disposed = true; } };
    },
  };

  let resolved = false;
  const pending = svc.waitForManagedInstallChild(child, childToken, () => {});
  pending.then(() => { resolved = true; });
  childToken.isCancellationRequested = true;
  cancel();
  await Promise.resolve();
  assert.equal(killCalls, 1);
  assert.equal(resolved, false, "must not return while npm can still mutate the prefix");

  child.emit("close", null);
  assert.deepEqual(await pending, { ok: false, cancelled: true, exitCode: null });
  assert.equal(disposed, true);
});

test("managed npm launch inherits Doctor's resolved Node directory", () => {
  const svc = fresh();
  const { buildManagedInstallSpec } = require("../out/dshInstallService.js");
  const spec = buildManagedInstallSpec("/storage", "linux");
  const prepared = svc.prepareManagedNpmLaunch(
    spec,
    {
      command: "/opt/custom-node/bin/node",
      args: [spec.binPath],
      shell: false,
      runtimePath: "/opt/custom-node/bin",
    },
    { PATH: "/usr/bin:/bin" },
    "linux",
    () => false
  );
  assert.equal(prepared.command, "npm");
  assert.equal(prepared.shell, false);
  assert.equal(prepared.env.PATH, "/opt/custom-node/bin:/usr/bin:/bin");
  assert.deepEqual(prepared.args, spec.args);
});

test("nonzero npm exit reports one concise failure", async () => {
  const svc = fresh();
  modalAnswer = "Install";
  const rt = runtime({
    run: async (_spec, _token, onOutput) => {
      onOutput("npm ERR simulated\n");
      return { ok: false, cancelled: false, exitCode: 1 };
    },
  });
  assert.equal(await svc.runManagedInstall(context, rt.value), false);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /failed|verified/);
  assert.match(outputChannels[0].text, /npm ERR simulated/);
});

test("successful npm with wrong or missing CLI fails verification and can retry", async () => {
  const svc = fresh();
  modalAnswer = "Install";
  let attempt = 0;
  const rt = runtime({
    validate: () => ++attempt === 1
      ? { valid: false, version: "0.1.5-rc.1" }
      : { valid: true, version: "0.1.5-rc.2" },
  });
  assert.equal(await svc.runManagedInstall(context, rt.value), false);
  assert.equal(await svc.runManagedInstall(context, rt.value), true);
  assert.deepEqual(rt.calls.mkdir.length, 2);
  assert.deepEqual(rt.calls.run.length, 2);
});

test("Doctor output is bounded", async () => {
  const svc = fresh();
  modalAnswer = "Install";
  const rt = runtime({
    run: async (_spec, _token, onOutput) => {
      onOutput("x".repeat(100_000));
      return { ok: false, cancelled: false, exitCode: 1 };
    },
  });
  await svc.runManagedInstall(context, rt.value);
  assert.ok(outputChannels[0].text.length <= 64 * 1024 + 100, "bounded plus short command prefix");
});

test("Node and npm guidance point to the official Node download", async () => {
  const svc = fresh();
  // The mocked non-modal message declines opening, but the text stays accurate.
  await svc.runNodeInstallGuidance();
  await svc.runNpmInstallGuidance();
  assert.match(messages[0], /Node\.js 22\.19\+ \(22\.x\) or Node\.js 24\+/);
  assert.match(messages[1], /npm.*Node\.js/);
  assert.deepEqual(opened, []);
});

test("Doctor selects exactly one state-appropriate repair action", () => {
  const svc = fresh();
  const base = {
    state: "dsh-missing",
    node: { runnable: true, supported: true },
    npm: { available: true },
  };
  assert.equal(svc.doctorActionFor(base), "repair");
  assert.equal(svc.doctorActionFor({ ...base, state: "dsh-unrunnable" }), "repair");
  assert.equal(svc.doctorActionFor({ ...base, node: { runnable: false, supported: false } }), "node");
  assert.equal(svc.doctorActionFor({ ...base, node: { runnable: true, supported: false } }), "node");
  assert.equal(svc.doctorActionFor({ ...base, npm: { available: false } }), "npm");
  assert.equal(svc.doctorActionFor({ ...base, state: "ready" }), null);
});

test("Doctor Check again refreshes the launcher before reopening", async () => {
  const svc = fresh();
  quickPickAnswers.push({ action: "again" }, undefined);
  let refreshCalls = 0;

  await svc.runDoctorCommand(
    { globalStorageUri: { fsPath: "/tmp/dshmux-doctor-test" } },
    () => { refreshCalls++; }
  );

  assert.equal(refreshCalls, 1);
  assert.equal(quickPickCalls, 2);
});

test("install service has no global config write or source-clone flow", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "installService.ts"), "utf8");
  assert.doesNotMatch(source, /ConfigurationTarget|\.update\("dshPath"/);
  assert.doesNotMatch(source, /git clone|pnpm install|runPrimaryInstallFlow/);
});

test("generic upgrade UI is suppressed for a version-pinned managed DSH", () => {
  const servicePath = require.resolve("../out/versionCheckService.js");
  delete require.cache[servicePath];
  const service = require(servicePath);
  const values = new Map([
    ["dsh.latestVersion", "0.1.6"],
    ["dsh.nextVersion", "0.1.6-rc.1"],
  ]);
  const upgradeContext = { workspaceState: { get: (key) => values.get(key) } };
  const managed = "C:\\Code Storage\\managed-dsh\\0.1.5-rc.2\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js";
  assert.equal(service.upgradeInfo(upgradeContext, "0.1.5-rc.2", managed), undefined);
  assert.ok(service.upgradeInfo(upgradeContext, "0.1.5-rc.2", "C:\\Users\\me\\AppData\\Roaming\\npm\\dsh.cmd"));
});
