import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  DshServerManager,
  type ServerInfo,
  type SessionSummary,
} from "./serverManager.js";
import { assembleDocument } from "./documentAssembly.js";
import { BridgeHost } from "./bridgeHost.js";
import { workspaceRoot } from "./commands.js";
import { t, langCode } from "./i18n.js";
import {
  affectsDshmuxConfiguration,
  affectsAnySoundSetting,
  dshmuxConfiguration,
  soundSettings,
} from "./configuration.js";
import { dshWebviewPortMappings } from "./webviewPortMapping.js";
import { sessionTitleOf } from "./workspaceTracker.js";
import { runDoctorForLauncher } from "./installService.js";
import type { DoctorReport } from "./dshDoctor.js";
import { isUpdateAvailable } from "./versionCheck.js";
import { showUpgradeOptions, upgradeInfo } from "./versionCheckService.js";
import {
  chatChromeHtml,
  loadChatChromeAssets,
  type ChatChromeAssets,
  type ChatChromeCopy,
  type ChatChromeInit,
} from "./chatChrome.js";

const DIST_DIR_NAME = "dsh-dist";
const SESSIONS_POLL_MS = 5_000;
const PINNED_SESSION_IDS_KEY = "dshmux.pinnedSessionIds";

export interface SessionPanelHooks {
  onSessionRenamed(sessionId: string, title: string): void;
  onSessionArchived(sessionId: string): void;
}

export interface ChromeSession {
  sessionId: string;
  title: string;
  updatedAt: number;
  archived: boolean;
}

export interface ChromeSearchSession extends ChromeSession {
  snippet: string;
}

function pinnedIdsFromState(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((item): item is string => {
    if (typeof item !== "string" || !item.trim() || seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

const NOOP_PANEL_HOOKS: SessionPanelHooks = {
  onSessionRenamed: () => undefined,
  onSessionArchived: () => undefined,
};

function isDarkTheme(): boolean {
  const kind = vscode.window.activeColorTheme.kind;
  return kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast;
}

function frameFontScaleValue(): number {
  return dshmuxConfiguration("frameFontScale", 0.9);
}

function messageText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isMessage(value: unknown): value is Record<string, unknown> & { type: string } {
  return !!value && typeof value === "object" && typeof (value as { type?: unknown }).type === "string";
}

/** One sidebar webview: compact DSHmux chrome plus the embedded DSH client. */
export class DshChatView implements vscode.WebviewViewProvider {
  public static readonly viewType = "dshmux.chat";

  private view?: vscode.WebviewView;
  private bridge?: BridgeHost;
  private currentSessionId?: string;
  private currentTitle = t("sessions.newSession");
  private assembled = false;
  private refreshSeq = 0;
  private pollTimer?: NodeJS.Timeout;
  private isPolling = false;
  private sessionRevision = 0;
  private newSessionPending = false;
  private sessions: ChromeSession[] = [];
  private archivedSessions: ChromeSession[] = [];
  private pinnedSessionIds: string[];
  private doctorReport?: DoctorReport;
  private readonly chromeAssets: ChatChromeAssets;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly manager: DshServerManager,
    private readonly panelHooks: SessionPanelHooks = NOOP_PANEL_HOOKS
  ) {
    this.pinnedSessionIds = pinnedIdsFromState(
      context.workspaceState.get<unknown>(PINNED_SESSION_IDS_KEY)
    );
    this.chromeAssets = loadChatChromeAssets(context.extensionUri.fsPath);
    manager.on("state", (info: ServerInfo) => {
      if (info.state !== "ready") this.assembled = false;
      this.postStatus(info);
      this.syncPolling();
      if (info.state === "ready" && !this.assembled && this.view) void this.refresh();
      if (info.state === "ready") void this.pollSessions();
    });

    context.subscriptions.push(
      vscode.window.onDidChangeActiveColorTheme((event) => {
        const dark =
          event.kind === vscode.ColorThemeKind.Dark ||
          event.kind === vscode.ColorThemeKind.HighContrast;
        void this.view?.webview.postMessage({ type: "theme-preference", dark });
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (affectsAnySoundSetting(event)) {
          void this.view?.webview.postMessage({ type: "completion-sound", ...soundSettings() });
        }
        if (affectsDshmuxConfiguration(event, "frameFontScale")) void this.refresh();
      })
    );
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(this.distRootPath())],
      portMapping: dshWebviewPortMappings(this.manager.serverUrl),
    };
    this.bridge = new BridgeHost(
      webviewView.webview,
      () => this.manager.serverUrl ?? "",
      fetch,
      () => this.manager.authCookie
    );

    webviewView.webview.onDidReceiveMessage((message: unknown) => {
      void this.handleMessage(message);
    });
    webviewView.onDidChangeVisibility(() => {
      this.syncPolling();
      if (webviewView.visible && this.manager.state === "ready") void this.pollSessions();
    });
    webviewView.onDidDispose(() => {
      this.refreshSeq += 1;
      this.clearPolling();
      this.view = undefined;
      this.bridge?.dispose();
      this.bridge = undefined;
    });

    try {
      this.doctorReport = runDoctorForLauncher(this.context);
    } catch {
      this.doctorReport = undefined;
    }
    webviewView.webview.html = this.placeholderHtml();
    this.assembled = false;
    this.postStatusNow();
    this.syncPolling();

    if (this.manager.state === "ready") {
      void this.refresh();
      void this.pollSessions();
    } else {
      this.autoStartWhenReady();
    }
  }

  loadSession(sessionId: string): void {
    if (sessionId && sessionId === this.currentSessionId && this.assembled) return;
    void this.view?.webview.postMessage({ type: "session-loading", loading: true });
    this.currentSessionId = sessionId || undefined;
    this.updateCurrentTitle();
    this.postSnapshot();
    this.assembled = false;
    void this.refresh();
  }

  get shownSessionId(): string | undefined {
    return this.currentSessionId;
  }

  refreshSessions(): void {
    void this.pollSessions();
  }

  refreshMetadata(): void {
    this.postStatusNow();
  }

  async refreshDoctor(): Promise<DoctorReport | undefined> {
    try {
      this.doctorReport = runDoctorForLauncher(this.context);
    } catch {
      // A failed probe must not erase the last useful report.
    }
    this.postStatusNow();
    if (this.doctorReport?.state === "ready") this.autoStartWhenReady();
    return this.doctorReport;
  }

  private placeholderHtml(): string {
    return `<!DOCTYPE html>
<html lang="${langCode()}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>html,body{background:var(--vscode-sideBar-background,var(--vscode-editor-background))}</style>
</head>
<body><div id="root"></div>${this.chromeHtml(false)}</body>
</html>`;
  }

  private chromeCopy(): ChatChromeCopy {
    return {
      sessions: t("sessions.title"),
      newSession: t("sessions.newSession"),
      searchSessions: t("chrome.searchSessions"),
      active: t("chrome.active"),
      pinned: t("chrome.pinned"),
      archived: t("sessions.archived"),
      empty: t("sessions.empty"),
      rename: t("sessions.rename"),
      renamePlaceholder: t("sessions.renamePlaceholder"),
      archive: t("sessions.archive"),
      pin: t("chrome.pin"),
      unpin: t("chrome.unpin"),
      fullTextSearch: t("chrome.fullTextSearch"),
      searching: t("chrome.searching"),
      moreResults: t("chrome.moreResults"),
      timeNow: t("sessions.timeNow"),
      more: t("chrome.more"),
      openInEditor: t("chrome.openInEditor"),
      openSettings: t("chrome.openSettings"),
      openDoctor: t("chrome.openDoctor"),
      showDshSidebar: t("chrome.showDshSidebar"),
      hideDshSidebar: t("chrome.hideDshSidebar"),
      statusVersions: t("chrome.statusVersions"),
      status: t("chrome.status"),
      ready: t("doctor.state.ready"),
      extensionVersion: t("chrome.extensionVersion"),
      dshVersion: t("chrome.dshVersion"),
      notAvailable: t("chrome.notAvailable"),
      retry: t("chrome.retry"),
      retryDsh: t("chrome.retryDsh"),
      start: t("button.start"),
      stop: t("button.stop"),
      stopped: t("overlay.stopped"),
      starting: t("overlay.starting"),
      stopping: t("overlay.stopping"),
      loadingSession: t("overlay.loadingSession"),
      errorTemplate: t("overlay.error", { message: "{message}" }),
      actionFailedTemplate: t("chrome.actionFailed", { message: "{message}" }),
      updateLatestTemplate: t("upgrade.latestChip", { version: "{version}" }),
      updateNextTemplate: t("upgrade.nextChip", { version: "{version}" }),
    };
  }

  private availableUpdates(): { latestVersion?: string; nextVersion?: string } {
    const current = this.manager.dshVersion;
    const updates = upgradeInfo(this.context, current, this.manager.dshBinPath);
    return {
      latestVersion:
        updates && isUpdateAvailable(current, updates.latest) ? updates.latest : undefined,
      nextVersion:
        updates && isUpdateAvailable(current, updates.next) ? updates.next : undefined,
    };
  }

  private chromeInit(initialSessionLoading: boolean): ChatChromeInit {
    return {
      lang: langCode(),
      currentSessionId: this.currentSessionId,
      currentTitle: this.currentTitle,
      pinnedSessionIds: this.pinnedSessionIds,
      serverState: this.manager.state,
      doctorState: this.doctorReport?.state,
      ...this.availableUpdates(),
      initialSessionLoading,
      copy: this.chromeCopy(),
    };
  }

  private chromeHtml(initialSessionLoading: boolean): string {
    return chatChromeHtml(
      this.chromeInit(initialSessionLoading),
      this.chromeAssets.css,
      this.chromeAssets.script
    );
  }

  private distRootPath(): string {
    return path.join(this.context.globalStorageUri.fsPath, DIST_DIR_NAME);
  }

  private async handleMessage(value: unknown): Promise<void> {
    if (!isMessage(value)) return;
    const sessionId = typeof value.sessionId === "string" ? value.sessionId : undefined;
    switch (value.type) {
      case "chrome-ready":
        this.postStatusNow();
        this.postSnapshot();
        if (this.manager.state === "ready") void this.pollSessions();
        return;
      case "refresh-sessions":
        if (this.manager.state === "ready") await this.pollSessions();
        return;
      case "start":
        this.startFromChrome();
        return;
      case "stop":
        this.manager.stop();
        return;
      case "new-session":
        await this.createSession();
        return;
      case "open-session":
        if (sessionId) this.loadSession(sessionId);
        return;
      case "rename-session":
        if (sessionId && typeof value.title === "string" && value.title.trim()) {
          await this.renameSession(sessionId, value.title.trim());
        }
        return;
      case "archive-session":
        if (sessionId) await this.archiveSession(sessionId);
        return;
      case "toggle-pin":
        if (sessionId) await this.togglePin(sessionId);
        return;
      case "search-sessions":
        if (
          typeof value.requestId === "number" &&
          Number.isSafeInteger(value.requestId) &&
          value.requestId >= 0 &&
          typeof value.query === "string" &&
          value.query.trim()
        ) {
          await this.searchSessions(value.requestId, value.query.trim());
        }
        return;
      case "active-session-changed":
        if (sessionId) {
          this.currentSessionId = sessionId;
          this.updateCurrentTitle();
          this.postSnapshot();
          if (!this.findSession(sessionId)) void this.pollSessions();
        }
        return;
      case "open-in-editor":
        await vscode.commands.executeCommand("dshmux.openPanel");
        return;
      case "open-settings":
        await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:matik5.dshmux");
        return;
      case "open-doctor":
        await vscode.commands.executeCommand("dshmux.doctor");
        return;
      case "show-status":
        void this.view?.webview.postMessage({
          type: "status-detail",
          state: this.manager.state,
          extensionVersion: this.context.extension.packageJSON.version as string | undefined,
          dshVersion: this.manager.dshVersion,
        });
        return;
      case "upgrade": {
        const channel =
          value.channel === "next" ? "next" : value.channel === "latest" ? "latest" : undefined;
        if (channel) {
          await showUpgradeOptions(
            this.context,
            this.manager.dshVersion,
            this.manager.dshBinPath,
            channel
          );
        }
        return;
      }
    }
  }

  private startFromChrome(): void {
    if (this.manager.state === "ready" || this.manager.state === "starting") return;
    if (this.doctorReport && this.doctorReport.state !== "ready") {
      void vscode.commands.executeCommand("dshmux.doctor");
      return;
    }
    void this.manager.start({ cwd: workspaceRoot() }).catch(() => {
      // The manager state drives the visible error.
    });
  }

  private autoStartWhenReady(): void {
    const doctorAllowsStart = !this.doctorReport || this.doctorReport.state === "ready";
    if (
      doctorAllowsStart &&
      !this.manager.isRunning &&
      this.manager.state !== "starting" &&
      this.manager.state !== "stopping"
    ) {
      void this.manager.start({ cwd: workspaceRoot() }).catch(() => {
        // The manager state drives the visible error.
      });
    }
  }

  private async createSession(): Promise<void> {
    if (this.newSessionPending || this.manager.state !== "ready") return;
    this.newSessionPending = true;
    this.postOperation("new", "pending");
    try {
      const workspaceId = await this.manager.workspaceIdFor(workspaceRoot());
      const sessionId = await this.manager.createSession(workspaceId);
      this.newSessionPending = false;
      this.postOperation("new", "success", sessionId);
      this.loadSession(sessionId);
      void this.pollSessions();
    } catch (err) {
      this.newSessionPending = false;
      this.postOperation("new", "error", undefined, messageText(err));
    }
  }

  private async renameSession(sessionId: string, title: string): Promise<void> {
    this.postOperation("rename", "pending", sessionId);
    try {
      const result = await this.manager.renameSession(sessionId, title);
      for (const item of this.sessions.concat(this.archivedSessions)) {
        if (item.sessionId === sessionId) item.title = result.title;
      }
      this.sessionRevision += 1;
      if (this.currentSessionId === sessionId) this.currentTitle = result.title;
      this.panelHooks.onSessionRenamed(sessionId, result.title);
      this.postOperation("rename", "success", sessionId);
      this.postSnapshot();
    } catch (err) {
      this.postOperation("rename", "error", sessionId, messageText(err));
    }
  }

  private async archiveSession(sessionId: string): Promise<void> {
    this.postOperation("archive", "pending", sessionId);
    try {
      await this.manager.archiveSession(sessionId);
      this.panelHooks.onSessionArchived(sessionId);
      this.postOperation("archive", "success", sessionId);
      await this.pollSessions();
    } catch (err) {
      this.postOperation("archive", "error", sessionId, messageText(err));
    }
  }

  private async togglePin(sessionId: string): Promise<void> {
    if (!this.findSession(sessionId)) return;
    const previous = this.pinnedSessionIds;
    const next = previous.includes(sessionId)
      ? previous.filter((id) => id !== sessionId)
      : [sessionId, ...previous];
    this.postOperation("pin", "pending", sessionId);
    try {
      await this.context.workspaceState.update(PINNED_SESSION_IDS_KEY, next);
      this.pinnedSessionIds = next;
      this.postOperation("pin", "success", sessionId);
      this.postSnapshot();
    } catch (err) {
      this.pinnedSessionIds = previous;
      this.postOperation("pin", "error", sessionId, messageText(err));
    }
  }

  private async searchSessions(requestId: number, query: string): Promise<void> {
    const targetView = this.view;
    const documentRevision = this.refreshSeq;
    try {
      const result = await this.manager.searchSessions(query);
      if (this.view !== targetView || this.refreshSeq !== documentRevision) return;
      const known = new Map(
        this.sessions.concat(this.archivedSessions).map((item) => [item.sessionId, item])
      );
      const seen = new Set<string>();
      const items: ChromeSearchSession[] = [];
      for (const hit of result.items) {
        const session = known.get(hit.sessionId);
        if (!session || seen.has(hit.sessionId)) continue;
        seen.add(hit.sessionId);
        items.push({ ...session, snippet: hit.snippet });
      }
      void this.view?.webview.postMessage({
        type: "session-search-result",
        requestId,
        items,
        hasMore: result.hasMore,
      });
    } catch (err) {
      if (this.view !== targetView || this.refreshSeq !== documentRevision) return;
      void this.view?.webview.postMessage({
        type: "session-search-result",
        requestId,
        items: [],
        hasMore: false,
        error: messageText(err),
      });
    }
  }

  private postOperation(
    operation: "new" | "rename" | "archive" | "pin",
    state: "pending" | "success" | "error",
    sessionId?: string,
    message?: string
  ): void {
    void this.view?.webview.postMessage({
      type: "session-operation",
      operation,
      state,
      sessionId,
      message,
    });
  }

  private mapSession(summary: SessionSummary, archived: boolean): ChromeSession {
    return {
      sessionId: summary.sessionId,
      title: summary.blank
        ? t("sessions.newSession")
        : sessionTitleOf(summary.title, summary.cwd, summary.sessionId),
      updatedAt: summary.updatedAt,
      archived,
    };
  }

  private findSession(sessionId: string | undefined): ChromeSession | undefined {
    if (!sessionId) return undefined;
    return this.sessions.concat(this.archivedSessions).find((item) => item.sessionId === sessionId);
  }

  private updateCurrentTitle(): void {
    this.currentTitle = this.findSession(this.currentSessionId)?.title ?? t("sessions.newSession");
  }

  private async pollSessions(): Promise<void> {
    if (this.isPolling || this.manager.state !== "ready" || !this.view) return;
    this.isPolling = true;
    const revision = this.sessionRevision;
    try {
      const result = await this.manager.listWorkspaceSessions(workspaceRoot());
      if (revision !== this.sessionRevision) return;
      this.sessions = result.items
        .map((item) => this.mapSession(item, false))
        .sort((a, b) => b.updatedAt - a.updatedAt);
      this.archivedSessions = result.archivedItems
        .map((item) => this.mapSession(item, true))
        .sort((a, b) => b.updatedAt - a.updatedAt);
      const knownIds = new Set(
        this.sessions.concat(this.archivedSessions).map((item) => item.sessionId)
      );
      const prunedPinnedIds = this.pinnedSessionIds.filter((id) => knownIds.has(id));
      if (prunedPinnedIds.length !== this.pinnedSessionIds.length) {
        this.pinnedSessionIds = prunedPinnedIds;
        try {
          await this.context.workspaceState.update(PINNED_SESSION_IDS_KEY, prunedPinnedIds);
        } catch (err) {
          console.log("[dsh] failed to prune pinned sessions:", messageText(err));
        }
      }
      this.updateCurrentTitle();
      this.postSnapshot();
    } catch {
      this.postSnapshot(t("sessions.error"));
    } finally {
      this.isPolling = false;
    }
  }

  private postSnapshot(error?: string): void {
    void this.view?.webview.postMessage({
      type: "sessions-snapshot",
      items: this.sessions,
      archivedItems: this.archivedSessions,
      pinnedSessionIds: this.pinnedSessionIds,
      currentSessionId: this.currentSessionId,
      error,
    });
  }

  private syncPolling(): void {
    const shouldPoll =
      this.view !== undefined &&
      this.view.visible !== false &&
      this.manager.state === "ready";
    if (shouldPoll && !this.pollTimer) {
      this.pollTimer = setInterval(() => void this.pollSessions(), SESSIONS_POLL_MS);
      this.pollTimer.unref?.();
    } else if (!shouldPoll) {
      this.clearPolling();
    }
  }

  private clearPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = undefined;
  }

  private async refresh(): Promise<void> {
    const url = this.manager.serverUrl;
    const targetView = this.view;
    if (!url || !targetView) return;
    const seq = ++this.refreshSeq;
    try {
      const bridgeJs = fs.readFileSync(
        path.join(this.context.extensionUri.fsPath, "media", "bridge-client.js"),
        "utf8"
      );
      const webview = targetView.webview;
      webview.options = {
        ...webview.options,
        portMapping: dshWebviewPortMappings(url),
      };
      const { html } = await assembleDocument({
        serverBase: url,
        distRootPath: this.distRootPath(),
        asWebviewUri: (filePath) => webview.asWebviewUri(vscode.Uri.file(filePath)).toString(),
        bridgeClientJs: bridgeJs,
        cspSource: webview.cspSource,
        themeDark: isDarkTheme(),
        ...soundSettings(),
        frameFontScale: frameFontScaleValue(),
        sessionPreset: this.currentSessionId
          ? JSON.stringify({ sessionId: this.currentSessionId })
          : undefined,
        chromeHtml: this.chromeHtml(true),
        cookieProvider: () => this.manager.authCookie,
        log: (message) => console.log("[dsh] " + message),
      });
      if (seq !== this.refreshSeq || this.view !== targetView) return;
      this.bridge?.resetSockets();
      targetView.webview.html = html;
      this.assembled = true;
    } catch (err) {
      if (seq !== this.refreshSeq || this.view !== targetView) return;
      this.assembled = false;
      this.postStatus({ state: "error", message: messageText(err) });
    }
  }

  private postStatusNow(): void {
    this.postStatus({
      state: this.manager.state,
      url: this.manager.serverUrl,
      version: this.manager.dshVersion,
    });
  }

  private postStatus(info: ServerInfo): void {
    void this.view?.webview.postMessage({
      type: "server-status",
      ...info,
      version: info.version ?? this.manager.dshVersion,
      doctorState: this.doctorReport?.state,
      ...this.availableUpdates(),
    });
  }
}
