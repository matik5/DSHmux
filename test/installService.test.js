"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const { EventEmitter } = require("node:events");
const os = require("node:os");
const path = require("node:path");

const workspaceDir = process.platform === "win32" ? "C:\\Projects\\Current" : "/Projects/Current";
const globalStorageDir = process.platform === "win32"
  ? "C:\\Users\\me\\Code Storage"
  : "/Users/me/Code Storage";
const alternateParent = process.platform === "win32" ? "D:\\My Projects" : "/My Projects";
const managedStorageDir = path.join(workspaceDir, ".dshmux");
const homeStorageDir = path.join(os.homedir(), ".dshmux");
const managedCheckoutDir = path.join(homeStorageDir, "deepseek-harness");
const alternateCheckoutDir = path.join(alternateParent, "deepseek-harness");
const sourceBinFor = (checkoutDir) => path.join(checkoutDir, "apps", "cli", "lib", "bin.js");

let modalAnswer;
let messages;
let errors;
let opened;
let outputChannels;
let progressCalls;
let quickPickAnswers;
let quickPickCalls;
let quickPickItems;
let informationCalls;
let folderAnswers;
const workspaceValues = new Map();

function reset() {
  modalAnswer = undefined;
  messages = [];
  errors = [];
  opened = [];
  outputChannels = [];
  progressCalls = [];
  quickPickAnswers = [];
  quickPickCalls = 0;
  quickPickItems = [];
  informationCalls = [];
  folderAnswers = [];
  workspaceValues.clear();
}

const token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) };
const fakeVscode = {
  Uri: {
    parse: (value) => ({ toString: () => value, fsPath: value }),
    file: (value) => ({ toString: () => value, fsPath: value }),
  },
  ProgressLocation: { Notification: 15 },
  env: {
    language: "en",
    remoteName: undefined,
    openExternal: async (uri) => opened.push(uri.toString()),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: workspaceDir } }],
    getConfiguration: () => ({
      inspect: () => undefined,
      get: (_key, fallback) => fallback,
    }),
  },
  window: {
    showInformationMessage: async (message, options, ...items) => {
      messages.push(message);
      informationCalls.push({ message, options, items });
      return options && options.modal
        ? Array.isArray(modalAnswer) ? modalAnswer.shift() : modalAnswer
        : undefined;
    },
    showOpenDialog: async () => folderAnswers.shift(),
    showErrorMessage: async (message) => { errors.push(message); return undefined; },
    showQuickPick: async (items) => {
      quickPickCalls++;
      quickPickItems.push(items);
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
  globalStorageUri: { fsPath: globalStorageDir },
  workspaceState: {
    get: (key) => workspaceValues.get(key),
    update: async (key, value) => { workspaceValues.set(key, value); },
  },
};

function runtime(overrides = {}) {
  const calls = { mkdir: [], run: [], validate: [] };
  return {
    calls,
    value: {
      mkdir: async (dir) => calls.mkdir.push(dir),
      resolvePnpm: () => ({
        command: "/node",
        argsPrefix: ["/managed/pnpm.cjs"],
        shell: false,
        resolvedPath: "/managed/pnpm.cjs",
        runtimePath: "/managed/node_modules/.bin",
      }),
      run: async (spec, _pnpm, _token, onOutput) => {
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

function pnpmRuntime(overrides = {}) {
  const calls = { mkdir: [], run: [], validate: [] };
  return {
    calls,
    value: {
      mkdir: async (dir) => calls.mkdir.push(dir),
      run: async (spec, _token, onOutput) => {
        calls.run.push(spec);
        onOutput("pnpm installed\n");
        return { ok: true, cancelled: false, exitCode: 0 };
      },
      validate: (spec) => {
        calls.validate.push(spec);
        return { valid: true, version: "11.7.0" };
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
  assert.ok(messages[0].includes(homeStorageDir), "modal shows the user-level default destination");
  assert.deepEqual(informationCalls[0].items, [
    "Install globally",
    "Install to shown location",
    "Use patched source build",
    "Change…",
  ]);
  assert.ok(!informationCalls[0].items.includes("Cancel"));
  assert.deepEqual(rt.calls.mkdir, []);
  assert.deepEqual(rt.calls.run, []);
  assert.equal(outputChannels.length, 0);
});

test("managed DSH install is gated before chooser or mutation when pnpm is unavailable", async () => {
  const svc = fresh();
  const rt = runtime({ resolvePnpm: () => null });
  assert.equal(await svc.runManagedInstall(context, rt.value), false);
  assert.equal(informationCalls.length, 0);
  assert.deepEqual(rt.calls.mkdir, []);
  assert.deepEqual(rt.calls.run, []);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /pnpm 11\.7\.0.*before DSH/i);
});

test("managed install runs exact pinned non-global npm spec and verifies it", async () => {
  const svc = fresh();
  modalAnswer = "Install to shown location";
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
  assert.equal(workspaceValues.has("dsh.managedStorageDir"), false, "default confirm is not persisted");
});

test("Change selects a parent for an ordinary deepseek-harness checkout", async () => {
  const svc = fresh();
  modalAnswer = ["Change…", "Install to shown location"];
  folderAnswers.push([{ fsPath: alternateParent }]);
  const rt = runtime();

  assert.equal(await svc.runManagedInstall(context, rt.value), true);

  assert.equal(informationCalls.filter((call) => call.options?.modal).length, 2);
  assert.ok(informationCalls[1].message.includes(alternateCheckoutDir));
  assert.equal(rt.calls.run[0].cwd, alternateCheckoutDir);
  assert.equal(rt.calls.run[0].scope, "source");
  assert.equal(
    workspaceValues.get("dsh.sourceCheckoutBin"),
    sourceBinFor(alternateCheckoutDir)
  );
  assert.equal(workspaceValues.has("dsh.managedStorageDir"), false);
});

test("patched source is offered as a project checkout under .dshmux", async () => {
  const svc = fresh();
  modalAnswer = ["Use patched source build", "Install to shown location"];
  const rt = runtime();

  assert.equal(await svc.runManagedInstall(context, rt.value), true);

  assert.equal(informationCalls.filter((call) => call.options?.modal).length, 2);
  assert.match(informationCalls[1].message, /matik5\/deepseek-harness\.git#matik\/dsh-patches-0\.1\.5-rc\.2/);
  assert.ok(informationCalls[1].message.includes(managedCheckoutDir));
  assert.equal(rt.calls.run[0].cwd, managedCheckoutDir);
  assert.equal(rt.calls.run[0].source.repo, "https://github.com/matik5/deepseek-harness.git");
  assert.equal(rt.calls.run[0].source.ref, "matik/dsh-patches-0.1.5-rc.2");
  assert.equal(
    workspaceValues.get("dsh.sourceCheckoutBin"),
    sourceBinFor(managedCheckoutDir)
  );
});

test("Change from patched source installs the repo directly under the chosen parent", async () => {
  const svc = fresh();
  modalAnswer = ["Use patched source build", "Change…", "Install to shown location"];
  folderAnswers.push([{ fsPath: alternateParent }]);
  const rt = runtime();

  assert.equal(await svc.runManagedInstall(context, rt.value), true);

  assert.equal(rt.calls.run[0].cwd, alternateCheckoutDir);
  assert.doesNotMatch(rt.calls.run[0].cwd, /\.dshmux/i);
  assert.equal(rt.calls.run[0].source.repo, "https://github.com/matik5/deepseek-harness.git");
});

test("global choice runs the pinned npm global install and does not persist a project path", async () => {
  const svc = fresh();
  modalAnswer = "Install globally";
  const rt = runtime();

  assert.equal(await svc.runManagedInstall(context, rt.value), true);

  assert.deepEqual(rt.calls.run[0].args, [
    "install", "--global", "--no-audit", "--no-fund",
    "@deepseek-ai/dsh@0.1.5-rc.2",
  ]);
  assert.equal(rt.calls.run[0].scope, "global");
  assert.deepEqual(rt.calls.mkdir, []);
  assert.equal(workspaceValues.has("dsh.managedStorageDir"), false);
});

test("remembered source checkout precedes default, project, and legacy managed installs", () => {
  const svc = fresh();
  const source = sourceBinFor(path.join(path.dirname(workspaceDir), "deepseek-harness"));
  workspaceValues.set("dsh.sourceCheckoutBin", source);
  const dshBinIn = (root) => path.join(
    root, "managed-dsh", "0.1.5-rc.2", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js"
  );
  const bins = svc.managedBinsForContext(context);
  assert.deepEqual(bins, [
    source,
    dshBinIn(homeStorageDir),
    dshBinIn(managedStorageDir),
    dshBinIn(globalStorageDir),
  ]);
});

test("storage roots default to the user-level .dshmux and remember an explicit choice", () => {
  const svc = fresh();
  assert.equal(svc.managedStorageForContext(context), homeStorageDir);
  workspaceValues.set("dsh.managedStorageDir", alternateParent);
  assert.equal(svc.managedStorageForContext(context), alternateParent);
  const roots = svc.managedStorageRootsForContext(context);
  assert.deepEqual(roots, [
    alternateParent,
    homeStorageDir,
    managedStorageDir,
    globalStorageDir,
  ]);
});

test("storage roots deduplicate a remembered root equal to the default", () => {
  const svc = fresh();
  workspaceValues.set("dsh.managedStorageDir", homeStorageDir);
  assert.deepEqual(svc.managedStorageRootsForContext(context), [
    homeStorageDir,
    managedStorageDir,
    globalStorageDir,
  ]);
});

test("pnpm candidate prefers an existing legacy root over an absent default", () => {
  const svc = fresh();
  const legacyPnpm = path.join(
    managedStorageDir, "managed-pnpm", "11.7.0", "node_modules", "pnpm", "bin", "pnpm.cjs"
  );
  const candidate = svc.managedPnpmCandidateForContext(context, (p) => p === legacyPnpm);
  assert.equal(candidate, legacyPnpm);
});

test("cancelled child is not validated or reported as success", async () => {
  const svc = fresh();
  modalAnswer = "Install to shown location";
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

test("source environment prepends the verified pnpm bin for nested scripts", () => {
  const svc = fresh();
  const prepared = svc.preparePnpmEnvironment({
    command: "C:\\Program Files\\nodejs\\node.exe",
    argsPrefix: ["C:\\Code Storage\\managed-pnpm\\11.7.0\\node_modules\\pnpm\\bin\\pnpm.cjs"],
    shell: false,
    resolvedPath: "C:\\Code Storage\\managed-pnpm\\11.7.0\\node_modules\\pnpm\\bin\\pnpm.cjs",
    runtimePath: "C:\\Code Storage\\managed-pnpm\\11.7.0\\node_modules\\.bin",
  }, { Path: "C:\\Program Files\\nodejs;C:\\Windows\\System32" }, "win32");
  assert.equal(
    prepared.Path,
    "C:\\Code Storage\\managed-pnpm\\11.7.0\\node_modules\\.bin;C:\\Program Files\\nodejs;C:\\Windows\\System32"
  );
});

test("nonzero npm exit reports one concise failure", async () => {
  const svc = fresh();
  modalAnswer = "Install to shown location";
  const rt = runtime({
    run: async (_spec, _pnpm, _token, onOutput) => {
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
  modalAnswer = "Install to shown location";
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
  modalAnswer = "Install to shown location";
  const rt = runtime({
    run: async (_spec, _pnpm, _token, onOutput) => {
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

test("managed pnpm install uses pinned non-global npm spec and verifies it", async () => {
  const svc = fresh();
  modalAnswer = "Install";
  const rt = pnpmRuntime();
  assert.equal(await svc.runManagedPnpmInstall(context, rt.value), true);
  assert.equal(rt.calls.mkdir.length, 1);
  assert.equal(rt.calls.run.length, 1);
  const spec = rt.calls.run[0];
  assert.deepEqual(spec.args, [
    "install", "--prefix", spec.cwd, "--no-save", "--no-audit", "--no-fund", "pnpm@11.7.0",
  ]);
  assert.deepEqual(rt.calls.validate, [spec]);
  assert.match(outputChannels[0].text, /pnpm@11\.7\.0/);
  assert.ok(messages.some((message) => /pnpm 11\.7\.0 is installed and verified/.test(message)));
});

test("declined pnpm confirmation installs nothing", async () => {
  const svc = fresh();
  const rt = pnpmRuntime();
  assert.equal(await svc.runManagedPnpmInstall(context, rt.value), false);
  assert.deepEqual(rt.calls.mkdir, []);
  assert.deepEqual(rt.calls.run, []);
  assert.deepEqual(outputChannels, []);
  assert.ok(messages.some((message) => message.includes(homeStorageDir)), "declined modal still names the destination");
  assert.ok(messages.some((message) => message.includes("pnpm@11.7.0")));
  assert.deepEqual(errors, []);
});

test("managed pnpm install stops on cancellation and reports failed verification", async () => {
  const svc = fresh();
  modalAnswer = "Install";
  const cancelled = pnpmRuntime({
    run: async () => ({ ok: false, cancelled: true, exitCode: null }),
  });
  assert.equal(await svc.runManagedPnpmInstall(context, cancelled.value), false);
  assert.deepEqual(cancelled.calls.validate, []);
  assert.deepEqual(errors, []);

  const nonzero = pnpmRuntime({
    run: async (_spec, _token, onOutput) => {
      onOutput("npm ERR simulated\n");
      return { ok: false, cancelled: false, exitCode: 1 };
    },
  });
  assert.equal(await svc.runManagedPnpmInstall(context, nonzero.value), false);
  assert.match(errors.at(-1), /pnpm installation failed/i);

  const failed = pnpmRuntime({
    validate: () => ({ valid: false, version: "11.6.0" }),
  });
  assert.equal(await svc.runManagedPnpmInstall(context, failed.value), false);
  assert.match(errors.at(-1), /pnpm installation failed/i);
});

test("source installation uses the verified pnpm launch without npm exec", () => {
  fresh();
  const fs = require("node:fs");
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "installService.ts"), "utf8");
  assert.doesNotMatch(source, /buildPnpmExecArgs|--package=pnpm/);
  assert.match(source, /pnpm\.command[\s\S]*\.\.\.pnpm\.argsPrefix[\s\S]*\.\.\.pnpmArgs/);
  assert.match(source, /preparePnpmEnvironment\(pnpm, env, process\.platform\)/);
});

test("Doctor selects exactly one state-appropriate repair action", () => {
  const svc = fresh();
  const base = {
    state: "dsh-missing",
    node: { runnable: true, supported: true },
    npm: { available: true },
    pnpm: { available: true, supported: true, version: "11.7.0" },
  };
  assert.equal(svc.doctorActionFor(base), "repair");
  assert.equal(svc.doctorActionFor({ ...base, state: "dsh-unrunnable" }), "repair");
  assert.equal(svc.doctorActionFor({ ...base, node: { runnable: false, supported: false } }), "node");
  assert.equal(svc.doctorActionFor({ ...base, node: { runnable: true, supported: false } }), "node");
  assert.equal(svc.doctorActionFor({ ...base, npm: { available: false } }), "npm");
  assert.equal(svc.doctorActionFor({ ...base, pnpm: { available: false, supported: false } }), "pnpm");
  assert.equal(svc.doctorActionFor({ ...base, pnpm: { available: true, supported: false, version: "12.0.0" } }), "pnpm");
  assert.equal(svc.doctorActionFor({ ...base, state: "ready" }), null);
  assert.equal(svc.doctorActionFor({ ...base, state: "ready", pnpm: { available: false, supported: false } }), "pnpm");
  assert.equal(svc.doctorActionFor({
    ...base,
    state: "ready",
    node: { runnable: false, supported: false },
    pnpm: { available: false, supported: false },
  }), null);
});

test("Doctor Check again refreshes the launcher before reopening", async () => {
  const svc = fresh();
  quickPickAnswers.push({ action: "again" }, undefined);
  let refreshCalls = 0;

  await svc.runDoctorCommand(
    {
      globalStorageUri: { fsPath: "/tmp/dshmux-doctor-test" },
      workspaceState: { get: () => undefined, update: async () => {} },
    },
    () => { refreshCalls++; }
  );

  assert.equal(refreshCalls, 1);
  assert.equal(quickPickCalls, 2);
  assert.ok(quickPickItems[0].some((item) => item.label.includes("pnpm")));
});

test("Doctor pnpm action installs, refreshes, and reopens the report", async () => {
  const svc = fresh();
  modalAnswer = "Install";
  quickPickAnswers.push({ action: "pnpm" }, undefined);
  const rt = pnpmRuntime();
  let refreshCalls = 0;

  await svc.runDoctorCommand(context, () => { refreshCalls++; }, undefined, rt.value);

  assert.equal(rt.calls.run.length, 1);
  assert.equal(refreshCalls, 1);
  assert.equal(quickPickCalls, 2);
});

test("install service does not rewrite global dshPath configuration", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "installService.ts"), "utf8");
  assert.doesNotMatch(source, /ConfigurationTarget|\.update\("dshPath"/);
  assert.doesNotMatch(source, /ConfigurationTarget|\.update\("dshPath"|runPrimaryInstallFlow/);
  assert.match(source, /buildPatchedSourceCheckoutSpec/);
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
