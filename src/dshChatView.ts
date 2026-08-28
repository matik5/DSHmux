// DSH chat view (side panel, 2026-08-23): the PRIMARY chat surface. A
// WebviewView in the `dshmux` side container, stacked BELOW the
// launcher (buttons / sessions / workspace indicator). It hosts the full DSH
// Web UI over the transport bridge — the same document assembly + BridgeHost
// the editor-tab DshPanel uses — but as a side-panel view, one session at a
// time (Copilot-style: clicking a session loads it into this single view).
//
// Session switching re-assembles the document with the chosen session baked
// into the <head> `dsh.sessions.current` preset (the same localStorage key the
// DSH frontend rehydrates on boot). A "light" localStorage+reload would not
// work: that preset script re-runs on every page load and would clobber the
// reloaded value back to the previously-baked session.
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { DshServerManager, type ServerInfo } from "./serverManager.js";
import { assembleDocument } from "./documentAssembly.js";
import { BridgeHost } from "./bridgeHost.js";
import { workspaceRoot } from "./commands.js";
import { t, langCode } from "./i18n.js";
import { affectsDshmuxConfiguration, dshmuxConfiguration } from "./configuration.js";
import { dshWebviewPortMappings } from "./webviewPortMapping.js";

const DIST_DIR_NAME = "dsh-dist";

function isDarkTheme(): boolean {
  const k = vscode.window.activeColorTheme.kind;
  return k === vscode.ColorThemeKind.Dark || k === vscode.ColorThemeKind.HighContrast;
}

/** dshmux.completionSound (default on), with legacy-setting fallback. */
function completionSoundEnabled(): boolean {
  return dshmuxConfiguration("completionSound", true);
}

/** dshmux.frameFontScale (default 0.9), with legacy-setting fallback. */
function frameFontScaleValue(): number {
  return dshmuxConfiguration("frameFontScale", 0.9);
}

/** Minimal shell shown before the server is ready (never a blank view). */
function placeholderHtml(): string {
  return `<!DOCTYPE html>
<html lang="${langCode()}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>html,body{height:100%;margin:0;background:var(--vscode-sideBar-background, var(--vscode-editor-background))}</style>
</head>
<body>${statusChromeHtml()}
<script>
(function(){
  var overlay = document.getElementById("dsh-overlay");
  var msg = document.getElementById("dsh-msg");
  var btn = document.getElementById("dsh-start");
  overlay.hidden = false;
  msg.textContent = ${JSON.stringify(t("overlay.stopped"))};
  btn.style.display = "inline-block";
})();
</script>
</body>
</html>`;
}

/** Overlay + status listener injected into the assembled document. */
function statusChromeHtml(initialSessionLoading = false): string {
  return `
<style>
#dsh-overlay{position:fixed;inset:0;display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;
background:var(--vscode-sideBar-background, var(--vscode-editor-background));color:var(--vscode-foreground);
font-family:var(--vscode-font-family);font-size:13px;text-align:center;padding:24px;z-index:9999}
#dsh-overlay[hidden]{display:none}
#dsh-overlay[data-mode="session"]{background:color-mix(in srgb,
var(--vscode-sideBar-background, var(--vscode-editor-background)) 76%,transparent);backdrop-filter:blur(1px)}
#dsh-progress{position:relative;width:min(220px,70vw);height:2px;overflow:hidden;border-radius:999px;
background:color-mix(in srgb,var(--vscode-progressBar-background) 24%,transparent)}
#dsh-progress[hidden]{display:none}
#dsh-progress::after{content:"";position:absolute;inset-block:0;left:-42%;width:42%;border-radius:inherit;
background:var(--vscode-progressBar-background);animation:dshmux-progress 1.15s ease-in-out infinite}
@keyframes dshmux-progress{from{transform:translateX(0)}to{transform:translateX(340%)}}
@media (prefers-reduced-motion:reduce){#dsh-progress::after{animation-duration:2s}}
#dsh-start{background:var(--vscode-button-background);color:var(--vscode-button-foreground);
border:none;border-radius:3px;padding:6px 16px;font-family:var(--vscode-font-family);font-size:13px;cursor:pointer}
#dsh-start:hover{background:var(--vscode-button-hoverBackground)}
</style>
<div id="dsh-overlay" hidden aria-live="polite">
  <div id="dsh-msg">DSHmux</div>
  <div id="dsh-progress" role="progressbar" hidden></div>
  <button id="dsh-start" style="display:none">${t("button.start")}</button>
</div>
<script>
(function(){
  var overlay = document.getElementById("dsh-overlay");
  var msg = document.getElementById("dsh-msg");
  var progress = document.getElementById("dsh-progress");
  var btn = document.getElementById("dsh-start");
  var vscode = acquireVsCodeApi();
  var loadingText = ${JSON.stringify(t("overlay.loadingSession"))};
  var initialSessionLoading = ${initialSessionLoading ? "true" : "false"};
  var sessionLoading = false;
  var serverState = initialSessionLoading ? "ready" : "unknown";
  var readyObserver;
  var readyTimer;

  function stopReadyWatch() {
    if (readyObserver) readyObserver.disconnect();
    readyObserver = undefined;
    if (readyTimer) clearTimeout(readyTimer);
    readyTimer = undefined;
  }

  function setSessionLoading(active, watchDocument) {
    if (!active) {
      sessionLoading = false;
      stopReadyWatch();
      document.body.removeAttribute("aria-busy");
      overlay.removeAttribute("data-mode");
      progress.hidden = true;
      if (serverState === "ready") overlay.hidden = true;
      return;
    }
    if (!watchDocument) stopReadyWatch();
    sessionLoading = true;
    document.body.setAttribute("aria-busy", "true");
    overlay.dataset.mode = "session";
    overlay.hidden = false;
    msg.textContent = loadingText;
    progress.setAttribute("aria-label", loadingText);
    progress.hidden = false;
    btn.style.display = "none";
  }

  function watchForRenderedSession() {
    function scheduleReady() {
      var root = document.getElementById("root");
      if (!root || !root.firstElementChild || root.querySelector("[data-dsh-boot]")) {
        if (readyTimer) clearTimeout(readyTimer);
        readyTimer = undefined;
        return;
      }
      if (readyTimer) clearTimeout(readyTimer);
      readyTimer = setTimeout(function () {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { setSessionLoading(false, false); });
        });
      }, 450);
    }
    readyObserver = new MutationObserver(scheduleReady);
    readyObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });
    window.addEventListener("load", scheduleReady, { once: true });
    scheduleReady();
  }

  btn.onclick = function () { vscode.postMessage({ type: "start" }); };
  window.addEventListener("message", function (e) {
    var m = e.data;
    if (!m || typeof m !== "object") return;
    if (m.type === "session-loading") {
      setSessionLoading(m.loading !== false, false);
      return;
    }
    if (m.type === "server-status") {
      serverState = m.state;
      if (m.state === "ready") {
        if (!sessionLoading) overlay.hidden = true;
        return;
      }
      sessionLoading = false;
      stopReadyWatch();
      document.body.removeAttribute("aria-busy");
      overlay.removeAttribute("data-mode");
      overlay.hidden = false;
      progress.hidden = true;
      btn.style.display = m.state === "stopped" || m.state === "error" ? "inline-block" : "none";
      if (m.state === "starting") msg.textContent = ${JSON.stringify(t("overlay.starting"))};
      else if (m.state === "stopped") msg.textContent = ${JSON.stringify(t("overlay.stopped"))};
      else if (m.state === "error") msg.textContent = ${JSON.stringify(t("overlay.error", { message: "{message}" }))}.replace("{message}", m.message || "unknown");
    }
  });
  if (initialSessionLoading) {
    setSessionLoading(true, true);
    watchForRenderedSession();
  }
})();
</script>`;
}

/**
 * Side-panel WebviewView hosting the DSH UI over the transport bridge. One
 * instance, one session at a time. The launcher (above it) drives
 * {@link loadSession}; the editor-tab DshPanel remains a secondary surface.
 */
export class DshChatView implements vscode.WebviewViewProvider {
  public static readonly viewType = "dshmux.chat";

  private view?: vscode.WebviewView;
  private bridge?: BridgeHost;
  /** Session the view should show (drives the localStorage preset on (re)load). */
  private currentSessionId?: string;
  /** True once the assembled DSH document is showing (false for the placeholder). */
  private assembled = false;
  /** Monotonic refresh counter: only the latest refresh may write its result. */
  private refreshSeq = 0;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly manager: DshServerManager
  ) {
    // Mirror state into the overlay/placeholder; the extension drives
    // (re)assembly AFTER theme sync so the page loads with the right scheme.
    manager.on("state", (info: ServerInfo) => {
      this.postStatus(info);
      if (info.state === "ready" && !this.assembled && this.view) {
        void this.refresh();
      }
    });
    // Live theme switch: the embedded client resolves "system" via the
    // matchMedia shim, so push the VS Code theme without a page reload.
    context.subscriptions.push(
      vscode.window.onDidChangeActiveColorTheme((e) => {
        const dark =
          e.kind === vscode.ColorThemeKind.Dark || e.kind === vscode.ColorThemeKind.HighContrast;
        this.view?.webview.postMessage({ type: "theme-preference", dark });
      })
    );
    // Live completion-sound toggle: push the new value to the webview so the
    // bridge-client detector picks it up without a page reload.
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (affectsDshmuxConfiguration(e, "completionSound")) {
          this.view?.webview.postMessage({ type: "completion-sound", enabled: completionSoundEnabled() });
        }
        if (affectsDshmuxConfiguration(e, "frameFontScale")) {
          // The scale is baked into the assembled document, so re-assemble.
          // No-op while the server is not running (refresh guards on it).
          void this.refresh();
        }
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
    this.bridge = new BridgeHost(webviewView.webview, () => this.manager.serverUrl ?? "");

    // View-level commands from the placeholder/overlay chrome.
    webviewView.webview.onDidReceiveMessage((msg) => {
      const m = msg as { type?: string };
      if (m.type === "start") {
        void this.manager.start({ cwd: workspaceRoot() }).catch(() => {
          /* state machine drives the overlay */
        });
      } else if (m.type === "stop") {
        this.manager.stop();
      }
    });
    webviewView.onDidDispose(() => {
      this.view = undefined;
      this.bridge?.dispose();
      this.bridge = undefined;
    });

    webviewView.webview.html = placeholderHtml();
    this.assembled = false;
    this.postStatus({ state: this.manager.state, url: this.manager.serverUrl });
    if (this.manager.state === "ready") void this.refresh();
  }

  /**
   * Load a session into the single chat view (one at a time). Always re-assembles
   * so the <head> session preset bakes in the NEW session: the DSH frontend
   * rehydrates `dsh.sessions.current` on boot, and that preset script re-runs on
   * every page load, so a "light" localStorage+reload would be clobbered back to
   * the previously-baked session (the reload would not switch). When the dist rev
   * is unchanged, assembleDocument skips the re-download — this is a cheap
   * index.html fetch + re-string, not a full re-fetch.
   */
  loadSession(sessionId: string): void {
    // No-op when the view is already showing this exact session (avoids a
    // pointless re-assembly + flicker on re-click).
    if (sessionId && sessionId === this.currentSessionId && this.assembled) return;
    // Dim the currently rendered session immediately. The replacement document
    // starts with the same overlay, so feedback remains visible across the
    // asynchronous re-assembly and DSH frontend boot phases.
    this.view?.webview.postMessage({ type: "session-loading", loading: true });
    this.currentSessionId = sessionId;
    // The current document still shows the previous session until refresh
    // succeeds. Keeping this false also lets a user retry the same target after
    // a transient assembly failure instead of being trapped by the no-op guard.
    this.assembled = false;
    // refreshSeq makes the latest call win, so a concurrent ready-handler
    // refresh cannot clobber this one's (correct) preset.
    void this.refresh();
  }

  /** The session currently shown (for title / status hints). */
  get shownSessionId(): string | undefined {
    return this.currentSessionId;
  }

  private distRootPath(): string {
    return path.join(this.context.globalStorageUri.fsPath, DIST_DIR_NAME);
  }

  private async refresh(): Promise<void> {
    const url = this.manager.serverUrl;
    if (!url || !this.view) return;
    const seq = ++this.refreshSeq;
    try {
      const bridgeJs = fs.readFileSync(
        path.join(this.context.extensionUri.fsPath, "media", "bridge-client.js"),
        "utf8"
      );
      const webview = this.view.webview;
      // Plugin bundles remain absolute HTTP URLs because they are classic
      // scripts. In a remote window, map their loopback port to the remote
      // extension host before loading the assembled document.
      webview.options = {
        ...webview.options,
        portMapping: dshWebviewPortMappings(url),
      };
      const { html } = await assembleDocument({
        serverBase: url,
        distRootPath: this.distRootPath(),
        asWebviewUri: (p) => webview.asWebviewUri(vscode.Uri.file(p)).toString(),
        bridgeClientJs: bridgeJs,
        cspSource: webview.cspSource,
        themeDark: isDarkTheme(),
        completionSound: completionSoundEnabled(),
        frameFontScale: frameFontScaleValue(),
        // Bake the current session in so both a cold load (server just became
        // ready) and a live session switch boot into the right session.
        sessionPreset: this.currentSessionId
          ? JSON.stringify({ sessionId: this.currentSessionId })
          : undefined,
        chromeHtml: statusChromeHtml(true),
        log: (m) => console.log("[dsh] " + m),
      });
      // A newer refresh superseded this one (e.g. loadSession raced the
      // ready-handler refresh): drop the stale result so the latest preset wins.
      if (seq !== this.refreshSeq) return;
      this.view.webview.html = html;
      this.assembled = true;
    } catch (err) {
      if (seq !== this.refreshSeq) return;
      const msg = err instanceof Error ? err.message : String(err);
      this.assembled = false;
      this.postStatus({ state: "error", message: msg });
    }
  }

  private postStatus(info: ServerInfo): void {
    this.view?.webview.postMessage({ type: "server-status", ...info });
  }
}
