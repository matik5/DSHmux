// VS Code layer for DSH Doctor + guided install (04-install R1/R2/R3/R5/R7).
// Safety contract (binding):
//  - R7 (user decision 2026-09-05): the primary new-clone flow auto-executes
//    its whole plan in the DSHmux setup terminal behind ONE final modal
//    listing every command — steps chained with `&&`, so a failed step
//    stops the rest. This supersedes the no-auto-execute rule for that flow
//    only (req R7).
//  - The R2 npm/npx flow and all guidance paths stay prefill-only:
//    `sendText(cmd, false)`, the user presses Enter; the only auto-executed
//    text there is the fixed `printf` echo line (R5);
//  - the only write is `dshmux.dshPath` to user settings
//    (`ConfigurationTarget.Global` — the VS Code API has no machine-settings
//    target; the setting is `machine-overridable`), behind an explicit
//    per-click confirmation that shows the exact path;
//  - every dialog can be cancelled and leaves the machine unchanged.
import * as os from "node:os";
import * as vscode from "vscode";
import {
  realDoctorProbe,
  redactPath,
  runDoctor,
  type DoctorReport,
  type DoctorState,
} from "./dshDoctor.js";
import {
  GIT_DOWNLOAD_URL,
  NODE_DOWNLOAD_URL,
  PNPM_INSTALL_URL,
  TESTED_SOURCE_BRANCH,
  buildNpmPlan,
  buildNpxPlan,
  buildSourceClonePlan,
  checkExistingCheckout,
  type InstallCommand,
} from "./dshInstallService.js";
import { resolveNodeExecutable } from "./serverManager.js";
import { t } from "./i18n.js";
import type { I18nKey } from "./i18nStrings.js";
import { configuredDshBin } from "./configuration.js";

/** Workspace-host identity for the doctor (remote windows report the remote). */
export function hostLabel(): string {
  return vscode.env.remoteName ? `remote-${vscode.env.remoteName}` : "local";
}

/** Fresh doctor report; the launcher pushes it, this function writes nothing. */
export function runDoctorForLauncher(): DoctorReport {
  return runDoctor(realDoctorProbe(hostLabel(), configuredDshBin()));
}

/**
 * Session-scoped "DSHmux setup" terminal (R5): created once, reused by
 * every install flow, shown on every setup action — so a click always
 * produces visible feedback, including on the guidance-only paths.
 */
let setupTerminal: vscode.Terminal | undefined;

/** Get the shared DSHmux setup terminal, creating it on first use. */
export function getSetupTerminal(): vscode.Terminal {
  if (!setupTerminal) {
    setupTerminal = vscode.window.createTerminal({ name: "DSHmux setup" });
  }
  setupTerminal.show();
  return setupTerminal;
}

/**
 * The ONLY auto-executed text in the install flow (R5): one fixed
 * `printf '%s\n' '…'` of a DSHmux-controlled message. Shell metacharacters
 * that could break out of the single-quoted argument are stripped.
 */
export function echoSetupLine(terminal: vscode.Terminal, message: string): void {
  const safe = message.replace(/['"`\\$]/g, "");
  terminal.sendText(`printf '%s\\n' '${safe}'`, true);
}

/**
 * Announce and prefill one install step in the shared DSHmux setup
 * terminal (R5): first an auto-echo line (step, purpose, exact command),
 * then the command itself is prefilled — the user presses Enter to run it.
 * The install command is NEVER auto-executed.
 */
export function prefillTerminal(
  command: string,
  purpose?: string,
  step?: number,
  total?: number
): void {
  const terminal = getSetupTerminal();
  const parts = [
    step !== undefined && total !== undefined ? `Step ${step} of ${total}` : undefined,
    purpose,
    command,
  ].filter(Boolean);
  echoSetupLine(terminal, parts.join(" — "));
  terminal.sendText(command, false); // prefill only — user presses Enter
  vscode.window.showInformationMessage(t("upgrade.prefilled", { command }));
}

/** Open the setup terminal and announce a missing-tool guidance line (R5). */
function announceInSetupTerminal(message: string): void {
  echoSetupLine(getSetupTerminal(), message);
}

type CheckIcon = "ok" | "warn" | "fail";

interface CheckItem extends vscode.QuickPickItem {
  action?: string;
}

function checkItem(icon: CheckIcon, label: string, detail?: string, action?: string): CheckItem {
  const mark = icon === "ok" ? "✓ " : icon === "warn" ? "⚠ " : "✗ ";
  return { label: `${mark}${label}`, detail, alwaysShow: true, action };
}

function toolRow(label: string, tool: { available: boolean; version?: string }): CheckItem {
  return tool.available
    ? checkItem("ok", label, tool.version)
    : checkItem("fail", label, t("doctor.notFound"));
}

function stateKey(state: DoctorState): I18nKey {
  switch (state) {
    case "ready":
      return "doctor.state.ready";
    case "node-missing":
      return "doctor.state.nodeMissing";
    case "dsh-missing":
      return "doctor.state.dshMissing";
    case "dsh-unrunnable":
      return "doctor.state.dshUnrunnable";
    case "source-prerequisites-missing":
      return "doctor.state.sourcePrereqMissing";
  }
}

function compatKey(state: "tested" | "older" | "newer" | "unknown"): I18nKey {
  return `doctor.compat.${state}`;
}

function installTypeKey(state: "npm-global" | "npx-cache" | "source" | "custom"): I18nKey {
  switch (state) {
    case "npm-global":
      return "doctor.installType.npmGlobal";
    case "npx-cache":
      return "doctor.installType.npxCache";
    case "source":
      return "doctor.installType.source";
    case "custom":
      return "doctor.installType.custom";
  }
}

/** Localize all of a report's warning codes (used by the QuickPick + the launcher panel). */
export function doctorWarningTexts(report: DoctorReport): string[] {
  return report.warnings.map(warningText);
}

/** Localize one doctor warning code (pure mapping — R1). */
function warningText(w: string): string {
  if (w === "stale-configured-path") return t("doctor.staleConfigWarning");
  if (w === "source-tools-missing") return t("doctor.sourceToolsWarning");
  if (w.startsWith("untested-version:")) {
    const compat = w.slice("untested-version:".length) as "tested" | "older" | "newer" | "unknown";
    return t("doctor.untestedWarning", { compat: t(compatKey(compat)) });
  }
  return w;
}

/** The doctor QuickPick (R1): one row per check, warnings, then actions. */
export async function runDoctorCommand(): Promise<void> {
  const report = runDoctorForLauncher();
  const home = os.homedir();
  const items: CheckItem[] = [];

  items.push(
    checkItem(
      "ok",
      t("doctor.row.host"),
      `${report.host.platform}/${report.host.arch} (${report.host.label})`
    )
  );
  const nodeDetail = [
    report.node.version,
    report.node.path ? redactPath(report.node.path, home) : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  items.push(
    checkItem(
      report.node.runnable ? "ok" : "fail",
      t("doctor.row.node"),
      nodeDetail || t("doctor.notFound")
    )
  );
  items.push(toolRow(t("doctor.row.npm"), report.npm));
  items.push(toolRow(t("doctor.row.npx"), report.npx));
  items.push(toolRow(t("doctor.row.git"), report.git));
  items.push(toolRow(t("doctor.row.pnpm"), report.pnpm));

  const dshDetail = [
    report.dsh.version ?? t("doctor.notFound"),
    t(compatKey(report.dsh.compatibility)),
    report.dsh.resolvedPath !== null && report.dsh.installType !== "none"
      ? t(installTypeKey(report.dsh.installType))
      : undefined,
    report.dsh.resolvedPath ? `${t("doctor.row.path")}: ${redactPath(report.dsh.resolvedPath, home)}` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  const dshIcon: CheckIcon =
    report.dsh.resolvedPath === null ? "fail" : report.dsh.version === null ? "warn" : "ok";
  items.push(checkItem(dshIcon, t("doctor.row.dsh"), dshDetail));

  for (const w of report.warnings) {
    items.push(checkItem("warn", "", warningText(w)));
  }

  if (report.state !== "ready") {
    items.push(checkItem("ok", t("doctor.action.setup"), undefined, "setup"));
    items.push(checkItem("ok", t("doctor.action.alternative"), undefined, "alternative"));
  }
  items.push(checkItem("ok", t("doctor.checkAgain"), undefined, "again"));

  const picked = await vscode.window.showQuickPick(items, {
    title: t("doctor.title"),
    placeHolder: t(stateKey(report.state)),
    ignoreFocusOut: true,
  });
  if (!picked?.action) return;
  if (picked.action === "again") {
    await runDoctorCommand();
    return;
  }
  if (picked.action === "setup") {
    await runPrimaryInstallFlow(report);
    return;
  }
  if (picked.action === "alternative") {
    await runAlternativeInstallFlow();
  }
}

/** Missing-tool guidance: setup-terminal announcement (R5) + message +
 *  official download page (openExternal). DSHmux never installs the tool. */
export async function runNodeInstallGuidance(): Promise<void> {
  const msg = t("install.nodeMissing");
  announceInSetupTerminal(`${msg} ${NODE_DOWNLOAD_URL}`);
  const open = t("install.openDownload");
  if (await vscode.window.showInformationMessage(msg, open) === open) {
    await vscode.env.openExternal(vscode.Uri.parse(NODE_DOWNLOAD_URL));
  }
}

export async function runGitInstallGuidance(): Promise<void> {
  const msg = t("install.gitMissing");
  announceInSetupTerminal(`${msg} ${GIT_DOWNLOAD_URL}`);
  const open = t("install.gitPage");
  if (await vscode.window.showInformationMessage(msg, open) === open) {
    await vscode.env.openExternal(vscode.Uri.parse(GIT_DOWNLOAD_URL));
  }
}

export async function runPnpmInstallGuidance(): Promise<void> {
  const msg = t("install.pnpmMissing");
  announceInSetupTerminal(`${msg} ${PNPM_INSTALL_URL}`);
  const open = t("install.pnpmPage");
  if (await vscode.window.showInformationMessage(msg, open) === open) {
    await vscode.env.openExternal(vscode.Uri.parse(PNPM_INSTALL_URL));
  }
}

/**
 * R7: ONE final confirmation for the whole new-clone plan (not one per
 * step): numbered, verbatim commands; Run in terminal / Copy all / Cancel.
 */
async function confirmAutoRun(plan: InstallCommand[]): Promise<boolean> {
  const run = t("install.runInTerminal");
  const steps = plan.map((s, i) => `${i + 1}. ${s.command}`).join("\n");
  const choice = await vscode.window.showInformationMessage(
    t("install.autoRunPrompt", { steps }),
    { modal: true },
    run,
    t("install.copy"),
    t("install.cancel")
  );
  if (choice === run) return true;
  if (choice === t("install.copy")) {
    await vscode.env.clipboard.writeText(plan.map((s) => s.command).join("\n"));
    vscode.window.showInformationMessage(t("install.copied"));
  }
  return false;
}

/** R3: the primary (patched source) install flow. */
export async function runPrimaryInstallFlow(report: DoctorReport): Promise<void> {
  // R5: the setup terminal opens before any dialog, on every path.
  getSetupTerminal();
  // Missing prerequisites: guidance only — no clone plan while blocked.
  if (!report.git.available) {
    await runGitInstallGuidance();
    return;
  }
  if (!report.pnpm.available) {
    await runPnpmInstallGuidance();
    return;
  }

  const title = t("install.primaryTitle");
  const picked = await vscode.window.showQuickPick(
    [
      { label: t("install.newClone"), detail: title, action: "new" },
      { label: t("install.existingCheckout"), detail: title, action: "existing" },
    ],
    { placeHolder: title, ignoreFocusOut: true }
  );
  if (!picked?.action) return;

  if (picked.action === "new") {
    const uri = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: t("install.newClone"),
    });
    if (!uri || uri.length === 0) return;
    const plan = buildSourceClonePlan(uri[0].fsPath, process.platform);
    // R7: one final confirmation, then the whole plan auto-runs in the
    // shared DSHmux setup terminal (visible output, &&-chained).
    if (!(await confirmAutoRun(plan))) return; // cancelled: nothing changed
    const terminal = getSetupTerminal();
    for (let i = 0; i < plan.length; i++) {
      const s = plan[i];
      echoSetupLine(terminal, `Step ${i + 1} of ${plan.length} — ${t(s.purpose as I18nKey)} — ${s.command}`);
    }
    // One auto-executed line: a failing step stops the && chain. DSHmux
    // cannot read terminal output (no VS Code API), so it does not wait —
    // the toast points to the terminal and to Check again.
    terminal.sendText(plan.map((s) => s.command).join(" && "), true);
    vscode.window.showInformationMessage(t("install.autoRunStarted"));
    return;
  }

  // Existing checkout: validate read-only, warn, and (only if valid) offer the
  // machine-scope dshPath write behind an explicit confirmation.
  const uri = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    openLabel: t("install.existingCheckout"),
  });
  if (!uri || uri.length === 0) return;
  const dir = uri[0].fsPath;
  const node = resolveNodeExecutable(process.platform, process.execPath, os.homedir(), process.env);
  const check = checkExistingCheckout(dir, node, realDoctorProbe(hostLabel(), configuredDshBin()));
  if (!check.valid) {
    vscode.window.showWarningMessage(t("install.checkoutInvalid"));
    return;
  }
  if (check.dirty) {
    await vscode.window.showWarningMessage(t("install.checkoutDirty"));
  }
  if (check.onPatchedBranch === false) {
    await vscode.window.showWarningMessage(
      t("install.checkoutNotPatchedBranch", { branch: TESTED_SOURCE_BRANCH })
    );
  }
  const bin = check.binPath!;
  const confirm = t("install.setDshPathConfirm");
  const choice = await vscode.window.showInformationMessage(
    t("install.setDshPathPrompt", { path: bin }),
    { modal: true },
    confirm,
    t("install.cancel")
  );
  if (choice !== confirm) return;
  // The setting is declared `machine-overridable` (package.json); the API has
  // no machine-settings target, so the programmatic write goes to user
  // (Global) settings — per-machine overrides stay possible in the UI.
  await vscode.workspace
    .getConfiguration("dshmux")
    .update("dshPath", bin, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage(t("install.dshPathUpdated", { path: bin }));
}

/** R2: the npm/npx alternative flow (mainline, without the patches). */
export async function runAlternativeInstallFlow(): Promise<void> {
  getSetupTerminal(); // R5: open before the QuickPick.
  const npm = buildNpmPlan();
  const npx = buildNpxPlan();
  const items = [
    { label: t("install.npmCommand"), detail: npm.command, command: npm.command },
    { label: t("install.npxCommand"), detail: npx.command, command: npx.command },
    { label: t("install.copy"), detail: t("upgrade.copyCommandDetail"), command: "" },
  ];
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: t("install.alternativeTitle"),
    ignoreFocusOut: true,
  });
  if (!picked) return;
  if (picked.command === "") {
    await vscode.env.clipboard.writeText(npm.command);
    vscode.window.showInformationMessage(t("install.copied"));
    return;
  }
  const purpose = picked.command === npm.command ? t("install.npmPurpose") : t("install.npxPurpose");
  prefillTerminal(picked.command, purpose);
}
