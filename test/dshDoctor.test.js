import { test } from "node:test";
import assert from "node:assert/strict";
import { runDoctor, classifyInstallType, redactPath } from "../out/dshDoctor.js";

const HOME = "/home/user";
const NODE = "/usr/local/bin/node";
const DSH = "/usr/local/bin/dsh";

function makeProbe(overrides = {}, runTable = new Map()) {
  const existsMap = new Map(overrides.existsEntries ?? []);
  return {
    platform: "linux",
    arch: "x64",
    home: HOME,
    execPath: "/Applications/Code Helper",
    env: {},
    hostLabel: "local",
    configuredDshPath: undefined,
    managedDshPath: undefined,
    exists: (p) => existsMap.get(p) ?? false,
    realPath: (p) => overrides.realPathEntries?.find(([key]) => key === p)?.[1] ?? null,
    run: (cmd, args) => runTable.get(`${cmd} ${args.join(" ")}`) ?? { ok: false, stdout: "" },
    dshVersion: (bin) => overrides.dshVersions?.[bin] ?? null,
    resolveDsh: () => overrides.dshFound ?? { path: null, tried: [] },
    resolveNode: () => NODE,
    ...overrides,
  };
}

function runtime(nodeVersion = "v24.0.0", { npm = true } = {}) {
  const table = new Map([[`${NODE} --version`, { ok: true, stdout: nodeVersion }]]);
  if (npm) table.set("npm --version", { ok: true, stdout: "11.0.0" });
  return table;
}

test("missing runtime states are ordered for managed repair", () => {
  const missingNode = runDoctor(makeProbe({ resolveNode: () => "node" }));
  assert.equal(missingNode.state, "node-missing");
  assert.equal(missingNode.node.supported, false);

  const oldNode = runDoctor(makeProbe({ existsEntries: [[NODE, true]] }, runtime("v22.18.9")));
  assert.equal(oldNode.state, "node-unsupported");
  assert.equal(oldNode.node.supported, false);

  const noNpm = runDoctor(makeProbe({ existsEntries: [[NODE, true]] }, runtime("v24.0.0", { npm: false })));
  assert.equal(noNpm.state, "npm-missing");

  const noDsh = runDoctor(makeProbe({ existsEntries: [[NODE, true]] }, runtime()));
  assert.equal(noDsh.state, "dsh-missing");
  assert.equal(noDsh.node.supported, true);
  assert.equal(noDsh.npm.available, true);
});

test("Git and pnpm are not probed or required", () => {
  const calls = [];
  const table = runtime();
  const base = makeProbe({ existsEntries: [[NODE, true]] }, table);
  base.run = (cmd, args) => {
    calls.push(cmd);
    return table.get(`${cmd} ${args.join(" ")}`) ?? { ok: false, stdout: "" };
  };
  assert.equal(runDoctor(base).state, "dsh-missing");
  assert.ok(!calls.includes("git"));
  assert.ok(!calls.includes("pnpm"));
});

test("a runnable existing DSH is ready even when Node probe is unavailable", () => {
  const report = runDoctor(makeProbe({
    resolveNode: () => "node",
    existsEntries: [[DSH, true]],
    dshFound: { path: DSH, tried: [DSH] },
    dshVersions: { [DSH]: "0.1.5-rc.2" },
    realPathEntries: [[DSH, "/usr/lib/node_modules/@deepseek-ai/dsh/lib/bin.js"]],
  }));
  assert.equal(report.state, "ready");
  assert.equal(report.dsh.installType, "npm-global");
});

test("resolved but unrunnable DSH is repairable", () => {
  const report = runDoctor(makeProbe({
    existsEntries: [[NODE, true], [DSH, true]],
    dshFound: { path: DSH, tried: [DSH] },
  }, runtime()));
  assert.equal(report.state, "dsh-unrunnable");
});

test("valid managed DSH wins over configured and discovered candidates", () => {
  const managed = `${HOME}/storage/managed-dsh/0.1.5-rc.2/node_modules/@deepseek-ai/dsh/lib/bin.js`;
  let discoveryCalls = 0;
  const probe = makeProbe({
    managedDshPath: managed,
    configuredDshPath: "/configured/dsh",
    existsEntries: [[NODE, true], [managed, true], ["/configured/dsh", true]],
    dshVersions: { [managed]: "0.1.5-rc.2", "/configured/dsh": "0.1.5-rc.1" },
  }, runtime());
  probe.resolveDsh = () => { discoveryCalls++; return { path: DSH, tried: [DSH] }; };
  const report = runDoctor(probe);
  assert.equal(report.state, "ready");
  assert.equal(report.dsh.resolvedPath, managed);
  assert.equal(report.dsh.installType, "managed");
  assert.equal(discoveryCalls, 0);
});

test("incomplete or wrong-version managed install is ignored", () => {
  const managed = `${HOME}/storage/managed/bin.js`;
  const report = runDoctor(makeProbe({
    managedDshPath: managed,
    existsEntries: [[NODE, true], [managed, true], [DSH, true]],
    dshVersions: { [managed]: "0.1.5-rc.1", [DSH]: "0.1.5-rc.2" },
    dshFound: { path: DSH, tried: [managed, DSH] },
  }, runtime()));
  assert.equal(report.state, "ready");
  assert.equal(report.dsh.resolvedPath, DSH);
  assert.notEqual(report.dsh.installType, "managed");
});

test("stale configured path warns but discovery still works", () => {
  const report = runDoctor(makeProbe({
    configuredDshPath: "/old/machine/dsh",
    existsEntries: [[NODE, true], [DSH, true]],
    dshFound: { path: DSH, tried: [`${HOME}/bin/dsh`, DSH] },
    dshVersions: { [DSH]: "0.1.5-rc.2" },
  }, runtime()));
  assert.equal(report.state, "ready");
  assert.ok(report.warnings.includes("stale-configured-path"));
  assert.equal(report.dsh.tried[0], "~/bin/dsh");
});

test("untested versions remain ready and are Doctor detail only", () => {
  const report = runDoctor(makeProbe({
    existsEntries: [[NODE, true], [DSH, true]],
    dshFound: { path: DSH, tried: [DSH] },
    dshVersions: { [DSH]: "0.2.0" },
  }, runtime()));
  assert.equal(report.state, "ready");
  assert.equal(report.dsh.compatibility, "newer");
  assert.deepEqual(report.warnings, ["untested-version:newer"]);
});

test("Windows npm shim classification and workspace host label survive", () => {
  const bin = "C:\\Users\\me\\AppData\\Roaming\\npm\\dsh.cmd";
  const node = "C:\\Program Files\\nodejs\\node.exe";
  const table = new Map([
    [`${node} --version`, { ok: true, stdout: "v24.0.0" }],
    ["npm --version", { ok: true, stdout: "11.0.0" }],
  ]);
  const report = runDoctor(makeProbe({
    platform: "win32",
    hostLabel: "remote-ssh",
    resolveNode: () => node,
    existsEntries: [[node, true], [bin, true]],
    dshFound: { path: bin, tried: [bin] },
    dshVersions: { [bin]: "0.1.5-rc.2" },
  }, table));
  assert.equal(report.state, "ready");
  assert.equal(report.dsh.installType, "npm-global");
  assert.equal(report.host.label, "remote-ssh");
});

test("install type string rules remain compatible", () => {
  const p = makeProbe();
  assert.equal(classifyInstallType(null, p), "none");
  assert.equal(classifyInstallType(`${HOME}/.npm/_npx/x/node_modules/.bin/dsh`, p), "npx-cache");
  assert.equal(classifyInstallType("D:\\src\\dsh\\apps\\cli\\lib\\bin.js", p), "source");
  assert.equal(classifyInstallType("/custom/dsh", p), "custom");
  assert.equal(redactPath(`${HOME}/secret`, HOME), "~/secret");
});
