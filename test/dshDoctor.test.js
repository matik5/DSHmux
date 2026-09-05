// Unit tests for src/dshDoctor.ts (04-install R1): classification matrix with
// an injected probe — no real spawns, no filesystem, deterministic.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runDoctor, classifyInstallType, redactPath } from "../out/dshDoctor.js";

const HOME = "/home/user";
const NODE = "/usr/local/bin/node";

/**
 * Stub probe with a working Node by default. Override any seam via
 * `overrides`; script extra tool probes via `runTable`.
 */
function makeProbe(overrides = {}, runTable = new Map()) {
  const existsMap = new Map(overrides.existsEntries ?? []); // [path, bool]
  const probe = {
    platform: "linux",
    arch: "x64",
    home: HOME,
    execPath: "/Applications/Code Helper",
    env: {},
    hostLabel: "local",
    configuredDshPath: undefined,
    exists: (p) => (existsMap.has(p) ? existsMap.get(p) : false),
    realPath: (p) => (overrides.realPathEntries?.find(([k]) => k === p)?.[1] ?? null),
    run: (cmd, args) => runTable.get(`${cmd} ${args.join(" ")}`) ?? { ok: false, stdout: "" },
    dshVersion: (bin) => (overrides.dshVersions?.[bin] !== undefined ? overrides.dshVersions[bin] : null),
    resolveDsh: () => (overrides.dshFound !== undefined ? overrides.dshFound : { path: null, tried: [] }),
    resolveNode: () => NODE,
    ...overrides,
  };
  return probe;
}

function nodeWorks(runTable) {
  runTable.set(`${NODE} --version`, { ok: true, stdout: "v24.0.0" });
}

test("node-missing: Node not found and `--version` fails", () => {
  const t = new Map();
  const probe = makeProbe({ resolveNode: () => "node" }, t); // bare name
  const report = runDoctor(probe);
  assert.equal(report.state, "node-missing");
  assert.equal(report.node.runnable, false);
  assert.equal(report.node.available, false);
  assert.equal(report.node.version, null);
  assert.equal(report.npm.available, false); // npm probe skipped without Node
  assert.equal(report.git.available, false);
  assert.equal(report.dsh.resolvedPath, null);
});

test("node-missing: absolute Node path that does not exist and cannot run", () => {
  const probe = makeProbe({ resolveNode: () => "/opt/homebrew/bin/node" });
  const report = runDoctor(probe);
  assert.equal(report.state, "node-missing");
  assert.equal(report.node.runnable, false);
  assert.equal(report.node.path, "/opt/homebrew/bin/node");
});

test("dsh-missing: Node + npm + git + pnpm fine, no DSH anywhere", () => {
  const t = new Map();
  nodeWorks(t);
  t.set("npm --version", { ok: true, stdout: "11.0.0" });
  t.set("npx --version", { ok: true, stdout: "11.0.0" });
  t.set("git --version", { ok: true, stdout: "git version 2.45.0" });
  t.set("pnpm --version", { ok: true, stdout: "9.15.0" });
  const probe = makeProbe({ existsEntries: [[NODE, true]] }, t);
  const report = runDoctor(probe);
  assert.equal(report.state, "dsh-missing");
  assert.equal(report.node.runnable, true);
  assert.equal(report.node.version, "v24.0.0");
  assert.equal(report.npm.version, "11.0.0");
  assert.equal(report.git.available, true);
  assert.equal(report.pnpm.available, true);
  assert.equal(report.dsh.installType, "none");
  assert.equal(report.dsh.compatibility, "unknown");
});

test("source-prerequisites-missing: DSH missing and git absent", () => {
  const t = new Map();
  nodeWorks(t);
  t.set("npm --version", { ok: true, stdout: "11.0.0" });
  t.set("pnpm --version", { ok: true, stdout: "9.15.0" });
  // git --version intentionally absent → fails
  const probe = makeProbe({ existsEntries: [[NODE, true]] }, t);
  const report = runDoctor(probe);
  assert.equal(report.state, "source-prerequisites-missing");
  assert.equal(report.git.available, false);
  assert.equal(report.pnpm.available, true);
});

test("source-prerequisites-missing: DSH missing and pnpm absent", () => {
  const t = new Map();
  nodeWorks(t);
  t.set("git --version", { ok: true, stdout: "git version 2.45.0" });
  // pnpm --version intentionally absent → fails
  const probe = makeProbe({ existsEntries: [[NODE, true]] }, t);
  const report = runDoctor(probe);
  assert.equal(report.state, "source-prerequisites-missing");
  assert.equal(report.pnpm.available, false);
});

test("ready: npm-global DSH at tested version, no warnings", () => {
  const bin = "/usr/local/bin/dsh";
  const t = new Map();
  nodeWorks(t);
  t.set("git --version", { ok: true, stdout: "git version 2.45.0" });
  t.set("pnpm --version", { ok: true, stdout: "9.15.0" });
  const probe = makeProbe(
    {
      existsEntries: [[NODE, true], [bin, true]],
      realPathEntries: [[bin, "/usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js"]],
      dshFound: { path: bin, tried: [`${HOME}/.nvm/versions/node/x/bin/dsh`, bin] },
      dshVersions: { [bin]: "0.1.2-rc.1" },
    },
    t
  );
  const report = runDoctor(probe);
  assert.equal(report.state, "ready");
  assert.equal(report.dsh.version, "0.1.2-rc.1");
  assert.equal(report.dsh.compatibility, "tested");
  assert.equal(report.dsh.installType, "npm-global");
  assert.equal(report.dsh.tried[0], "~/.nvm/versions/node/x/bin/dsh"); // redacted
  assert.deepEqual(report.warnings, []);
});

test("ready: npx-cache DSH, untested newer version → warning, still ready", () => {
  const bin = `${HOME}/.npm/_npx/abcd/node_modules/.bin/dsh`;
  const t = new Map();
  nodeWorks(t);
  const probe = makeProbe(
    {
      existsEntries: [[NODE, true], [bin, true]],
      dshFound: { path: bin, tried: [bin] },
      dshVersions: { [bin]: "0.2.0" },
    },
    t
  );
  const report = runDoctor(probe);
  assert.equal(report.state, "ready");
  assert.equal(report.dsh.installType, "npx-cache");
  assert.equal(report.dsh.compatibility, "newer");
  assert.ok(report.warnings.includes("untested-version:newer"));
});

test("ready: older version → warning, never a blocker", () => {
  const bin = "/usr/local/bin/dsh";
  const t = new Map();
  nodeWorks(t);
  const probe = makeProbe(
    {
      existsEntries: [[NODE, true], [bin, true]],
      dshFound: { path: bin, tried: [bin] },
      dshVersions: { [bin]: "0.1.1" },
    },
    t
  );
  const report = runDoctor(probe);
  assert.equal(report.state, "ready");
  assert.ok(report.warnings.includes("untested-version:older"));
});

test("dsh-unrunnable: binary resolved but `--version` fails", () => {
  const bin = "/usr/local/bin/dsh";
  const t = new Map();
  nodeWorks(t);
  const probe = makeProbe(
    {
      existsEntries: [[NODE, true], [bin, true]],
      dshFound: { path: bin, tried: [bin] },
      dshVersions: { [bin]: null }, // broken npm link / exec-bit failure
    },
    t
  );
  const report = runDoctor(probe);
  assert.equal(report.state, "dsh-unrunnable");
  assert.equal(report.dsh.resolvedPath, bin);
  assert.equal(report.dsh.version, null);
});

test("stale configured path: config set + missing on host, discovery finds npm-global", () => {
  const bin = "/usr/local/bin/dsh";
  const t = new Map();
  nodeWorks(t);
  const probe = makeProbe(
    {
      configuredDshPath: "/old/mac/path/dsh",
      existsEntries: [[NODE, true], [bin, true]],
      dshFound: { path: bin, tried: [bin] },
      dshVersions: { [bin]: "0.1.2-rc.1" },
    },
    t
  );
  const report = runDoctor(probe);
  assert.equal(report.state, "ready");
  assert.equal(report.dsh.configuredPath, "/old/mac/path/dsh");
  assert.equal(report.dsh.configuredValid, false);
  assert.equal(report.dsh.resolvedPath, bin);
  assert.ok(report.warnings.includes("stale-configured-path"));
});

test("configured path valid: used as-is, discovery not consulted", () => {
  const bin = `${HOME}/proj/dsh/apps/cli/lib/bin.js`;
  const t = new Map();
  nodeWorks(t);
  t.set("git --version", { ok: true, stdout: "git version 2.45.0" });
  t.set("pnpm --version", { ok: true, stdout: "9.15.0" });
  let discoveryCalled = false;
  const probe = makeProbe(
    {
      configuredDshPath: bin,
      existsEntries: [[NODE, true], [bin, true]],
      dshVersions: { [bin]: "0.1.2-rc.1" },
    },
    t
  );
  probe.resolveDsh = () => {
    discoveryCalled = true;
    return { path: "/should/not/be/used", tried: [] };
  };
  const report = runDoctor(probe);
  assert.equal(report.state, "ready");
  assert.equal(report.dsh.resolvedPath, bin);
  assert.equal(report.dsh.configuredValid, true);
  assert.equal(report.dsh.installType, "source");
  assert.equal(discoveryCalled, false);
  assert.deepEqual(report.warnings, []);
});

test("configured source-checkout directory resolves to its built CLI entry (R10)", () => {
  // resolveConfiguredDshPath does a real stat, so the checkout dir must exist.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-doctor-checkout-"));
  try {
    const bin = path.join(dir, "apps", "cli", "lib", "bin.js");
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    fs.writeFileSync(bin, "#!/usr/bin/env node\n");
    const t = new Map();
    nodeWorks(t);
    t.set("git --version", { ok: true, stdout: "git version 2.45.0" });
    t.set("pnpm --version", { ok: true, stdout: "9.15.0" });
    let discoveryCalled = false;
    const probe = makeProbe(
      {
        configuredDshPath: dir,
        existsEntries: [[NODE, true], [dir, true], [bin, true]],
        dshVersions: { [bin]: "0.1.2-rc.1" },
      },
      t
    );
    probe.resolveDsh = () => {
      discoveryCalled = true;
      return { path: "/should/not/be/used", tried: [] };
    };
    const report = runDoctor(probe);
    assert.equal(report.state, "ready");
    assert.equal(report.dsh.configuredPath, bin);
    assert.equal(report.dsh.configuredValid, true);
    assert.equal(report.dsh.resolvedPath, bin);
    assert.equal(report.dsh.installType, "source");
    assert.equal(discoveryCalled, false);
    assert.deepEqual(report.warnings, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("source install type: CLI entry under a checkout", () => {
  const bin = `${HOME}/proj/deepseek-harness/apps/cli/lib/bin.js`;
  const t = new Map();
  nodeWorks(t);
  const probe = makeProbe(
    {
      existsEntries: [[NODE, true], [bin, true]],
      dshFound: { path: bin, tried: [] },
      dshVersions: { [bin]: "0.1.2-rc.1" },
    },
    t
  );
  assert.equal(runDoctor(probe).dsh.installType, "source");
});

test("source install type: npm-linked global bin resolving into a checkout", () => {
  const bin = "/usr/local/bin/dsh";
  const real = `${HOME}/proj/deepseek-harness/apps/cli/lib/bin.js`;
  const t = new Map();
  nodeWorks(t);
  const probe = makeProbe(
    {
      existsEntries: [[NODE, true], [bin, true]],
      realPathEntries: [[bin, real]],
      dshFound: { path: bin, tried: [bin] },
      dshVersions: { [bin]: "0.1.2-rc.1" },
    },
    t
  );
  assert.equal(runDoctor(probe).dsh.installType, "source");
});

test("Windows: npm shim (.cmd) classifies npm-global", () => {
  const bin = `${HOME}\\AppData\\Roaming\\npm\\dsh.cmd`;
  const t = new Map();
  t.set("C:\\nodejs\\node.exe --version", { ok: true, stdout: "v24.0.0" });
  const probe = makeProbe(
    {
      platform: "win32",
      existsEntries: [["C:\\nodejs\\node.exe", true], [bin, true]],
      dshFound: { path: bin, tried: [bin] },
      dshVersions: { [bin]: "0.1.2-rc.1" },
      resolveNode: () => "C:\\nodejs\\node.exe",
    },
    t
  );
  const report = runDoctor(probe);
  assert.equal(report.state, "ready");
  assert.equal(report.dsh.installType, "npm-global");
  assert.equal(report.host.platform, "win32");
});

test("classifyInstallType: direct rules without a report", () => {
  const probe = makeProbe();
  assert.equal(classifyInstallType(null, probe), "none");
  assert.equal(classifyInstallType(`${HOME}/.npm/_npx/h/node_modules/.bin/dsh`, probe), "npx-cache");
  assert.equal(classifyInstallType("D:\\proj\\dsh\\apps\\cli\\lib\\bin.js", probe), "source");
  assert.equal(
    classifyInstallType("/usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js", probe),
    "npm-global"
  );
  assert.equal(classifyInstallType("/opt/custom/dsh", probe), "custom");
});

test("remote host label is reported verbatim (workspace host, not UI OS)", () => {
  const probe = makeProbe({ hostLabel: "remote-ssh:buildbox" });
  const report = runDoctor(probe);
  assert.equal(report.host.label, "remote-ssh:buildbox");
});

test("redactPath maps home to ~", () => {
  assert.equal(redactPath("/home/user/.npm/x", "/home/user"), "~/.npm/x");
  assert.equal(redactPath("/other/path", "/home/user"), "/other/path");
});
