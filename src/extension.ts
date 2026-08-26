// DSHmux — extension entry.
// Wires the server manager, the editor-tab panel (bridge), commands, and
// theme sync (T3/T8/T9/T12). Workspace alignment (01-workspace-alignment
// T3/T4): workspaceState-driven auto-restart + multi-root panel close.
// Session management (02-session-management T6): multi-panel orchestration,
// session list + rename in the launcher, reload restore of open panels.
import * as vscode from "vscode";
import { DshServerManager } from "./serverManager.js";
import { registerCommands, workspaceRoot } from "./commands.js";
import { DshPanel } from "./dshPanel.js";
import { SessionPanelManager } from "./sessionPanels.js";
import { DshLauncherView } from "./launcherView.js";
import { DshChatView } from "./dshChatView.js";
import { registerThemeSync } from "./themeSync.js";
import { normalizePath, shouldAutoRestart } from "./workspaceTracker.js";
import { checkForUpdates, showUpgradeOptions, type UpgradeChannel } from "./versionCheckService.js";

const WAS_RUNNING_KEY = "dsh.wasRunning";
const PANELS_KEY = "dsh.panels";

let manager: DshServerManager | undefined;

export function activate(context: vscode.ExtensionContext): void {
  // Sleep/wake diagnostics: a fresh activate() after laptop sleep means the
  // extension host restarted (the manager instance below is brand-new and
  // starts "stopped" even though the old dsh child may still be alive).
  console.log(`[dsh] activate: wasRunning=${context.workspaceState.get<boolean>(WAS_RUNNING_KEY)} workspace=${vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "(none)"}`);
  manager = new DshServerManager();
  manager.on("log", (msg: string) => console.log("[dsh]", msg));
  manager.on("stderr", (msg: string) => console.log("[dsh]", msg));

  const theme = registerThemeSync(context, () => manager?.serverUrl);
  // Persist the open-panel sessionId list (02 T6): survives window reload so
  // the auto-restart path can restore every panel bound to its session.
  const persistPanels = (ids: string[]): void => {
    void context.workspaceState.update(PANELS_KEY, ids);
  };
  const mgr = manager;
  const panels = new SessionPanelManager(persistPanels, (sessionId) =>
    sessionId ? new DshPanel(context, mgr, sessionId) : new DshPanel(context, mgr)
  );
  // Primary chat surface (2026-08-23): the side-panel chat view, created below
  // alongside the launcher and registered as a WebviewViewProvider. Declared
  // here (before the ready handler) so the handler can load a session into it;
  // assigned once the view provider is constructed.
  let chatView: DshChatView | undefined;

  // Persist the "was running" flag on every state transition (not in
  // deactivate — a floating promise there can be lost on process exit;
  // review-by-gemini A-2). workspaceState is keyed by the current workspace,
  // so a reload of the SAME folder keeps the record while opening a DIFFERENT
  // folder has none (A-3).
  manager.on("state", (info) => {
    const running = info.state === "ready";
    if (running !== context.workspaceState.get<boolean>(WAS_RUNNING_KEY)) {
      void context.workspaceState.update(WAS_RUNNING_KEY, running);
    }
  });

  // Once the server is ready — but only AFTER the theme is synced, so the page
  // loads with the VS Code color scheme (R7) — resolve a session bound to the
  // IDE workspace and load it into the PRIMARY surface: the side-panel chat
  // view (one session at a time, Copilot-style). Failure to resolve degrades
  // silently to the default behavior. The editor-tab panels are a secondary
  // surface and are no longer auto-opened on (re)start.
  const autoRestart = shouldAutoRestart(context.workspaceState.get<boolean>(WAS_RUNNING_KEY));
  console.log(`[dsh] activate: autoRestart=${autoRestart} (wasRunning=${context.workspaceState.get<boolean>(WAS_RUNNING_KEY)})`);
  const m = manager;
  m.on("state", async (info) => {
    if (info.state !== "ready") return;
    await theme.syncNow();
    let wsSessionId: string | undefined;
    try {
      wsSessionId = await m.ensureWorkspaceSession(workspaceRoot());
    } catch (err) {
      console.log("[dsh] workspace-session preset skipped:", err instanceof Error ? err.message : err);
    }
    // Primary surface (2026-08-23): the side-panel chat view shows ONE session
    // at a time (Copilot-style). Load the IDE-workspace session into it. The
    // editor-tab panels are now a SECONDARY surface — no longer auto-opened on
    // (re)start; they open on demand via "Open Panel" / "open in editor".
    chatView?.loadSession(wsSessionId ?? "");
    // G-03: background version check (24h gate) — never blocks, offline-safe.
    // onResult refreshes the launcher once the fetch settles (it may finish
    // after the first render, so the upgrade hint needs a re-push).
    void checkForUpdates(context, m.dshBinPath, m.dshVersion, () => launcher?.refresh());
  });

  // Normal reload of the same workspace (settings/extensions/update): the
  // workspaceState record survived → auto-restart dsh so the panel comes back
  // without manual action (A2 continuity). A different workspace has no
  // record → cold start, user opens explicitly.
  if (autoRestart) {
    manager.start({ cwd: workspaceRoot() }).catch(() => {
      /* state machine drives the UI */
    });
  }

  // Multi-root changes: close the panel only when the PRIMARY workspace root
  // (workspaceFolders[0]) actually changed — adding/removing an auxiliary
  // folder must not kill the active conversation (review A-4, Round-2 §3).
  // 02 T6: all panels close (each bound to the old workspace's sessions).
  let trackedRoot = workspaceRoot();
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      const newRoot = workspaceRoot();
      if (normalizePath(newRoot) !== normalizePath(trackedRoot)) {
        trackedRoot = newRoot;
        panels.closeAll();
      }
    })
  );

  const revealChat = (): void => {
    void vscode.commands.executeCommand(`${DshChatView.viewType}.focus`).then(
      undefined,
      (err) => console.log("[dsh] failed to reveal DSHmux chat:", err)
    );
  };

  registerCommands(
    context,
    manager,
    // Primary surface: reveal/focus the side-panel chat view (VS Code auto-
    // generates a `<viewId>.focus` command for every contributed view).
    revealChat,
    // Secondary surface: open the editor-tab panel (kept for now).
    () => panels.open()
  );

  // Session handlers: new/open session loads it into the side-panel chat view
  // (primary, one at a time); rename syncs any editor-tab title; archive closes
  // the bound editor tab if open (the session stays in DSH).
  const onNewSession = async (): Promise<void> => {
    try {
      const workspaceId = await m.workspaceIdFor(workspaceRoot());
      const sessionId = await m.createSession(workspaceId);
      // Primary surface: load the new session into the single side-panel chat
      // view (one session at a time). The editor tab is not auto-opened.
      chatView?.loadSession(sessionId);
      launcher?.refreshSessions();
    } catch (err) {
      void vscode.window.showWarningMessage(
        `DSHmux: failed to create session — ${err instanceof Error ? err.message : err}`
      );
    }
  };
  const onOpenSession = (sessionId: string): void => {
    // Primary surface: load the clicked session into the side-panel chat view,
    // replacing whatever was shown (one session visible at a time).
    chatView?.loadSession(sessionId);
  };
  const onRenameSession = async (sessionId: string, title: string): Promise<void> => {
    const res = await m.renameSession(sessionId, title);
    panels.updateTitle(sessionId, res.title);
    launcher?.refreshSessions();
  };
  const onArchiveSession = async (sessionId: string): Promise<void> => {
    try {
      await m.archiveSession(sessionId);
      panels.close(sessionId);
      launcher?.refreshSessions();
    } catch (err) {
      void vscode.window.showWarningMessage(
        `DSHmux: failed to archive session — ${err instanceof Error ? err.message : err}`
      );
    }
  };

  let launcher: DshLauncherView | undefined = new DshLauncherView(
    context,
    manager,
    (channel: UpgradeChannel) => void showUpgradeOptions(context, m.dshVersion, m.dshBinPath, channel),
    { newSession: () => void onNewSession(), openSession: onOpenSession, renameSession: onRenameSession, archiveSession: (sid) => void onArchiveSession(sid) },
    // Secondary surface: open the editor tab for the session currently shown
    // in the side-panel chat view (falls back to the default panel when none).
    () => panels.open(chatView?.shownSessionId)
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DshLauncherView.viewType, launcher)
  );

  // Side-panel chat view (primary surface): stacked below the launcher in the
  // same `dshmux` container. Hosts the DSH UI over the transport
  // bridge; the launcher's session list drives loadSession (one at a time).
  chatView = new DshChatView(context, manager);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DshChatView.viewType, chatView)
  );
  // Activation runs onStartupFinished, including after a window/extension-host
  // restart. Reveal the primary DSHmux surface only after both providers are
  // registered so VS Code can resolve and focus the contributed webview.
  revealChat();

  context.subscriptions.push({
    dispose: () => {
      manager?.stop();
    },
  });
}

export function deactivate(): void {
  // Sleep/wake diagnostics: if this runs during a laptop-sleep-triggered
  // extension-host restart, it stops the child — the next activate() would
  // then spawn a NEW dsh (autoRestart), orphaning any still-alive panel.
  console.log(`[dsh] deactivate: state=${manager?.state} pid=${manager?.dshBinPath ?? "-"}`);
  // No persistence here: `dsh.wasRunning` is synced on state transitions
  // during activate (T3). This function only stops the child.
  manager?.stop();
}
