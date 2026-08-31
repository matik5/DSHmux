// Command wiring for the extension lifecycle (T3).
import * as os from "node:os";
import * as vscode from "vscode";
import { DshServerManager } from "./serverManager.js";
import { t } from "./i18n.js";

/** The first workspace folder, or the OS home when no folder is open. */
export function workspaceRoot(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
}

export function registerCommands(
  context: vscode.ExtensionContext,
  manager: DshServerManager,
  /** Primary surface: reveal/focus the side-panel chat view (2026-08-23). */
  revealChat: () => void,
  /** Secondary surface: open the editor-tab panel (kept, no longer default). */
  openEditorPanel: () => void
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dshmux.start", async () => {
      try {
        const url = await manager.start({ cwd: workspaceRoot() });
        revealChat();
        vscode.window.showInformationMessage(`DSHmux ready at ${url}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(t("command.startFailed", { message: msg }));
      }
    }),
    vscode.commands.registerCommand("dshmux.stop", async () => {
      manager.stop();
      vscode.window.showInformationMessage("DSHmux stopped.");
    }),
    vscode.commands.registerCommand("dshmux.openBrowser", async () => {
      // Token-auth DSH (>= 0.1.2-alpha) 401s the bare origin in a real
      // browser; the launch URL (with ?token=) mints the session cookie via
      // the 303 exchange, so prefer it. Pre-auth DSH: launchUrl is the bare
      // origin anyway.
      const url = manager.launchUrl ?? manager.serverUrl;
      if (!url) {
        vscode.window.showWarningMessage(t("command.notRunning"));
        return;
      }
      await vscode.env.openExternal(vscode.Uri.parse(url));
    }),
    vscode.commands.registerCommand("dshmux.openPanel", () => {
      openEditorPanel();
    })
  );
}
