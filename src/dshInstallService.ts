// Pure primitives for the Doctor-managed DSH installation. This module never
// writes files or starts a process; production I/O lives in installService.ts.
import * as path from "node:path";
import { TESTED_DSH_VERSION } from "./versionCheck.js";

/** Official upstream pinned for DSHmux 0.4.7. */
export const TESTED_SOURCE_REPO = "https://github.com/deepseek-ai/deepseek-harness.git";
export const TESTED_SOURCE_TAG = "dsh-v0.1.5-rc.2";
export const TESTED_SOURCE_REVISION = "fb2c4b9e698e30edb738bca4cf0618587db7d203";
export const TESTED_SOURCE_TREE_URL =
  TESTED_SOURCE_REPO.replace(/\.git$/, "") + "/tree/" + TESTED_SOURCE_TAG;

export const DSH_PACKAGE_NAME = "@deepseek-ai/dsh";
export const TESTED_PNPM_VERSION = "11.7.0";
export const NODE_DOWNLOAD_URL = "https://nodejs.org/en/download";

export interface ManagedInstallSpec {
  command: "npm";
  args: string[];
  cwd: string;
  binPath: string;
  packageSpec: string;
  scope: "managed" | "global" | "source";
}

export interface ManagedInstallCheck {
  valid: boolean;
  binPath: string;
  version: string | null;
}

export interface ManagedNpmLaunchSpec {
  command: string;
  args: string[];
  shell: boolean;
}

/** Executable portion shared by Doctor's npm probe and the real installer. */
export interface NpmLaunchSpec {
  command: string;
  argsPrefix: string[];
  shell: boolean;
}

export interface ManagedInstallProbe {
  exists: (p: string) => boolean;
  run: (
    cmd: string,
    args: string[],
    opts: { timeoutMs: number; shell?: boolean }
  ) => { ok: boolean; stdout: string };
}

function pathApi(platform: NodeJS.Platform): typeof path.posix | typeof path.win32 {
  return platform === "win32" ? path.win32 : path.posix;
}

/** Versioned extension-owned prefix; old versions are deliberately retained. */
export function managedDshRoot(
  storageDir: string,
  platform: NodeJS.Platform = process.platform
): string {
  return pathApi(platform).join(storageDir, "managed-dsh", TESTED_DSH_VERSION);
}

/** Direct JS entry avoids global-prefix and Windows npm-shim ambiguity. */
export function managedDshBin(
  storageDir: string,
  platform: NodeJS.Platform = process.platform
): string {
  return pathApi(platform).join(
    managedDshRoot(storageDir, platform),
    "node_modules",
    "@deepseek-ai",
    "dsh",
    "lib",
    "bin.js"
  );
}

/** Structured argv for a pinned, non-global, extension-managed npm install. */
export function buildManagedInstallSpec(
  storageDir: string,
  platform: NodeJS.Platform = process.platform
): ManagedInstallSpec {
  const cwd = managedDshRoot(storageDir, platform);
  const packageSpec = `${DSH_PACKAGE_NAME}@${TESTED_DSH_VERSION}`;
  return {
    command: "npm",
    args: [
      "install",
      "--prefix",
      cwd,
      "--no-save",
      "--no-audit",
      "--no-fund",
      packageSpec,
    ],
    cwd,
    binPath: managedDshBin(storageDir, platform),
    packageSpec,
    scope: "managed",
  };
}

/** Explicit global alternative selected by the user in Doctor. */
export function buildGlobalInstallSpec(cwd: string): ManagedInstallSpec {
  const packageSpec = `${DSH_PACKAGE_NAME}@${TESTED_DSH_VERSION}`;
  return {
    command: "npm",
    args: ["install", "--global", "--no-audit", "--no-fund", packageSpec],
    cwd,
    binPath: "dsh",
    packageSpec,
    scope: "global",
  };
}

/** Official checkout selected through Change…; the chosen directory is a parent. */
export function buildSourceCheckoutSpec(
  parentDir: string,
  platform: NodeJS.Platform = process.platform
): ManagedInstallSpec {
  const api = pathApi(platform);
  const cwd = api.join(parentDir, "deepseek-harness");
  return {
    command: "npm",
    args: [],
    cwd,
    binPath: api.join(cwd, "apps", "cli", "lib", "bin.js"),
    packageSpec: `${TESTED_SOURCE_REPO}#${TESTED_SOURCE_TAG}`,
    scope: "source",
  };
}

export function buildSourceCloneArgs(targetDir: string): string[] {
  return [
    "clone", "--branch", TESTED_SOURCE_TAG, "--depth", "1",
    TESTED_SOURCE_REPO, targetDir,
  ];
}

export function buildPnpmExecArgs(pnpmArgs: string[]): string[] {
  return [
    "exec", "--yes", `--package=pnpm@${TESTED_PNPM_VERSION}`,
    "--", "pnpm", ...pnpmArgs,
  ];
}

/**
 * Preserve argv boundaries when starting npm. POSIX can execute the npm shim
 * directly; Windows `.cmd` shims require a shell, which would flatten and
 * reinterpret paths. Run npm's JS entry through the resolved Node executable
 * instead (or a native npm.exe shim when provided by a version manager).
 */
export function resolveNpmLaunchSpec(
  nodePath: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  exists: (candidate: string) => boolean
): NpmLaunchSpec {
  if (platform !== "win32") {
    return { command: "npm", argsPrefix: [], shell: false };
  }

  const pathValue = Object.entries(env)
    .find(([key]) => key.toLowerCase() === "path")?.[1] ?? "";
  const directories: string[] = [];
  const addDirectory = (candidate: string): void => {
    const value = candidate.trim().replace(/^"|"$/g, "");
    if (!value) return;
    if (!directories.some((entry) => entry.toLowerCase() === value.toLowerCase())) {
      directories.push(value);
    }
  };
  if (path.win32.isAbsolute(nodePath)) addDirectory(path.win32.dirname(nodePath));
  for (const entry of pathValue.split(";")) addDirectory(entry);

  // A user-prefix npm upgrade can place npm itself below %APPDATA% even when
  // node.exe remains in Program Files. Include that direct JS entry without
  // invoking a .cmd shim through a shell.
  const appData = Object.entries(env)
    .find(([key]) => key.toLowerCase() === "appdata")?.[1];
  const npmCliCandidates: string[] = [];
  if (appData) {
    npmCliCandidates.push(path.win32.join(appData, "npm", "node_modules", "npm", "bin", "npm-cli.js"));
  }

  for (const directory of directories) {
    npmCliCandidates.push(path.win32.join(directory, "node_modules", "npm", "bin", "npm-cli.js"));
  }
  for (const npmCli of npmCliCandidates) {
    if (exists(npmCli)) return { command: nodePath, argsPrefix: [npmCli], shell: false };
  }
  for (const directory of directories) {
    const npmExe = path.win32.join(directory, "npm.exe");
    if (exists(npmExe)) {
      return { command: npmExe, argsPrefix: [], shell: false };
    }
  }
  throw new Error("npm was detected, but its Windows executable could not be resolved safely");
}

export function buildManagedNpmLaunchSpec(
  install: ManagedInstallSpec,
  nodePath: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  exists: (candidate: string) => boolean
): ManagedNpmLaunchSpec {
  const npm = resolveNpmLaunchSpec(nodePath, env, platform, exists);
  return {
    command: npm.command,
    args: [...npm.argsPrefix, ...install.args],
    shell: npm.shell,
  };
}

/** Official 0.1.5-rc.2 engine range: ^22.19.0 OR >=24.0.0 (Node 23 excluded). */
export function isSupportedNodeVersion(version: string | null | undefined): boolean {
  if (!version) return false;
  const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major === 22) return minor >= 19;
  return major >= 24;
}

/** Verify an installed managed CLI before the manager or Doctor trusts it. */
export function checkManagedInstall(
  binPath: string,
  nodePath: string,
  platform: NodeJS.Platform,
  probe: ManagedInstallProbe
): ManagedInstallCheck {
  if (!probe.exists(binPath)) return { valid: false, binPath, version: null };
  const result = probe.run(nodePath, [binPath, "--version"], {
    timeoutMs: 5_000,
    shell: platform === "win32" && !/[\\/]node(?:\.exe)?$/i.test(nodePath),
  });
  const version = result.ok ? result.stdout.trim().split(/\r?\n/)[0] || null : null;
  return {
    valid: version === TESTED_DSH_VERSION,
    binPath,
    version,
  };
}
