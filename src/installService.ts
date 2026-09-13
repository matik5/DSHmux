// VS Code layer for DSH Doctor and its extension-managed DSH repair.
import * as fs from "node:fs";
import * as os from "node:os";
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
  buildManagedInstallSpec,
  buildManagedNpmLaunchSpec,
  checkManagedInstall,
  managedDshBin,
  type ManagedNpmLaunchSpec,
  type ManagedInstallSpec,
} from "./dshInstallService.js";
import { configuredDshBin } from "./configuration.js";
import {
  resolveNodeExecutable,
  spawnEnvironment,
  spawnSpec,
  type DshSpawnSpec,
} from "./serverManager.js";
import { t } from "./i18n.js";
import type { I18nKey } from "./i18nStrings.js";

const OUTPUT_LIMIT = 64 * 1024;

export function hostLabel(): string {
  return vscode.env.remoteName ? `remote-${vscode.env.remoteName}` : "local";
}

export function managedBinForContext(context: vscode.ExtensionContext): string {
  return managedDshBin(context.globalStorageUri.fsPath, process.platform);
}

/** Fresh workspace-host report with the same managed candidate used at launch. */
export function runDoctorForLauncher(context: vscode.ExtensionContext): DoctorReport {
  const managed = managedBinForContext(context);
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
    const nodeSpec = spawnSpec(spec.binPath);
    const launch = prepareManagedNpmLaunch(
      spec,
      nodeSpec,
      process.env,
      process.platform,
      fs.existsSync
    );
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
      const node = resolveNodeExecutable(process.platform, process.execPath, os.homedir(), process.env);
      const probe = realDoctorProbe(hostLabel(), configuredDshBin(), spec.binPath);
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

/** Explicitly confirmed, cancellable, pinned installation into globalStorage. */
export async function runManagedInstall(
  context: vscode.ExtensionContext,
  runtime: ManagedInstallRuntime = realInstallRuntime()
): Promise<boolean> {
  const spec = buildManagedInstallSpec(context.globalStorageUri.fsPath, process.platform);
  const install = t("install.managedRun");
  const choice = await vscode.window.showInformationMessage(
    t("install.managedConfirm", { package: spec.packageSpec, path: spec.cwd }),
    { modal: true },
    install,
    t("install.cancel")
  );
  if (choice !== install) return false;

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
  append(`npm ${spec.args.join(" ")}\n\n`);
  let result: ManagedInstallRunResult;
  try {
    await runtime.mkdir(spec.cwd);
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
  onChanged?: () => void,
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
  if (picked.action === "repair" && await runManagedInstall(context, runtime)) onChanged?.();
}
