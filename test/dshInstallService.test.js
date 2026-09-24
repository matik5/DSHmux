import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DSH_PACKAGE_NAME,
  PATCHED_SOURCE_REPO,
  PATCHED_SOURCE_BRANCH,
  PATCHED_SOURCE_REVISION,
  PATCHED_SOURCE_TREE_URL,
  TESTED_SOURCE_REPO,
  TESTED_SOURCE_TAG,
  TESTED_SOURCE_REVISION,
  TESTED_SOURCE_TREE_URL,
  TESTED_PNPM_VERSION,
  managedDshRoot,
  managedDshBin,
  managedPnpmRoot,
  managedPnpmBin,
  buildManagedInstallSpec,
  buildManagedPnpmInstallSpec,
  buildGlobalInstallSpec,
  buildPatchedSourceCheckoutSpec,
  buildSourceCheckoutSpec,
  buildSourceCloneArgs,
  buildSourceInstallArgs,
  buildManagedNpmLaunchSpec,
  resolveNpmLaunchSpec,
  resolvePnpmLaunchSpec,
  isSupportedNodeVersion,
  isSupportedPnpmVersion,
  checkManagedInstall,
  checkManagedPnpmInstall,
} from "../out/dshInstallService.js";
import { TESTED_DSH_VERSION } from "../out/versionCheck.js";

test("official source metadata is pinned", () => {
  assert.equal(TESTED_SOURCE_REPO, "https://github.com/deepseek-ai/deepseek-harness.git");
  assert.equal(TESTED_SOURCE_TAG, "dsh-v0.1.7-rc.1");
  assert.equal(TESTED_SOURCE_REVISION, "46a7f68b0922371ce7144b668b90e377d8e799f4");
  assert.equal(
    TESTED_SOURCE_TREE_URL,
    "https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.7-rc.1"
  );
  assert.equal(DSH_PACKAGE_NAME, "@deepseek-ai/dsh");
});

test("patched source alternative is pinned to the maintained DSHmux branch", () => {
  assert.equal(PATCHED_SOURCE_REPO, "https://github.com/matik5/deepseek-harness.git");
  assert.equal(PATCHED_SOURCE_BRANCH, "matik/dsh-patches-0.1.7-rc.1");
  assert.equal(PATCHED_SOURCE_REVISION, "67ddcb32a7cf8ec2e8f028979d3bebe7588b5bc0");
  assert.equal(
    PATCHED_SOURCE_TREE_URL,
    "https://github.com/matik5/deepseek-harness/tree/matik/dsh-patches-0.1.7-rc.1"
  );
});

test("managed paths are versioned and platform-correct", () => {
  assert.equal(
    managedDshRoot("/Users/me/Library/Application Support/Code", "darwin"),
    "/Users/me/Library/Application Support/Code/managed-dsh/0.1.7-rc.1"
  );
  assert.equal(
    managedDshBin("C:\\Users\\me\\Code Storage", "win32"),
    "C:\\Users\\me\\Code Storage\\managed-dsh\\0.1.7-rc.1\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js"
  );
  assert.equal(
    managedPnpmRoot("C:\\Users\\me\\Code Storage", "win32"),
    "C:\\Users\\me\\Code Storage\\managed-pnpm\\11.7.0"
  );
  assert.equal(
    managedPnpmBin("C:\\Users\\me\\Code Storage", "win32"),
    "C:\\Users\\me\\Code Storage\\managed-pnpm\\11.7.0\\node_modules\\pnpm\\bin\\pnpm.cjs"
  );
});

test("managed pnpm install spec is pinned, structured, and non-global", () => {
  const spec = buildManagedPnpmInstallSpec("C:\\Users\\me\\Code Storage", "win32");
  assert.equal(spec.cwd, "C:\\Users\\me\\Code Storage\\managed-pnpm\\11.7.0");
  assert.equal(spec.binPath, `${spec.cwd}\\node_modules\\pnpm\\bin\\pnpm.cjs`);
  assert.deepEqual(spec.args, [
    "install", "--prefix", spec.cwd, "--no-save", "--no-audit", "--no-fund", "pnpm@11.7.0",
  ]);
  assert.equal(spec.packageSpec, `pnpm@${TESTED_PNPM_VERSION}`);
  assert.ok(!spec.args.includes("--global"));
});

test("managed npm spec is pinned, structured, and non-global", () => {
  const spec = buildManagedInstallSpec("C:\\Users\\me\\Code Storage", "win32");
  assert.equal(spec.command, "npm");
  assert.equal(spec.cwd, "C:\\Users\\me\\Code Storage\\managed-dsh\\0.1.7-rc.1");
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
  assert.equal(spec.scope, "managed");
});

test("global npm spec is explicit, pinned, and independent of project storage", () => {
  const spec = buildGlobalInstallSpec("C:\\Projects\\Current");
  assert.equal(spec.scope, "global");
  assert.equal(spec.cwd, "C:\\Projects\\Current");
  assert.deepEqual(spec.args, [
    "install", "--global", "--no-audit", "--no-fund",
    `@deepseek-ai/dsh@${TESTED_DSH_VERSION}`,
  ]);
});

test("custom location is a normal official deepseek-harness checkout", () => {
  const spec = buildSourceCheckoutSpec("D:\\My Projects", "win32");
  assert.equal(spec.scope, "source");
  assert.equal(spec.cwd, "D:\\My Projects\\deepseek-harness-0.1.7-rc.1");
  assert.equal(spec.binPath, "D:\\My Projects\\deepseek-harness-0.1.7-rc.1\\apps\\cli\\lib\\bin.js");
  assert.match(spec.packageSpec, /deepseek-ai\/deepseek-harness\.git#dsh-v0\.1\.7-rc\.1$/);
  assert.deepEqual(buildSourceCloneArgs(spec.cwd), [
    "clone", "--branch", "dsh-v0.1.7-rc.1", "--depth", "1",
    "https://github.com/deepseek-ai/deepseek-harness.git", spec.cwd,
  ]);
});

test("patched checkout uses the fork branch and canonical Windows drive casing", () => {
  const spec = buildPatchedSourceCheckoutSpec("d:\\My Projects", "win32");
  assert.equal(spec.cwd, "D:\\My Projects\\deepseek-harness-0.1.7-rc.1");
  assert.equal(spec.packageSpec, `${PATCHED_SOURCE_REPO}#${PATCHED_SOURCE_BRANCH}`);
  assert.deepEqual(spec.source, {
    repo: PATCHED_SOURCE_REPO,
    ref: PATCHED_SOURCE_BRANCH,
    revision: PATCHED_SOURCE_REVISION,
  });
  assert.deepEqual(buildSourceCloneArgs(spec.cwd, spec.source), [
    "clone", "--branch", PATCHED_SOURCE_BRANCH, "--depth", "1",
    PATCHED_SOURCE_REPO, spec.cwd,
  ]);
});

test("source repair forces workspace-link recreation only on Windows", () => {
  assert.deepEqual(buildSourceInstallArgs("win32"), ["install", "--frozen-lockfile", "--force"]);
  assert.deepEqual(buildSourceInstallArgs("darwin"), ["install", "--frozen-lockfile"]);
  assert.deepEqual(buildSourceInstallArgs("linux"), ["install", "--frozen-lockfile"]);
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

test("Windows pnpm resolver prefers managed JS and never returns script shims", () => {
  const node = "C:\\Program Files\\nodejs\\node.exe";
  const managed = "C:\\Code Storage\\managed-pnpm\\11.7.0\\node_modules\\pnpm\\bin\\pnpm.cjs";
  const global = "C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\pnpm\\bin\\pnpm.cjs";
  const launch = resolvePnpmLaunchSpec(
    node,
    managed,
    { Path: "C:\\Program Files\\nodejs;C:\\Users\\me\\AppData\\Roaming\\npm", APPDATA: "C:\\Users\\me\\AppData\\Roaming" },
    "win32",
    (candidate) => candidate === managed || candidate === global || candidate.endsWith("pnpm.cmd")
  );
  assert.deepEqual(launch, {
    command: node,
    argsPrefix: [managed],
    shell: false,
    resolvedPath: managed,
    runtimePath: "C:\\Code Storage\\managed-pnpm\\11.7.0\\node_modules\\.bin",
  });
});

test("Windows pnpm resolver supports npm-global JS and native exe fallbacks", () => {
  const node = "C:\\node\\node.exe";
  const global = "C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\pnpm\\bin\\pnpm.cjs";
  assert.equal(resolvePnpmLaunchSpec(
    node, "C:\\missing\\pnpm.cjs",
    { Path: "C:\\tools", APPDATA: "C:\\Users\\me\\AppData\\Roaming" },
    "win32", (candidate) => candidate === global
  ).resolvedPath, global);
  assert.equal(resolvePnpmLaunchSpec(
    node, "C:\\missing\\pnpm.cjs", { Path: "C:\\tools" }, "win32",
    (candidate) => candidate === "C:\\tools\\pnpm.exe"
  ).runtimePath, "C:\\tools");
  assert.equal(resolvePnpmLaunchSpec(
    node, "C:\\missing\\pnpm.cjs", { Path: "C:\\tools" }, "win32", () => false
  ), null);
});

test("POSIX pnpm resolver uses managed JS then direct executable fallback", () => {
  const managed = "/storage/managed-pnpm/11.7.0/node_modules/pnpm/bin/pnpm.cjs";
  const launch = resolvePnpmLaunchSpec("/node", managed, { PATH: "/usr/bin" }, "linux", (p) => p === managed);
  assert.equal(launch.command, "/node");
  assert.equal(launch.runtimePath, "/storage/managed-pnpm/11.7.0/node_modules/.bin");
  assert.deepEqual(resolvePnpmLaunchSpec("/node", managed, { PATH: "/usr/bin" }, "linux", () => false), {
    command: "pnpm", argsPrefix: [], shell: false, resolvedPath: "pnpm",
  });
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

test("pnpm compatibility accepts only the pinned tested version", () => {
  for (const version of ["11.7.0", "v11.7.0", " 11.7.0\n"]) assert.equal(isSupportedPnpmVersion(version), true);
  for (const version of [null, "", "11.6.0", "11.7.1", "12.0.0"]) assert.equal(isSupportedPnpmVersion(version), false);
});

test("managed pnpm validation invokes the JS entry through Node", () => {
  const calls = [];
  const p = {
    exists: () => true,
    run: (cmd, args, opts) => {
      calls.push({ cmd, args, opts });
      return { ok: true, stdout: "11.7.0\r\n" };
    },
  };
  assert.deepEqual(checkManagedPnpmInstall("C:\\pnpm.cjs", "C:\\node.exe", p), {
    valid: true, binPath: "C:\\pnpm.cjs", version: "11.7.0",
  });
  assert.deepEqual(calls[0], {
    cmd: "C:\\node.exe", args: ["C:\\pnpm.cjs", "--version"], opts: { timeoutMs: 5_000, shell: false },
  });
});

function probe(exists, result) {
  return {
    exists: () => exists,
    run: () => result,
  };
}

test("managed install validation rejects incomplete, failed, and wrong-version installs", () => {
  const bin = "/storage/managed-dsh/0.1.7-rc.1/node_modules/@deepseek-ai/dsh/lib/bin.js";
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
