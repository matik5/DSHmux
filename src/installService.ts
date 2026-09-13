// VS Code layer for DSH Doctor and its extension-managed DSH repair.
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import * as vscode from "vscode";
import {
  realDoctorProbe,
  redactPath,
  runDoctor,
  type DoctorInstallType,
  type DoctorReport,
  type DoctorState,
} from "./dshDoctor.js";
import {
  NODE_DOWNLOAD_URL,
  TESTED_SOURCE_REPO,
  TESTED_SOURCE_REVISION,
  buildGlobalInstallSpec,
  buildManagedInstallSpec,
  buildManagedNpmLaunchSpec,
  buildSourceCheckoutSpec,
  buildSourceCloneArgs,
  buildPnpmExecArgs,
  checkManagedInstall,
  managedDshBin,
  resolveNpmLaunchSpec,
  type ManagedNpmLaunchSpec,
  type ManagedInstallSpec,
} from "./dshInstallService.js";
import { configuredDshBin } from "./configuration.js";
import {
  resolveNodeExecutable,
  resolveDshVersion,
  resolveDshPath,
  spawnEnvironment,
  type DshSpawnSpec,
} from "./serverManager.js";
import { t } from "./i18n.js";
import type { I18nKey } from "./i18nStrings.js";
import { TESTED_DSH_VERSION } from "./versionCheck.js";

const OUTPUT_LIMIT = 64 * 1024;
const MANAGED_STORAGE_KEY = "dsh.managedStorageDir";
const SOURCE_CHECKOUT_KEY = "dsh.sourceCheckoutBin";

export function hostLabel(): string {
  return vscode.env.remoteName ? `remote-${vscode.env.remoteName}` : "local";
}

export function managedStorageDirForParent(
  parent: string,
  platform: NodeJS.Platform = process.platform
): string {
  return (platform === "win32" ? path.win32 : path.posix).join(parent, ".dshmux");
}

export function managedStorageForContext(context: vscode.ExtensionContext): string {
  const remembered = context.workspaceState.get<string>(MANAGED_STORAGE_KEY)?.trim();
  if (remembered) return remembered;
  const parent = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
  return managedStorageDirForParent(parent, process.platform);
}

/** Current user-selected location followed by the pre-0.4.7 storage fallback. */
export function managedBinsForContext(context: vscode.ExtensionContext): string[] {
  const current = managedDshBin(managedStorageForContext(context), process.platform);
  const legacy = managedDshBin(context.globalStorageUri.fsPath, process.platform);
  const source = context.workspaceState.get<string>(SOURCE_CHECKOUT_KEY)?.trim();
  return [source, current, legacy]
    .filter((candidate): candidate is string => Boolean(candidate))
    .filter((candidate, index, all) =>
      all.findIndex((other) => other.toLowerCase() === candidate.toLowerCase()) === index
    );
}

export function managedBinForContext(context: vscode.ExtensionContext): string {
  return managedBinsForContext(context)[0];
}

/** Fresh workspace-host report with the same managed candidate used at launch. */
export function runDoctorForLauncher(context: vscode.ExtensionContext): DoctorReport {
  const candidates = managedBinsForContext(context);
  const managed = candidates.find(
    (candidate) => resolveDshVersion(candidate) === TESTED_DSH_VERSION
  ) ?? candidates[0];
  return runDoctor(realDoctorProbe(hostLabel(), configuredDshBin(), managed));
}

type CheckIcon = "ok" | "warn" | "fail";
interface CheckItem extends vscode.QuickPickItem { action?: string; }

function checkItem(icon: CheckIcon, label: string, detail?: string, action?: string): CheckItem {
  const mark = icon === "ok" ? "✓ " : icon === "warn" ? "⚠ " : "✗ ";
  return { label: `${mark}${label}`, detail, alwaysShow: true, action };
}

function stateKey(state: DoctorState): I18nKey {
  switch (state) {
    case "ready": return "doctor.state.ready";
    case "node-missing": return "doctor.state.nodeMissing";
    case "node-unsupported": return "doctor.state.nodeUnsupported";
    case "npm-missing": return "doctor.state.npmMissing";
    case "dsh-missing": return "doctor.state.dshMissing";
    case "dsh-unrunnable": return "doctor.state.dshUnrunnable";
  }
}

function compatKey(state: "tested" | "older" | "newer" | "unknown"): I18nKey {
  return `doctor.compat.${state}`;
}

function installTypeKey(state: Exclude<DoctorInstallType, "none">): I18nKey {
  switch (state) {
    case "managed": return "doctor.installType.managed";
    case "npm-global": return "doctor.installType.npmGlobal";
    case "npx-cache": return "doctor.installType.npxCache";
    case "source": return "doctor.installType.source";
    case "custom": return "doctor.installType.custom";
  }
}

function warningText(warning: string): string {
  if (warning === "stale-configured-path") return t("doctor.staleConfigWarning");
  if (warning.startsWith("untested-version:")) {
    const compat = warning.slice("untested-version:".length) as "older" | "newer" | "unknown";
    return t("doctor.untestedWarning", { compat: t(compatKey(compat)) });
  }
  return warning;
}

export function doctorWarningTexts(report: DoctorReport): string[] {
  return report.warnings.map(warningText);
}

export function doctorActionFor(report: DoctorReport): "repair" | "node" | "npm" | null {
  if (report.state === "ready") return null;
  if (!report.node.runnable || !report.node.supported) return "node";
  if (!report.npm.available) return "npm";
  return "repair";
}

export interface ManagedInstallRunResult {
  ok: boolean;
  cancelled: boolean;
  exitCode: number | null;
}

export interface ManagedInstallRuntime {
  mkdir: (dir: string) => Promise<void>;
  run: (
    spec: ManagedInstallSpec,
    token: vscode.CancellationToken,
    onOutput: (text: string) => void
  ) => Promise<ManagedInstallRunResult>;
  validate: (spec: ManagedInstallSpec) => { valid: boolean; version: string | null };
}

export interface PreparedManagedNpmLaunch extends ManagedNpmLaunchSpec {
  env: NodeJS.ProcessEnv;
}

/** Use the same resolved Node directory Doctor used when locating npm. */
export function prepareManagedNpmLaunch(
  install: ManagedInstallSpec,
  nodeSpec: DshSpawnSpec,
  baseEnv: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  exists: (candidate: string) => boolean
): PreparedManagedNpmLaunch {
  const env = spawnEnvironment(nodeSpec, baseEnv, platform);
  return {
    ...buildManagedNpmLaunchSpec(install, nodeSpec.command, env, platform, exists),
    env,
  };
}

export function waitForManagedInstallChild(
  child: ChildProcess,
  token: vscode.CancellationToken,
  onOutput: (text: string) => void
): Promise<ManagedInstallRunResult> {
  return new Promise((resolve) => {
    let settled = false;
    let cancelled = false;
    let cancellation: vscode.Disposable | undefined;
    const finish = (result: ManagedInstallRunResult): void => {
      if (settled) return;
      settled = true;
      cancellation?.dispose();
      resolve(result);
    };
    child.stdout?.on("data", (chunk: Buffer) => onOutput(chunk.toString()));
    child.stderr?.on("data", (chunk: Buffer) => onOutput(chunk.toString()));
    child.on("error", (err) => {
      onOutput(`${err.message}\n`);
      finish({ ok: false, cancelled, exitCode: null });
    });
    child.on("close", (code) => {
      finish({ ok: !cancelled && code === 0, cancelled, exitCode: code });
    });
    const cancel = (): void => {
      if (cancelled || settled) return;
      cancelled = true;
      try {
        child.kill();
      } catch (err) {
        onOutput(`${err instanceof Error ? err.message : String(err)}\n`);
      }
    };
    cancellation = token.onCancellationRequested(cancel);
    if (settled) cancellation.dispose();
    if (token.isCancellationRequested) cancel();
  });
}

async function runChild(
  spec: ManagedInstallSpec,
  token: vscode.CancellationToken,
  onOutput: (text: string) => void
): Promise<ManagedInstallRunResult> {
  if (token.isCancellationRequested) {
    return { ok: false, cancelled: true, exitCode: null };
  }
  try {
    const node = resolveNodeExecutable(
      process.platform,
      process.execPath,
      os.homedir(),
      process.env,
      false
    );
    const pathApi = process.platform === "win32" ? path.win32 : path.posix;
    const nodeSpec: DshSpawnSpec = {
      command: node,
      args: [],
      shell: false,
      runtimePath: pathApi.isAbsolute(node) ? pathApi.dirname(node) : undefined,
    };
    const env = spawnEnvironment(nodeSpec, process.env, process.platform);
    const npm = resolveNpmLaunchSpec(nodeSpec.command, env, process.platform, fs.existsSync);
    const launch = spec.scope === "source"
      ? null
      : {
          command: npm.command,
          args: [...npm.argsPrefix, ...spec.args],
          shell: npm.shell,
          env,
        };
    onOutput(`Node: ${nodeSpec.command}\n`);
    onOutput(`npm: ${npm.command}${npm.argsPrefix[0] ? ` ${npm.argsPrefix[0]}` : ""}\n`);
    onOutput(`Destination: ${spec.scope === "global" ? "global npm prefix" : spec.cwd}\n\n`);
    if (spec.scope === "source") {
      const runStep = async (
        command: string,
        args: string[],
        cwd: string,
        capture: boolean = false
      ): Promise<ManagedInstallRunResult & { output: string }> => {
        onOutput(`> ${command} ${args.join(" ")}\n`);
        let output = "";
        const child = spawn(command, args, {
          cwd,
          env,
          shell: false,
          windowsHide: true,
        });
        const result = await waitForManagedInstallChild(child, token, (value) => {
          if (capture) output += value;
          onOutput(value);
        });
        return { ...result, output };
      };
      const gitDir = path.join(spec.cwd, ".git");
      if (!fs.existsSync(gitDir)) {
        const entries = await fs.promises.readdir(spec.cwd);
        if (entries.length > 0) throw new Error(`Checkout destination is not empty: ${spec.cwd}`);
        const clone = await runStep(
          "git",
          buildSourceCloneArgs(spec.cwd),
          path.dirname(spec.cwd)
        );
        if (!clone.ok) return clone;
      }
      const remote = await runStep(
        "git",
        ["-C", spec.cwd, "remote", "get-url", "origin"],
        spec.cwd,
        true
      );
      if (!remote.ok) return remote;
      const normalizedRemote = remote.output.trim().replace(/^git\+/, "").replace(/\.git$/, "").toLowerCase();
      if (normalizedRemote !== TESTED_SOURCE_REPO.replace(/\.git$/, "").toLowerCase()) {
        throw new Error(`Existing checkout has an unexpected origin: ${remote.output.trim()}`);
      }
      const revision = await runStep(
        "git",
        ["-C", spec.cwd, "rev-parse", "HEAD"],
        spec.cwd,
        true
      );
      if (!revision.ok) return revision;
      if (revision.output.trim() !== TESTED_SOURCE_REVISION) {
        throw new Error(`Existing checkout is not ${TESTED_SOURCE_REVISION}`);
      }
      for (const pnpmArgs of [
        ["install", "--frozen-lockfile"],
        ["build"],
      ]) {
        const result = await runStep(
          npm.command,
          [...npm.argsPrefix, ...buildPnpmExecArgs(pnpmArgs)],
          spec.cwd
        );
        if (!result.ok) return result;
      }
      return { ok: true, cancelled: false, exitCode: 0 };
    }
    if (!launch) throw new Error("npm launch was not prepared");
    const child = spawn(launch.command, launch.args, {
      cwd: spec.cwd,
      env: launch.env,
      shell: launch.shell,
      windowsHide: true,
    });
    return waitForManagedInstallChild(child, token, onOutput);
  } catch (err) {
    onOutput(`${err instanceof Error ? err.message : String(err)}\n`);
    return { ok: false, cancelled: false, exitCode: null };
  }
}

function realInstallRuntime(): ManagedInstallRuntime {
  return {
    mkdir: (dir) => fs.promises.mkdir(dir, { recursive: true }).then(() => undefined),
    run: runChild,
    validate: (spec) => {
      const node = resolveNodeExecutable(
        process.platform,
        process.execPath,
        os.homedir(),
        process.env,
        false
      );
      const probe = realDoctorProbe(hostLabel(), configuredDshBin(), spec.binPath);
      if (spec.scope === "global") {
        const binPath = resolveDshPath(os.homedir(), process.platform).path;
        const version = binPath ? resolveDshVersion(binPath) : null;
        return { valid: version === TESTED_DSH_VERSION, version };
      }
      const result = checkManagedInstall(spec.binPath, node, process.platform, probe);
      return { valid: result.valid, version: result.version };
    },
  };
}

let doctorOutput: vscode.OutputChannel | undefined;
function outputChannel(): vscode.OutputChannel {
  doctorOutput ??= vscode.window.createOutputChannel("DSHmux Doctor");
  return doctorOutput;
}

interface ChosenManagedInstall {
  spec: ManagedInstallSpec;
  storageDir?: string;
  sourceBin?: string;
}

/** Show the exact destination, allow changing its parent, and use native Cancel. */
export async function chooseManagedInstall(
  context: vscode.ExtensionContext
): Promise<ChosenManagedInstall | null> {
  let storageDir = managedStorageForContext(context);
  let sourceParent: string | undefined;
  const installGlobal = t("install.globalRun");
  const installHere = t("install.localRun");
  const change = t("install.changeLocation");
  while (true) {
    const spec = sourceParent
      ? buildSourceCheckoutSpec(sourceParent, process.platform)
      : buildManagedInstallSpec(storageDir, process.platform);
    const choice = await vscode.window.showInformationMessage(
      t("install.managedConfirm", { package: spec.packageSpec, path: spec.cwd }),
      { modal: true },
      installGlobal,
      installHere,
      change
    );
    if (choice === installGlobal) {
      const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
      return { spec: buildGlobalInstallSpec(cwd) };
    }
    if (choice === installHere) {
      return spec.scope === "source"
        ? { spec, sourceBin: spec.binPath }
        : { spec, storageDir };
    }
    if (choice !== change) return null;

    const selected = await vscode.window.showOpenDialog({
      title: t("install.selectLocation"),
      defaultUri: vscode.Uri.file(sourceParent ?? path.dirname(storageDir)),
      openLabel: t("install.selectLocation"),
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
    });
    if (!selected?.[0]) return null;
    sourceParent = selected[0].fsPath;
  }
}

/** Explicitly confirmed, cancellable, pinned installation into a visible location. */
export async function runManagedInstall(
  context: vscode.ExtensionContext,
  runtime: ManagedInstallRuntime = realInstallRuntime()
): Promise<boolean> {
  const chosen = await chooseManagedInstall(context);
  if (!chosen) return false;
  const { spec, storageDir, sourceBin } = chosen;

  const output = outputChannel();
  output.clear();
  output.show(true);
  let remaining = OUTPUT_LIMIT;
  const append = (value: string): void => {
    if (remaining <= 0) return;
    const text = value.slice(0, remaining);
    remaining -= text.length;
    output.append(text);
  };
  append(spec.scope === "source"
    ? `git ${buildSourceCloneArgs(spec.cwd).join(" ")}\n\n`
    : `npm ${spec.args.join(" ")}\n\n`);
  let result: ManagedInstallRunResult;
  try {
    if (spec.scope !== "global") await runtime.mkdir(spec.cwd);
    result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: t("install.managedProgress"),
        cancellable: true,
      },
      (_progress, token) => runtime.run(spec, token, append)
    );
  } catch (err) {
    append(`${err instanceof Error ? err.message : String(err)}\n`);
    result = { ok: false, cancelled: false, exitCode: null };
  }
  if (result.cancelled) return false;
  const check = result.ok ? runtime.validate(spec) : { valid: false, version: null };
  if (result.ok && check.valid) {
    if (storageDir) await context.workspaceState.update(MANAGED_STORAGE_KEY, storageDir);
    if (sourceBin) await context.workspaceState.update(SOURCE_CHECKOUT_KEY, sourceBin);
    vscode.window.showInformationMessage(t("install.managedSuccess"));
    return true;
  }
  append(`\nVerification: ${check.version ?? "failed"}\n`);
  const openLog = t("install.openLog");
  if (await vscode.window.showErrorMessage(t("install.managedFailed"), openLog) === openLog) {
    output.show(true);
  }
  return false;
}

export async function runNodeInstallGuidance(): Promise<void> {
  const open = t("install.openDownload");
  if (await vscode.window.showInformationMessage(t("install.nodeRequired"), open) === open) {
    await vscode.env.openExternal(vscode.Uri.parse(NODE_DOWNLOAD_URL));
  }
}

export async function runNpmInstallGuidance(): Promise<void> {
  const open = t("install.openDownload");
  if (await vscode.window.showInformationMessage(t("install.npmMissing"), open) === open) {
    await vscode.env.openExternal(vscode.Uri.parse(NODE_DOWNLOAD_URL));
  }
}

/** Full Doctor report and the one action appropriate to the current state. */
export async function runDoctorCommand(
  context: vscode.ExtensionContext,
  onChanged?: () => void | Promise<unknown>,
  runtime?: ManagedInstallRuntime
): Promise<void> {
  const report = runDoctorForLauncher(context);
  const home = os.homedir();
  const items: CheckItem[] = [
    checkItem("ok", t("doctor.row.host"), `${report.host.platform}/${report.host.arch} (${report.host.label})`),
  ];
  const nodeDetail = [report.node.version, report.node.path ? redactPath(report.node.path, home) : undefined]
    .filter(Boolean).join(" · ");
  items.push(checkItem(report.node.runnable && report.node.supported ? "ok" : "fail", t("doctor.row.node"), nodeDetail || t("doctor.notFound")));
  items.push(checkItem(report.npm.available ? "ok" : "fail", t("doctor.row.npm"), report.npm.version ?? t("doctor.notFound")));
  const dshDetail = [
    report.dsh.version ?? t("doctor.notFound"),
    t(compatKey(report.dsh.compatibility)),
    report.dsh.installType !== "none" ? t(installTypeKey(report.dsh.installType)) : undefined,
    report.dsh.resolvedPath ? `${t("doctor.row.path")}: ${redactPath(report.dsh.resolvedPath, home)}` : undefined,
  ].filter(Boolean).join(" · ");
  items.push(checkItem(report.state === "ready" ? "ok" : "fail", t("doctor.row.dsh"), dshDetail));
  for (const warning of doctorWarningTexts(report)) items.push(checkItem("warn", "", warning));

  const action = doctorActionFor(report);
  if (action === "repair") items.push(checkItem("ok", t("doctor.action.repair"), undefined, "repair"));
  if (action === "node") items.push(checkItem("ok", t("install.nodeRequired"), undefined, "node"));
  if (action === "npm") items.push(checkItem("ok", t("install.npmMissing"), undefined, "npm"));
  items.push(checkItem("ok", t("doctor.checkAgain"), undefined, "again"));

  const picked = await vscode.window.showQuickPick(items, {
    title: t("doctor.title"),
    placeHolder: t(stateKey(report.state)),
    ignoreFocusOut: true,
  });
  if (!picked?.action) return;
  if (picked.action === "again") {
    onChanged?.();
    return runDoctorCommand(context, onChanged, runtime);
  }
  if (picked.action === "node") return runNodeInstallGuidance();
  if (picked.action === "npm") return runNpmInstallGuidance();
  if (picked.action === "repair" && await runManagedInstall(context, runtime)) {
    await onChanged?.();
    return runDoctorCommand(context, onChanged, runtime);
  }
}
