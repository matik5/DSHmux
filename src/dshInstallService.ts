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
export const NODE_DOWNLOAD_URL = "https://nodejs.org/en/download";

export interface ManagedInstallSpec {
  command: "npm";
  args: string[];
  cwd: string;
  binPath: string;
  packageSpec: string;
}

export interface ManagedInstallCheck {
  valid: boolean;
  binPath: string;
  version: string | null;
}

export interface ManagedNpmLaunchSpec {
  command: string;
  args: string[];
  shell: false;
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
  };
}

/**
 * Preserve argv boundaries when starting npm. POSIX can execute the npm shim
 * directly; Windows `.cmd` shims require a shell, which would flatten and
 * reinterpret paths. Run npm's JS entry through the resolved Node executable
 * instead (or a native npm.exe shim when provided by a version manager).
 */
export function buildManagedNpmLaunchSpec(
  install: ManagedInstallSpec,
  nodePath: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  exists: (candidate: string) => boolean
): ManagedNpmLaunchSpec {
  if (platform !== "win32") {
    return { command: "npm", args: [...install.args], shell: false };
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

  for (const directory of directories) {
    const npmCli = path.win32.join(directory, "node_modules", "npm", "bin", "npm-cli.js");
    if (exists(npmCli)) {
      return { command: nodePath, args: [npmCli, ...install.args], shell: false };
    }
    const npmExe = path.win32.join(directory, "npm.exe");
    if (exists(npmExe)) {
      return { command: npmExe, args: [...install.args], shell: false };
    }
  }
  throw new Error("npm was detected, but its Windows executable could not be resolved safely");
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
