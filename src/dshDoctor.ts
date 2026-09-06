// DSH Doctor (04-install R1): a read-only, bounded environment report for the
// workspace extension host. It answers "what is ready, what is missing, what
// should I run?" without writing anything and without launching a DSH server.
//
// Design (solution.md):
//  - ALL filesystem/process I/O goes through the DoctorProbe seams, so the
//    classification logic is pure and unit-testable on any host.
//  - Discovery REUSES the serverManager helpers (resolveNodeExecutable,
//    resolveDshPath, resolveDshVersion) — there is exactly one
//    path-discovery algorithm. The helpers are reached through probe methods
//    so tests stay deterministic; realDoctorProbe wires the real ones.
//  - Probes are bounded by short timeouts (5 s) and never touch the network
//    except that `dsh --version` / `npm --version` are local spawns.
import * as fs from "node:fs";
import * as os from "node:os";
import { spawnSync } from "node:child_process";
import {
  resolveConfiguredDshPath,
  resolveDshPath,
  resolveDshVersion,
  resolveNodeExecutable,
  spawnEnvironment,
  spawnSpec,
} from "./serverManager.js";
import { dshCompatibility, type DshCompatibility } from "./versionCheck.js";

/** How DSH was installed (inferred from the resolved binary path). */
export type DoctorInstallType = "npm-global" | "npx-cache" | "source" | "custom" | "none";

/** One actionable classification for the whole environment. */
export type DoctorState =
  | "ready"
  | "node-missing"
  | "dsh-missing"
  | "dsh-unrunnable"
  | "source-prerequisites-missing";

export interface ToolInfo {
  available: boolean;
  version?: string;
}

export interface DoctorReport {
  /** Workspace host identity (in remote windows this is the remote host). */
  host: { platform: string; arch: string; label: string };
  node: { available: boolean; path: string | null; version: string | null; runnable: boolean };
  npm: ToolInfo;
  npx: ToolInfo;
  /** Required for the primary (patched source clone) install path. */
  git: ToolInfo;
  /** Required for the primary (patched source clone) install path. */
  pnpm: ToolInfo;
  dsh: {
    /**
     * `dshmux.dshPath` as configured (empty/missing → undefined); a
     * source-checkout directory is shown resolved to its built CLI entry.
     */
    configuredPath: string | undefined;
    /** Whether the configured path exists on THIS host (false = stale). */
    configuredValid: boolean;
    resolvedPath: string | null;
    /** Candidate paths checked, redacted (home → ~). */
    tried: string[];
    version: string | null;
    compatibility: DshCompatibility;
    installType: DoctorInstallType;
  };
  state: DoctorState;
  /** Human-readable warning lines (localized by the caller's i18n layer). */
  warnings: string[];
}

export interface DoctorRunOpts {
  timeoutMs: number;
  shell?: boolean;
}

export interface DoctorRunResult {
  ok: boolean;
  stdout: string;
}

/**
 * Injectable I/O seams. Tests provide a stub; `realDoctorProbe()` provides the
 * production implementation. runDoctor() performs no I/O outside these.
 */
export interface DoctorProbe {
  platform: NodeJS.Platform;
  arch: string;
  home: string;
  execPath: string;
  env: NodeJS.ProcessEnv;
  /** "local" or e.g. "remote-ssh" (from the VS Code layer, never the UI OS). */
  hostLabel: string;
  /** Configured `dshmux.dshPath`, if any (non-empty). */
  configuredDshPath: string | undefined;
  /** Bounded existence check (fs.existsSync semantics). */
  exists: (p: string) => boolean;
  /** Real path (symlink-resolved) or null when it cannot be resolved. */
  realPath: (p: string) => string | null;
  /**
   * Bounded local spawn. `ok` = exit code 0; `stdout` trimmed. The real
   * implementation runs with the Node runtime PATH and the given timeout.
   */
  run: (cmd: string, args: string[], opts: DoctorRunOpts) => DoctorRunResult;
  /** `dsh <bin> --version` (bounded, null on failure) — real: resolveDshVersion. */
  dshVersion: (bin: string) => string | null;
  /** DSH discovery (redacted `tried`) — real: resolveDshPath. */
  resolveDsh: (home: string, platform: NodeJS.Platform) => { path: string | null; tried: string[] };
  /** Node discovery — real: resolveNodeExecutable (may return a bare name). */
  resolveNode: (
    platform: NodeJS.Platform,
    execPath: string,
    home: string,
    env: NodeJS.ProcessEnv
  ) => string;
}

const PROBE_TIMEOUT_MS = 5_000;

/** Production probe: real fs + bounded spawnSync with the Node runtime PATH. */
export function realDoctorProbe(
  hostLabel: string,
  configuredDshPath: string | undefined
): DoctorProbe {
  const env = process.env;
  const node = resolveNodeExecutable(process.platform, process.execPath, os.homedir(), env);
  // Give every probe the same PATH the server manager would give its children,
  // so `npm`/`npx`/`git`/`pnpm` resolve the same way a DSH launch would.
  const spec = spawnSpec(node, process.platform, process.execPath, os.homedir(), env);
  const childEnv = spawnEnvironment(spec, env, process.platform);
  return {
    platform: process.platform,
    arch: process.arch,
    home: os.homedir(),
    execPath: process.execPath,
    env: childEnv,
    hostLabel,
    configuredDshPath,
    exists: (p) => fs.existsSync(p),
    realPath: (p) => {
      try {
        return fs.realpathSync(p);
      } catch {
        return null;
      }
    },
    run: (cmd, args, opts) => {
      try {
        const res = spawnSync(cmd, args, {
          encoding: "utf8",
          env: childEnv,
          timeout: opts.timeoutMs,
          shell: opts.shell ?? (process.platform === "win32"),
          windowsHide: true,
        });
        return { ok: res.status === 0, stdout: (res.stdout ?? "").trim() };
      } catch {
        return { ok: false, stdout: "" };
      }
    },
    dshVersion: (bin) => resolveDshVersion(bin),
    resolveDsh: (home, platform) => resolveDshPath(home, platform),
    resolveNode: (platform, execPath, home, e) => resolveNodeExecutable(platform, execPath, home, e),
  };
}

/** Redact a path the way resolveDshPath redacts `tried` (home → ~). */
export function redactPath(p: string, home: string): string {
  return p.replace(home, "~");
}

/**
 * Infer how DSH was installed from the resolved binary path. Pure string
 * rules first (the same path features versionCheck.upgradeCommandFor uses),
 * then one bounded symlink check so an npm-LINKED source checkout is
 * recognized as `source` (a global `npm link` resolves into the checkout).
 */
export function classifyInstallType(bin: string | null, probe: DoctorProbe): DoctorInstallType {
  if (!bin) return "none";
  const p = bin.replace(/\\/g, "/");
  if (p.includes("/_npx/")) return "npx-cache";
  if (p.includes("/apps/cli/lib/bin.js")) return "source";
  if (p.includes("/node_modules/@deepseek-ai/")) return "npm-global";
  // Windows npm shims are .cmd files in the prefix bin dir — not symlinks, so
  // realpath cannot resolve them into node_modules. Recognize the two standard
  // npm prefix locations (roaming user prefix; default install prefix).
  if (
    probe.platform === "win32" &&
    (p.includes("/AppData/Roaming/npm/") || p.includes("/Program Files/nodejs/"))
  ) {
    return "npm-global";
  }
  // POSIX npm shims and `npm link` registrations are symlinks: resolve the
  // link and classify by what it points at (a source checkout's CLI entry, or
  // the installed npm package).
  const real = probe.realPath(bin);
  if (real) {
    const rp = real.replace(/\\/g, "/");
    if (rp.includes("/apps/cli/lib/bin.js")) return "source";
    if (rp.includes("/node_modules/@deepseek-ai/")) return "npm-global";
  }
  return "custom";
}

function firstVersionLine(stdout: string): string {
  return stdout.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
}

/**
 * Run the full report. Classification (solution.md rules):
 *  - node not runnable                    → node-missing
 *  - dsh missing; git|pnpm also missing   → source-prerequisites-missing
 *  - dsh missing                          → dsh-missing
 *  - dsh resolved but `--version` fails   → dsh-unrunnable
 *  - otherwise                            → ready (untested version = warning only)
 * A stale configured path, an untested version, and missing git/pnpm (with
 * dsh present) are warnings, never state changes.
 */
export function runDoctor(probe: DoctorProbe): DoctorReport {
  const warnings: string[] = [];

  // --- Node -----------------------------------------------------------------
  const nodePath = probe.resolveNode(probe.platform, probe.execPath, probe.home, probe.env);
  const isAbsolute = nodePath.includes("/") || /^[A-Za-z]:[\\/]/.test(nodePath);
  const nodeAbs = isAbsolute ? nodePath : null;
  const nodeProbe = probe.run(nodePath, ["--version"], { timeoutMs: PROBE_TIMEOUT_MS });
  const nodeVersion = nodeProbe.ok ? nodeProbe.stdout : null;
  const node: DoctorReport["node"] = {
    available: (nodeAbs !== null && probe.exists(nodeAbs)) || nodeProbe.ok,
    path: nodeAbs,
    version: nodeVersion,
    runnable: nodeProbe.ok,
  };

  // --- npm / npx (only meaningful when Node runs) ----------------------------
  const probeTool = (cmd: string): ToolInfo => {
    if (!node.runnable) return { available: false };
    const res = probe.run(cmd, ["--version"], { timeoutMs: PROBE_TIMEOUT_MS, shell: probe.platform === "win32" });
    return res.ok ? { available: true, version: firstVersionLine(res.stdout) } : { available: false };
  };
  const npm = probeTool("npm");
  const npx = probeTool("npx");

  // --- git / pnpm (prerequisites of the primary source path) ------------------
  const git = probeTool("git");
  const pnpm = probeTool("pnpm");

  // --- DSH (reuse the single discovery algorithm) ------------------------------
  const configured = probe.configuredDshPath?.trim() || undefined;
  // A source-checkout directory is resolved to its built CLI entry — the same
  // rule as the launch path (resolveStartBin → resolveConfiguredDshPath).
  const configuredPath =
    configured !== undefined ? resolveConfiguredDshPath(configured) : undefined;
  const configuredValid = configuredPath !== undefined && probe.exists(configuredPath);
  const resolved = configuredValid
    ? { path: configuredPath, tried: [configuredPath] }
    : probe.resolveDsh(probe.home, probe.platform);
  if (configured !== undefined && !configuredValid && resolved.path !== configuredPath) {
    warnings.push("stale-configured-path");
  }
  const version = resolved.path ? probe.dshVersion(resolved.path) : null;
  const dsh: DoctorReport["dsh"] = {
    configuredPath: configuredPath,
    configuredValid,
    resolvedPath: resolved.path,
    tried: resolved.tried.map((t) => redactPath(t, probe.home)),
    version,
    compatibility: dshCompatibility(version ?? undefined),
    installType: classifyInstallType(resolved.path, probe),
  };

  // --- State -------------------------------------------------------------------
  let state: DoctorState;
  if (!node.runnable) {
    state = "node-missing";
  } else if (resolved.path === null) {
    state = git.available && pnpm.available ? "dsh-missing" : "source-prerequisites-missing";
  } else if (version === null) {
    state = "dsh-unrunnable";
  } else {
    state = "ready";
  }
  if (state === "ready" && dsh.compatibility !== "tested") {
    warnings.push(`untested-version:${dsh.compatibility}`);
  }
  if (state === "ready" && (!git.available || !pnpm.available)) {
    // Warning only: the user already has a working DSH; source path is blocked.
    warnings.push("source-tools-missing");
  }

  return {
    host: { platform: probe.platform, arch: probe.arch, label: probe.hostLabel },
    node,
    npm,
    npx,
    git,
    pnpm,
    dsh,
    state,
    warnings,
  };
}
