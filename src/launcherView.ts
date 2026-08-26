// Sidebar launcher view (2026-08-17): a slim status + start button. The DSH
// UI itself lives in the editor tab (DshPanel); this view never hosts it.
// UI follows VS Code webview best practice: theme tokens, semantic status
// dot, primary/secondary button hierarchy, focus-visible, workspace context.
import * as vscode from "vscode";
import { DshServerManager, type ServerInfo, type ServerState } from "./serverManager.js";
import { workspaceRoot } from "./commands.js";
import { t, langCode } from "./i18n.js";
import { sessionTitleOf } from "./workspaceTracker.js";
import { upgradeInfo, type UpgradeChannel } from "./versionCheckService.js";
import { isUpdateAvailable } from "./versionCheck.js";

/** Session-list polling interval while the launcher is visible and ready. */
const SESSIONS_POLL_MS = 5_000;

/** Callbacks wired by extension.ts to the session panel manager. */
export interface SessionHandlers {
  newSession: () => void;
  openSession: (sessionId: string) => void;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  archiveSession: (sessionId: string) => void;
}

interface LauncherInit {
  state: ServerState;
  message?: string;
  version?: string;
  /** This extension's own version (shown under the sidebar title). */
  extVersion?: string;
  /** Latest dsh version known from the registry (upgrade hint, G-03). */
  latestVersion?: string;
  /** Prerelease dsh version from the `next` dist-tag (upgrade hint, 03 R2). */
  nextVersion?: string;
}

function launcherHtml(init: LauncherInit): string {
  const dotClass = { stopped: "stopped", starting: "starting", ready: "ready", error: "error", stopping: "starting" }[init.state] ?? "stopped";
  const statusText =
    init.state === "ready"
      ? init.version
        ? t("launcher.readyVersion", { version: init.version })
        : t("launcher.ready")
      : init.state === "starting"
        ? t("launcher.starting")
        : init.state === "stopping"
          ? t("launcher.stopping")
          : init.state === "error"
            ? t("launcher.error", { message: init.message ?? "unknown" })
            : t("launcher.stopped");
  const showStart = init.state === "stopped" || init.state === "error";
  const showReady = init.state === "ready";
  const latestText =
    init.state === "ready" && init.latestVersion
      ? t("upgrade.availableLatest", { latest: init.latestVersion })
      : "";
  const nextText =
    init.state === "ready" && init.nextVersion
      ? t("upgrade.availableNext", { next: init.nextVersion })
      : "";

  return `<!DOCTYPE html>
<html lang="${langCode()}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body {
  margin: 0; padding: 16px;
  display: flex; flex-direction: column; gap: 16px;
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size, 13px);
  color: var(--vscode-foreground);
}
/* Single header row: logo, title, live status, ready-state actions, and the
   workspace/open-in-editor meta all share one line (wraps when narrow), so
   the launcher takes minimal vertical room and the chat view gets more. */
.header { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; }
.logo {
  width: 28px; height: 28px; border-radius: 7px; flex: none;
  background: #4D6BFE; color: #ffffff;
  display: flex; align-items: center; justify-content: center;
}
.header-text { min-width: 0; }
.title { font-size: 14px; font-weight: 600; line-height: 1.3; }
.subtitle { font-size: 12px; color: var(--vscode-descriptionForeground); }
.status-inline {
  font-size: 12.5px; min-width: 0; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}
/* Compact action buttons on the header row (ready state). */
.status-actions { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }
button.mini {
  width: auto; padding: 2px 8px; font-size: 11.5px; line-height: 1.5;
  border-radius: 3px; white-space: nowrap; flex: 0 0 auto;
}
.dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.dot.stopped { background: var(--vscode-descriptionForeground, #8b949e); opacity: .55; }
.dot.starting { background: var(--vscode-charts-yellow, #d29922); animation: pulse 1.1s ease-in-out infinite; }
.dot.ready { background: var(--vscode-charts-green, #3fb950); }
.dot.error { background: var(--vscode-charts-red, #f85149); }
@keyframes pulse { 50% { opacity: .35; } }
.actions { display: flex; flex-direction: column; gap: 8px; }
.actions .row { display: flex; flex-direction: column; gap: 8px; }
button {
  display: block;
  width: 100%;
  font-family: inherit; font-size: 13px; cursor: pointer;
  border: none; border-radius: 4px; padding: 7px 16px;
  text-align: center;
}
button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
button.primary:hover { background: var(--vscode-button-hoverBackground); }
button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
button.upgrade {
  background: transparent;
  color: var(--vscode-notificationsInfoIcon-foreground, var(--vscode-charts-blue, #3794ff));
  border: 1px solid var(--vscode-panel-border, var(--vscode-widget-border));
  font-size: 12px;
}
button.upgrade:hover { background: var(--vscode-list-hoverBackground, rgba(128,128,128,.1)); }
/* "⋯" actions menu (Open in editor / Open Settings) sits on the header row's
   right edge; the dropdown anchors below the button. */
.header-meta { margin-left: auto; display: flex; align-items: center; flex: 0 0 auto; }
.more { position: relative; display: inline-flex; }
.more-btn { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; margin: 0; background: none; border: none; border-radius: 4px; color: var(--vscode-descriptionForeground); cursor: pointer; }
.more-btn:hover { background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground, rgba(128,128,128,.15))); color: var(--vscode-foreground); }
.more-btn:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
.more-menu { display: none; position: absolute; top: calc(100% + 4px); right: 0; z-index: 10; min-width: 160px; padding: 4px; background: var(--vscode-dropdown-background, var(--vscode-editorWidget-background)); border: 1px solid var(--vscode-dropdown-border, var(--vscode-widget-border, #454545)); border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,.35); }
.more-item { display: block; width: 100%; padding: 6px 10px; background: none; border: none; border-radius: 4px; font-size: 12.5px; color: var(--vscode-foreground); text-align: left; cursor: pointer; white-space: nowrap; }
.more-item:hover { background: var(--vscode-list-hoverBackground, rgba(128,128,128,.15)); }
.more-item:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
.sessions { display: flex; flex-direction: column; gap: 8px; }
.sessions-title { font-size: 11px; font-weight: 600; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: .5px; }
.sessions-list { display: flex; flex-direction: column; gap: 2px; width: 100%; box-sizing: border-box; min-width: 0; }
.session-item { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 4px; font-size: 12.5px; cursor: pointer; width: 100%; box-sizing: border-box; min-width: 0; }
.session-item:hover { background: var(--vscode-list-hoverBackground, rgba(128,128,128,.1)); }
.s-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--vscode-charts-green, #3fb950); }
.s-name { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.s-time { font-size: 11px; color: var(--vscode-descriptionForeground); flex: 0 0 auto; white-space: nowrap; }
.s-actions { margin-left: auto; display: flex; gap: 6px; flex: 0 0 auto; align-items: center; padding-left: 12px; padding-right: 34px; }
.session-item .icon-btn { background: none; border: none; padding: 3px 5px; border-radius: 3px; color: var(--vscode-descriptionForeground); font-size: 13px; cursor: pointer; flex: 0 0 auto; line-height: 1.2; }
.session-item .icon-btn:hover { background: var(--vscode-list-hoverBackground, rgba(128,128,128,.15)); color: var(--vscode-foreground); }
.session-item .icon-btn.hidden { display: none; }
.session-rename-input { flex: 1; min-width: 0; font: inherit; font-size: 12.5px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-focusBorder)); border-radius: 3px; padding: 2px 6px; }
.sessions-empty, .sessions-error, .sessions-archived { font-size: 11.5px; color: var(--vscode-descriptionForeground); padding: 2px 6px; }
.sessions-archived { border-top: 1px solid var(--vscode-panel-border, var(--vscode-widget-border)); margin-top: 4px; padding-top: 6px; }
</style>
</head>
<body>
  <div class="header">
    <div class="logo"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h5c4 0 4 7 6 7"/><path d="M3 12h18"/><path d="M3 19h5c4 0 4-7 6-7"/></svg></div>
    <div class="header-text">
      <div class="title">DSHmux</div>
      ${init.extVersion ? `<div class="subtitle">extension v${init.extVersion}</div>` : ""}
    </div>
    <span class="dot ${dotClass}" id="dot"></span>
    <span class="status-inline" id="status">${statusText}</span>
    <div class="status-actions" id="statusActions" style="display:${showReady ? "flex" : "none"}">
      <button class="mini secondary" id="newSession">${t("sessions.new")}</button>
      <button class="mini secondary" id="stop">${t("button.stop")}</button>
    </div>
    <div class="header-meta">
      <div class="more" id="moreWrap">
        <button class="more-btn" id="moreBtn" aria-haspopup="true" aria-expanded="false" title="${t("launcher.more")}">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
        </button>
        <div class="more-menu" id="moreMenu" role="menu" style="display:none">
          <button class="more-item" id="openEditor" role="menuitem">${t("launcher.openInEditor")}</button>
          <button class="more-item" id="openSettings" role="menuitem">${t("launcher.openSettings")}</button>
        </div>
      </div>
    </div>
  </div>

  <button class="upgrade" id="upgradeLatest" style="display:${latestText ? "block" : "none"}">${latestText} →</button>
  <button class="upgrade" id="upgradeNext" style="display:${nextText ? "block" : "none"}">${nextText} →</button>

  <div class="actions" id="actions" style="display:${showStart ? "flex" : "none"}">
    <button class="primary" id="start">${t("button.start")}</button>
  </div>

  <div class="sessions">
    <span class="sessions-title">${t("sessions.title")}</span>
    <div id="sessionsList" class="sessions-list"></div>
  </div>

<script>
(function(){
  var vscode = acquireVsCodeApi();
  // Sleep/wake diagnostics: log the state this webview was first rendered
  // with, and every server-status update it receives — the sidebar UI can
  // freeze on "Starting…" if the initial HTML was built during "starting"
  // and the later "ready" postMessage is lost/missed.
  console.log("[dsh-wv] rendered with state=" + ${JSON.stringify(init.state)});
  // Handshake (2026-08-22): tell the extension host the page is listening so
  // it re-pushes the current state. The postStatus sent immediately after
  // webview.html= can be dropped while the page is still loading; this
  // message is guaranteed to arrive only once the listener below exists.
  vscode.postMessage({ type: "view-ready" });
  var dot = document.getElementById("dot");
  var status = document.getElementById("status");
  var start = document.getElementById("start");
  var actions = document.getElementById("actions");
  var statusActions = document.getElementById("statusActions");
  var stop = document.getElementById("stop");
  var upgradeLatest = document.getElementById("upgradeLatest");
  var upgradeNext = document.getElementById("upgradeNext");
  var newSession = document.getElementById("newSession");
  var sessionsList = document.getElementById("sessionsList");
  var openEditor = document.getElementById("openEditor");
  var openSettings = document.getElementById("openSettings");
  var moreBtn = document.getElementById("moreBtn");
  var moreMenu = document.getElementById("moreMenu");
  var archExpanded = false; // survives the 5s poll re-render (archive section)
  function closeMoreMenu() {
    moreMenu.style.display = "none";
    moreBtn.setAttribute("aria-expanded", "false");
  }
  start.onclick = function(){ vscode.postMessage({ type: "start" }); };
  stop.onclick = function(){ vscode.postMessage({ type: "stop" }); };
  upgradeLatest.onclick = function(){ vscode.postMessage({ type: "upgrade", channel: "latest" }); };
  upgradeNext.onclick = function(){ vscode.postMessage({ type: "upgrade", channel: "next" }); };
  newSession.onclick = function(){ vscode.postMessage({ type: "new-session" }); };
  moreBtn.onclick = function(ev) {
    ev.stopPropagation();
    var open = moreMenu.style.display === "block";
    moreMenu.style.display = open ? "none" : "block";
    moreBtn.setAttribute("aria-expanded", open ? "false" : "true");
  };
  openEditor.onclick = function(){ closeMoreMenu(); vscode.postMessage({ type: "open-in-editor" }); };
  openSettings.onclick = function(){ closeMoreMenu(); vscode.postMessage({ type: "open-settings" }); };
  document.addEventListener("click", function(ev) {
    if (moreMenu.style.display === "block" && !moreMenu.contains(ev.target) && ev.target !== moreBtn) closeMoreMenu();
  });
  function renderSessions(items, archivedItems) {
    sessionsList.textContent = "";
    if (!items || items.length === 0) {
      var empty = document.createElement("div");
      empty.className = "sessions-empty";
      empty.textContent = ${JSON.stringify(t("sessions.empty"))};
      sessionsList.appendChild(empty);
    } else {
      items.forEach(function (it) {
        // Gemini analysis (doc/fix/20260819-session-x-offset): the global
        // "button { width:100%; padding:7px 16px }" rule polluted BOTH session
        // buttons (only padding was overridden by .icon-btn, never width), so
        // each button was 100% wide — the flex row overflowed and the last
        // button (✕) was pushed outside the visible area. Fix: buttons get
        // EXPLICIT inline 20x20 + padding:0 (immune to the global rule), the
        // actions group is absolutely anchored inside the row's right edge,
        // and the row reserves padding-right so the title never overlaps.
        var row = document.createElement("div");
        row.className = "session-item";
        row.style.cssText =
          "position:relative;display:flex;align-items:center;gap:6px;width:100%;height:28px;" +
          "padding:0 86px 0 6px;box-sizing:border-box;cursor:pointer;border-radius:4px;overflow:hidden;";
        var dot = document.createElement("span");
        dot.style.cssText = "width:7px;height:7px;border-radius:50%;flex:0 0 auto;background:var(--vscode-charts-green,#3fb950);display:inline-block;";
        var name = document.createElement("span");
        name.style.cssText =
          "flex:1 1 0%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;line-height:28px;";
        name.textContent = it.title;
        var tm = document.createElement("span");
        tm.style.cssText = "font-size:11px;color:var(--vscode-descriptionForeground);flex:0 0 auto;white-space:nowrap;margin-right:2px;";
        tm.textContent = relativeTime(it.updatedAt);
        tm.title = it.updatedAt ? new Date(it.updatedAt).toLocaleString() : "";
        // Explicit button style: width/height/min/max all pinned to 20px so
        // the global "button { width:100%; padding:7px 16px }" rule cannot apply.
        var btnStyle =
          "display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;" +
          "min-width:20px;max-width:20px;padding:0;margin:0;border:none;background:transparent;" +
          "color:var(--vscode-descriptionForeground);cursor:pointer;border-radius:3px;box-sizing:border-box;flex:0 0 auto;";
        var rn = document.createElement("button");
        rn.className = "icon-btn";
        rn.style.cssText = btnStyle;
        // Inline SVG (codicon edit) — font-independent.
        rn.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M13.23 7.63 8.37 2.77a.75.75 0 0 0-1.06 0L2.77 7.31a.75.75 0 0 0-.22.53v2.66a.75.75 0 0 0 .75.75h2.66a.75.75 0 0 0 .53-.22l4.54-4.54a.75.75 0 0 0 0-1.06zM8 8.44 6.56 7l2.66-2.66L11 5.78 8 8.44zM2 13.75h7a.75.75 0 0 1 0 1.5H2a.75.75 0 0 1 0-1.5z"/></svg>';
        rn.setAttribute("aria-label", ${JSON.stringify(t("sessions.rename"))});
        rn.onclick = function (ev) { ev.stopPropagation(); startRename(row, rn, name, it); };
        var ar = document.createElement("button");
        ar.className = "icon-btn";
        ar.style.cssText = btnStyle + "font-size:13px;line-height:1;";
        ar.textContent = "✕";
        ar.setAttribute("aria-label", ${JSON.stringify(t("sessions.archive"))});
        ar.onclick = function (ev) { ev.stopPropagation(); vscode.postMessage({ type: "archive-session", sessionId: it.sessionId }); };
        var acts = document.createElement("div");
        acts.style.cssText =
          "position:absolute;right:4px;top:0;bottom:0;display:flex;align-items:center;gap:8px;background:inherit;";
        acts.appendChild(tm);
        acts.appendChild(rn);
        acts.appendChild(ar);
        row.appendChild(dot);
        row.appendChild(name);
        row.appendChild(acts);
        row.onclick = function () { vscode.postMessage({ type: "open-session", sessionId: it.sessionId }); };
        sessionsList.appendChild(row);
      });
    }
    if (archivedItems && archivedItems.length > 0) {
      var archTitle = ${JSON.stringify(t("sessions.archived"))};
      var archHeader = document.createElement("div");
      archHeader.style.cssText = "border-top:1px solid var(--vscode-panel-border,var(--vscode-widget-border));margin-top:4px;padding:6px 6px 2px;font-size:11.5px;color:var(--vscode-descriptionForeground);cursor:pointer;display:flex;align-items:center;gap:4px;";
      var archArrow = document.createElement("span");
      archArrow.style.cssText = "font-size:9px;flex:none;";
      archArrow.textContent = archExpanded ? "▾" : "▸";
      var archLabel = document.createElement("span");
      archLabel.style.cssText = "flex:1;";
      archLabel.textContent = archTitle + " (" + archivedItems.length + ")";
      archHeader.appendChild(archArrow);
      archHeader.appendChild(archLabel);
      archHeader.onclick = function () {
        archExpanded = !archExpanded;
        archList.style.display = archExpanded ? "block" : "none";
        archArrow.textContent = archExpanded ? "▾" : "▸";
      };
      var archList = document.createElement("div");
      archList.style.cssText = "flex-direction:column;gap:2px;margin-top:2px;display:" + (archExpanded ? "block" : "none") + ";";
      archivedItems.forEach(function (a) {
        var arow = document.createElement("div");
        arow.style.cssText = "display:flex;align-items:center;gap:6px;padding:2px 6px;border-radius:4px;font-size:12px;color:var(--vscode-descriptionForeground);";
        var adot = document.createElement("span");
        adot.style.cssText = "width:7px;height:7px;border-radius:50%;flex:none;background:var(--vscode-descriptionForeground,#8b949e);";
        var aname = document.createElement("span");
        aname.style.cssText = "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        aname.textContent = a.title;
        var atime = document.createElement("span");
        atime.style.cssText = "font-size:11px;flex:none;white-space:nowrap;";
        atime.textContent = relativeTime(a.updatedAt);
        arow.appendChild(adot);
        arow.appendChild(aname);
        arow.appendChild(atime);
        archList.appendChild(arow);
      });
      sessionsList.appendChild(archHeader);
      sessionsList.appendChild(archList);
    }
  }
  function relativeTime(ts) {
    if (!ts) return "";
    var MIN = 60000, HOUR = 3600000, DAY = 86400000;
    var diff = Math.max(0, Date.now() - ts);
    if (diff < MIN) return ${JSON.stringify(t("sessions.timeNow"))};
    if (diff < HOUR) return Math.floor(diff / MIN) + "m";
    if (diff < DAY) return Math.floor(diff / HOUR) + "h";
    if (diff < 30 * DAY) return Math.floor(diff / DAY) + "d";
    if (diff < 365 * DAY) return Math.floor(diff / (30 * DAY)) + "mo";
    return Math.floor(diff / (365 * DAY)) + "y";
  }
  function startRename(row, rn, name, it) {
    var input = document.createElement("input");
    input.className = "session-rename-input";
    input.value = it.title;
    input.setAttribute("placeholder", ${JSON.stringify(t("sessions.renamePlaceholder"))});
    row.replaceChild(input, name);
    input.focus();
    input.select();
    var done = false;
    function commit() {
      if (done) return;
      done = true;
      var v = input.value.trim();
      if (v && v !== it.title) {
        vscode.postMessage({ type: "rename-session", sessionId: it.sessionId, title: v });
      }
      row.replaceChild(name, input);
    }
    function cancel() {
      if (done) return;
      done = true;
      row.replaceChild(name, input);
    }
    input.onkeydown = function (ev) {
      if (ev.key === "Enter") commit();
      else if (ev.key === "Escape") cancel();
    };
    input.onblur = cancel;
  }
  function set(state, text) {
    dot.className = "dot " + state;
    status.textContent = text;
    actions.style.display = state === "stopped" || state === "error" ? "flex" : "none";
    statusActions.style.display = state === "ready" ? "flex" : "none";
  }
  function setUpgrade(latest, next) {
    var ltxt = latest
      ? ${JSON.stringify(t("upgrade.availableLatest", { latest: "{latest}" }))}.replace("{latest}", latest) + " →"
      : "";
    var ntxt = next
      ? ${JSON.stringify(t("upgrade.availableNext", { next: "{next}" }))}.replace("{next}", next) + " →"
      : "";
    upgradeLatest.style.display = ltxt ? "block" : "none";
    upgradeLatest.textContent = ltxt;
    upgradeNext.style.display = ntxt ? "block" : "none";
    upgradeNext.textContent = ntxt;
  }
  window.addEventListener("message", function (e) {
    var m = e.data;
    if (!m || typeof m !== "object") return;
    if (m.type === "upgrade-info") {
      setUpgrade(m.latest, m.next);
      return;
    }
    if (m.type === "sessions") {
      renderSessions(m.items, m.archivedItems);
      return;
    }
    if (m.type === "sessions-error") {
      sessionsList.textContent = "";
      var err = document.createElement("div");
      err.className = "sessions-error";
      err.textContent = ${JSON.stringify(t("sessions.error"))};
      sessionsList.appendChild(err);
      return;
    }
    if (m.type !== "server-status") return;
    console.log("[dsh-wv] server-status received: " + m.state);
    if (m.state === "stopped") set("stopped", ${JSON.stringify(t("launcher.stopped"))});
    else if (m.state === "starting") set("starting", ${JSON.stringify(t("launcher.starting"))});
    else if (m.state === "stopping") set("starting", ${JSON.stringify(t("launcher.stopping"))});
    else if (m.state === "ready") {
      var readyText = m.version
        ? ${JSON.stringify(t("launcher.readyVersion", { version: "{version}" }))}.replace("{version}", m.version)
        : ${JSON.stringify(t("launcher.ready"))};
      set("ready", readyText);
      setUpgrade(m.latestVersion, m.nextVersion);
    }
    else if (m.state === "error") set("error", ${JSON.stringify(t("launcher.error", { message: "{message}" }))}.replace("{message}", m.message || "unknown"));
  });
})();
</script>
</body>
</html>`;
}

export class DshLauncherView implements vscode.WebviewViewProvider {
  public static readonly viewType = "dshmux.view";

  private view?: vscode.WebviewView;
  private pollTimer?: NodeJS.Timeout;
  private isPolling = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly manager: DshServerManager,
    private readonly onUpgrade: (channel: UpgradeChannel) => void,
    private readonly sessionHandlers: SessionHandlers,
    /** Secondary surface: open the editor-tab panel (kept, no longer default). */
    private readonly onOpenInEditor: () => void
  ) {
    manager.on("state", (info: ServerInfo) => {
      this.postStatus(info);
      this.syncPolling();
    });
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    // Sleep/wake diagnostics: every sidebar re-resolve re-renders the HTML from
    // manager.state — log it so we can see what state the view was built with
    // after a laptop sleep (a re-resolve during "starting" would freeze the UI
    // there even though the manager later reaches "ready").
    console.log(`[dsh] resolve launcher view: managerState=${this.manager.state} url=${this.manager.serverUrl ?? "-"}`);
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.onDidReceiveMessage((msg) => {
      const m = msg as { type?: string; sessionId?: string; title?: string };
      if (m.type === "view-ready") {
        // Handshake (2026-08-22): the webview page loads asynchronously after
        // `webview.html = ...`, so the postStatus sent right after may be
        // dropped if the page's message listener is not yet registered (the
        // sidebar UI could freeze on the initial render — e.g. "Starting…" —
        // while the session poller keeps working). Re-push the CURRENT state
        // once the page signals it is listening; this message is guaranteed
        // to arrive after the listener exists.
        console.log(`[dsh] launcher view-ready handshake: state=${this.manager.state}`);
        this.postStatus({
          state: this.manager.state,
          url: this.manager.serverUrl,
          version: this.manager.dshVersion,
        });
      } else if (m.type === "start") {
        void this.manager.start({ cwd: workspaceRoot() }).catch(() => {
          /* state machine drives the launcher */
        });
      } else if (m.type === "stop") {
        this.manager.stop();
      } else if (m.type === "upgrade") {
        this.onUpgrade((m as { channel?: string }).channel === "next" ? "next" : "latest");
      } else if (m.type === "new-session") {
        this.sessionHandlers.newSession();
      } else if (m.type === "open-session" && m.sessionId) {
        this.sessionHandlers.openSession(m.sessionId);
      } else if (m.type === "rename-session" && m.sessionId && m.title !== undefined) {
        void this.sessionHandlers
          .renameSession(m.sessionId, m.title)
          .catch(() => this.refreshSessions());
      } else if (m.type === "archive-session" && m.sessionId) {
        this.sessionHandlers.archiveSession(m.sessionId);
      } else if (m.type === "open-in-editor") {
        this.onOpenInEditor();
      } else if (m.type === "open-settings") {
        void vscode.commands.executeCommand("workbench.action.openSettings", "@ext:matik5.dshmux");
      } else if (m.type === "refresh-sessions") {
        this.refreshSessions();
      }
    });
    webviewView.onDidDispose(() => {
      this.view = undefined;
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = undefined;
      }
    });
    const currentVersion = this.manager.dshVersion;
    const upd = upgradeInfo(this.context, currentVersion, this.manager.dshBinPath);
    const extVersion = this.context.extension.packageJSON.version as string | undefined;
    webviewView.webview.html = launcherHtml({
      state: this.manager.state,
      version: currentVersion,
      extVersion,
      latestVersion: upd && isUpdateAvailable(currentVersion, upd.latest) ? upd.latest : undefined,
      nextVersion: upd && isUpdateAvailable(currentVersion, upd.next) ? upd.next : undefined,
    });
    this.postStatus({
      state: this.manager.state,
      url: this.manager.serverUrl,
      version: this.manager.dshVersion,
    });

    // UX optimization (2026-08-18): opening the launcher icon means "I want to
    // use DSH" — auto-start the server when it is not running. start() is
    // idempotent (already-running returns the URL), so this is safe on repeat
    // clicks; failures surface through the state machine into the launcher.
    if (!this.manager.isRunning && this.manager.state !== "starting") {
      void this.manager.start({ cwd: workspaceRoot() }).catch(() => {
        /* state machine drives the launcher */
      });
    }
    // Start the session poller even when the server is ALREADY ready at view
    // open: syncPolling() is otherwise only reached via state transitions, and
    // an already-running server never fires one after the view resolves — the
    // sidebar would stay empty until the next start/stop (02 bug, 2026-08-20).
    this.syncPolling();
  }

  /** Re-push the current status so late-arriving data (e.g. version check
   *  result) reaches the webview without a reload. */
  refresh(): void {
    this.postStatus({
      state: this.manager.state,
      url: this.manager.serverUrl,
      version: this.manager.dshVersion,
    });
  }

  /** Start/stop the session-list poller with the view + server lifecycle. */
  private syncPolling(): void {
    const should = this.view !== undefined && this.manager.state === "ready";
    if (should && !this.pollTimer) {
      this.pollTimer = setInterval(() => void this.pollSessions(), SESSIONS_POLL_MS);
      this.pollTimer.unref?.();
      void this.pollSessions();
    } else if (!should && this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  /** Fetch the current workspace's sessions and push them to the webview. */
  private async pollSessions(): Promise<void> {
    if (this.isPolling) return; // re-entry guard: slow network skips a tick
    this.isPolling = true;
    try {
      if (this.manager.state !== "ready" || !this.view) return;
      const { items, archivedItems } = await this.manager.listWorkspaceSessions(workspaceRoot());
      const titleOf = (s: { title: string | null; cwd?: string; sessionId: string; blank: boolean }): string =>
        s.blank ? t("sessions.newSession") : sessionTitleOf(s.title, s.cwd, s.sessionId);
      this.view.webview.postMessage({
        type: "sessions",
        items: items.map((s) => ({
          sessionId: s.sessionId,
          title: titleOf(s),
          running: s.running,
          updatedAt: s.updatedAt,
        })),
        archivedItems: archivedItems.map((s) => ({
          sessionId: s.sessionId,
          title: titleOf(s),
          updatedAt: s.updatedAt,
        })),
      });
    } catch (err) {
      this.view?.webview.postMessage({
        type: "sessions-error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.isPolling = false;
    }
  }

  /** Force an immediate refresh (after rename/new/close, not the next tick). */
  refreshSessions(): void {
    void this.pollSessions();
  }

  private postStatus(info: ServerInfo): void {
    // Surface per-channel upgrade hints only when that channel is a REAL
    // update (current strictly older than the cached channel version).
    const current = info.version ?? this.manager.dshVersion;
    const upd = upgradeInfo(this.context, current, this.manager.dshBinPath);
    this.view?.webview.postMessage({
      type: "server-status",
      ...info,
      latestVersion: upd && isUpdateAvailable(current, upd.latest) ? upd.latest : undefined,
      nextVersion: upd && isUpdateAvailable(current, upd.next) ? upd.next : undefined,
    });
  }
}
