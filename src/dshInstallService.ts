// DSH install plans (04-install R2/R3): pure command builders — they produce
// the EXACT text the install service prefills into a terminal. Nothing here
// executes a command or touches the filesystem; I/O (checkout validation)
// goes through the DoctorProbe seams from dshDoctor.ts.
import { TESTED_DSH_VERSION } from "./versionCheck.js";
import type { DoctorProbe } from "./dshDoctor.js";

/**
 * Tested source (R3, PRIMARY recommendation). The matik5 fork carries the
 * two compatibility patches missing from mainline (see
 * `doc/dsh-patches/README.md`): the JPEG attachment projection and the
 * pi-ai compaction wire marker. Branch tip = tag `dsh-v0.1.2-rc.1`
 * (`a66e470204`) + the two patch commits.
 */
export const TESTED_SOURCE_REPO = "https://github.com/matik5/deepseek-harness.git";
export const TESTED_SOURCE_BRANCH = "matik/dsh-patches-0.1.2-rc.1";
export const TESTED_SOURCE_REVISION = "07bca197e2";
/** R6: the branch page the setup panel links to (derived, not a new string). */
export const TESTED_SOURCE_TREE_URL =
  TESTED_SOURCE_REPO.replace(/\.git$/, "") + "/tree/" + TESTED_SOURCE_BRANCH;

/** Official download pages opened for missing prerequisites (openExternal). */
export const NODE_DOWNLOAD_URL = "https://nodejs.org/en/download";
export const GIT_DOWNLOAD_URL = "https://git-scm.com/downloads";
export const PNPM_INSTALL_URL = "https://pnpm.io/installation";

/** CLI entry inside a source checkout. */
export const CHECKOUT_BIN_REL = "apps/cli/lib/bin.js";

/** One prefilled terminal command with i18n label/purpose keys. */
export interface InstallCommand {
  label: string; // i18n key
  command: string; // exact text to prefill (NEVER auto-executed)
  purpose: string; // i18n key (one-line plain-language reason)
}

export interface CheckoutCheck {
  valid: boolean;
  binPath: string | null; // <checkout>/apps/cli/lib/bin.js
  version: string | null; // from `node <binPath> --version`
  dirty: boolean; // `git status --porcelain` non-empty
  onPatchedBranch: boolean | null; // null: not a git repo
}

const CHECK_TIMEOUT_MS = 5_000;

/** Wrap a path in double quotes (cmd quoting; path backslashes untouched). */
function quote(p: string): string {
  return `"${p}"`;
}

/** Platform-pure path join for a trailing relative segment. */
function joinPath(dir: string, rel: string, platform: NodeJS.Platform): string {
  const sep = platform === "win32" ? "\\" : "/";
  const base = dir.replace(/[\\/]+$/, "");
  const parts = rel.split("/");
  return `${base}${sep}${parts.join(sep)}`;
}

/**
 * R3 primary path: clone the patched branch and build the workspace.
 * Four user-confirmed steps (no hidden multi-command script — req R3);
 * every path argument is quoted.
 */
export function buildSourceClonePlan(
  parentDir: string,
  platform: NodeJS.Platform
): InstallCommand[] {
  const target = joinPath(parentDir, "deepseek-harness", platform);
  return [
    {
      label: "install.cloneStep1",
      command: `git clone --branch ${TESTED_SOURCE_BRANCH} ${TESTED_SOURCE_REPO} ${quote(target)}`,
      purpose: "install.cloneStep1.purpose",
    },
    {
      label: "install.cloneStep2",
      command: `cd ${quote(target)}`,
      purpose: "install.cloneStep2.purpose",
    },
    {
      label: "install.cloneStep3",
      command: "pnpm install",
      purpose: "install.cloneStep3.purpose",
    },
    {
      label: "install.cloneStep4",
      command: "pnpm build",
      purpose: "install.cloneStep4.purpose",
    },
  ];
}

/** R2 alternative (mainline, without the two compatibility patches). */
export function buildNpmPlan(): InstallCommand {
  return {
    label: "install.npmCommand",
    command: `npm i -g @deepseek-ai/dsh@${TESTED_DSH_VERSION}`,
    purpose: "install.npmPurpose",
  };
}

/** R2 alternative: prime the npx cache (mainline, without the patches). */
export function buildNpxPlan(): InstallCommand {
  return {
    label: "install.npxCommand",
    command: `npx -y @deepseek-ai/dsh@${TESTED_DSH_VERSION} --version`,
    purpose: "install.npxPurpose",
  };
}

/**
 * R3 existing-checkout validation (read-only). Pure given the probe: the
 * checkout is NEVER modified; it is only reported (dirty / wrong branch are
 * warnings, never blockers — req R3).
 */
export function checkExistingCheckout(
  checkoutDir: string,
  nodePath: string,
  probe: DoctorProbe
): CheckoutCheck {
  const binPath = joinPath(checkoutDir, CHECKOUT_BIN_REL, probe.platform);
  const binExists = probe.exists(binPath);
  let version: string | null = null;
  if (binExists) {
    const res = probe.run(nodePath, [binPath, "--version"], { timeoutMs: CHECK_TIMEOUT_MS });
    if (res.ok && res.stdout.trim() !== "") version = res.stdout.trim();
  }
  const status = probe.run("git", ["-C", checkoutDir, "status", "--porcelain"], {
    timeoutMs: CHECK_TIMEOUT_MS,
  });
  const dirty = status.ok && status.stdout.trim() !== "";
  let onPatchedBranch: boolean | null = null;
  const branch = probe.run("git", ["-C", checkoutDir, "rev-parse", "--abbrev-ref", "HEAD"], {
    timeoutMs: CHECK_TIMEOUT_MS,
  });
  if (branch.ok) onPatchedBranch = branch.stdout.trim() === TESTED_SOURCE_BRANCH;
  return {
    valid: version !== null,
    binPath: binExists ? binPath : null,
    version,
    dirty,
    onPatchedBranch,
  };
}
