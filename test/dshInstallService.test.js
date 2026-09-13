import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DSH_PACKAGE_NAME,
  TESTED_SOURCE_REPO,
  TESTED_SOURCE_TAG,
  TESTED_SOURCE_REVISION,
  TESTED_SOURCE_TREE_URL,
  managedDshRoot,
  managedDshBin,
  buildManagedInstallSpec,
  buildManagedNpmLaunchSpec,
  resolveNpmLaunchSpec,
  isSupportedNodeVersion,
  checkManagedInstall,
} from "../out/dshInstallService.js";
import { TESTED_DSH_VERSION } from "../out/versionCheck.js";

test("official source metadata is pinned", () => {
  assert.equal(TESTED_SOURCE_REPO, "https://github.com/deepseek-ai/deepseek-harness.git");
  assert.equal(TESTED_SOURCE_TAG, "dsh-v0.1.5-rc.2");
  assert.equal(TESTED_SOURCE_REVISION, "fb2c4b9e698e30edb738bca4cf0618587db7d203");
  assert.equal(
    TESTED_SOURCE_TREE_URL,
    "https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.5-rc.2"
  );
  assert.equal(DSH_PACKAGE_NAME, "@deepseek-ai/dsh");
});

test("managed paths are versioned and platform-correct", () => {
  assert.equal(
    managedDshRoot("/Users/me/Library/Application Support/Code", "darwin"),
    "/Users/me/Library/Application Support/Code/managed-dsh/0.1.5-rc.2"
  );
  assert.equal(
    managedDshBin("C:\\Users\\me\\Code Storage", "win32"),
    "C:\\Users\\me\\Code Storage\\managed-dsh\\0.1.5-rc.2\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js"
  );
});

test("managed npm spec is pinned, structured, and non-global", () => {
  const spec = buildManagedInstallSpec("C:\\Users\\me\\Code Storage", "win32");
  assert.equal(spec.command, "npm");
  assert.equal(spec.cwd, "C:\\Users\\me\\Code Storage\\managed-dsh\\0.1.5-rc.2");
  assert.deepEqual(spec.args, [
    "install",
    "--prefix",
    spec.cwd,
    "--no-save",
    "--no-audit",
    "--no-fund",
    `@deepseek-ai/dsh@${TESTED_DSH_VERSION}`,
  ]);
  assert.ok(!spec.args.includes("-g"));
  assert.ok(!spec.args.includes("--global"));
  assert.equal(spec.packageSpec, `@deepseek-ai/dsh@${TESTED_DSH_VERSION}`);
});

test("Windows managed npm launch preserves spaced argv without a shell", () => {
  const spec = buildManagedInstallSpec("C:\\Users\\me\\Code Storage", "win32");
  const node = "C:\\Program Files\\nodejs\\node.exe";
  const npmCli = "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js";
  const launch = buildManagedNpmLaunchSpec(
    spec,
    node,
    { Path: "C:\\Program Files\\nodejs;C:\\Windows\\System32" },
    "win32",
    (candidate) => candidate === npmCli
  );
  assert.deepEqual(launch, {
    command: node,
    args: [npmCli, ...spec.args],
    shell: false,
  });
  assert.equal(launch.args[3], spec.cwd);
});

test("Windows npm resolver supports a user-prefix npm CLI and is reusable by Doctor", () => {
  const node = "C:\\Program Files\\nodejs\\node.exe";
  const npmCli = "C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\npm\\bin\\npm-cli.js";
  const launch = resolveNpmLaunchSpec(
    node,
    {
      Path: "C:\\Program Files\\nodejs;C:\\Windows\\System32",
      APPDATA: "C:\\Users\\me\\AppData\\Roaming",
    },
    "win32",
    (candidate) => candidate === npmCli
  );
  assert.deepEqual(launch, {
    command: node,
    argsPrefix: [npmCli],
    shell: false,
  });
});

test("Windows npm resolver fails before Doctor can claim an unusable npm shim", () => {
  assert.throws(
    () => resolveNpmLaunchSpec(
      "C:\\runtime\\node.exe",
      { Path: "C:\\runtime;C:\\shim-only" },
      "win32",
      (candidate) => candidate === "C:\\shim-only\\npm.cmd"
    ),
    /could not be resolved safely/
  );
});

test("managed npm launch uses the augmented POSIX PATH without a shell", () => {
  const spec = buildManagedInstallSpec("/Users/me/Library/Application Support/Code", "darwin");
  const launch = buildManagedNpmLaunchSpec(
    spec,
    "/opt/homebrew/bin/node",
    { PATH: "/opt/homebrew/bin:/usr/bin" },
    "darwin",
    () => false
  );
  assert.deepEqual(launch, { command: "npm", args: spec.args, shell: false });
});

test("official Node engine range boundaries", () => {
  for (const version of ["v22.19.0", "22.99.1", "v24.0.0", "v25.1.2"]) {
    assert.equal(isSupportedNodeVersion(version), true, version);
  }
  for (const version of [null, "", "node", "v20.99.0", "v22.18.9", "v23.0.0"]) {
    assert.equal(isSupportedNodeVersion(version), false, String(version));
  }
});

function probe(exists, result) {
  return {
    exists: () => exists,
    run: () => result,
  };
}

test("managed install validation rejects incomplete, failed, and wrong-version installs", () => {
  const bin = "/storage/managed-dsh/0.1.5-rc.2/node_modules/@deepseek-ai/dsh/lib/bin.js";
  assert.deepEqual(checkManagedInstall(bin, "/node", "linux", probe(false, { ok: true, stdout: TESTED_DSH_VERSION })), {
    valid: false, binPath: bin, version: null,
  });
  assert.equal(checkManagedInstall(bin, "/node", "linux", probe(true, { ok: false, stdout: "" })).valid, false);
  const wrong = checkManagedInstall(bin, "/node", "linux", probe(true, { ok: true, stdout: "0.1.5-rc.1\n" }));
  assert.equal(wrong.valid, false);
  assert.equal(wrong.version, "0.1.5-rc.1");
});

test("managed install validation accepts only the exact tested version", () => {
  const bin = "C:\\storage\\managed\\bin.js";
  const calls = [];
  const p = {
    exists: (candidate) => candidate === bin,
    run: (cmd, args, opts) => {
      calls.push({ cmd, args, opts });
      return { ok: true, stdout: `${TESTED_DSH_VERSION}\r\n` };
    },
  };
  const result = checkManagedInstall(bin, "C:\\nodejs\\node.exe", "win32", p);
  assert.deepEqual(result, { valid: true, binPath: bin, version: TESTED_DSH_VERSION });
  assert.deepEqual(calls, [{
    cmd: "C:\\nodejs\\node.exe",
    args: [bin, "--version"],
    opts: { timeoutMs: 5_000, shell: false },
  }]);
});
