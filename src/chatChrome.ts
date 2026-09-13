import * as fs from "node:fs";
import * as path from "node:path";

export interface ChatChromeCopy {
  sessions: string;
  newSession: string;
  searchSessions: string;
  active: string;
  pinned: string;
  archived: string;
  empty: string;
  rename: string;
  renamePlaceholder: string;
  archive: string;
  pin: string;
  unpin: string;
  fullTextSearch: string;
  searching: string;
  moreResults: string;
  timeNow: string;
  more: string;
  openInEditor: string;
  openSettings: string;
  openDoctor: string;
  showDshSidebar: string;
  hideDshSidebar: string;
  statusVersions: string;
  status: string;
  ready: string;
  extensionVersion: string;
  dshVersion: string;
  notAvailable: string;
  retry: string;
  retryDsh: string;
  start: string;
  stop: string;
  stopped: string;
  starting: string;
  stopping: string;
  loadingSession: string;
  errorTemplate: string;
  actionFailedTemplate: string;
  updateLatestTemplate: string;
  updateNextTemplate: string;
  dictationStart: string;
  dictationStop: string;
  dictationPreparing: string;
  dictationListening: string;
  dictationStopping: string;
  dictationErrorTemplate: string;
  dictationComposerUnavailable: string;
}

export interface ChatChromeInit {
  lang: string;
  currentSessionId?: string;
  currentTitle: string;
  pinnedSessionIds: string[];
  serverState: string;
  doctorState?: string;
  latestVersion?: string;
  nextVersion?: string;
  initialSessionLoading: boolean;
  dictationEnabled?: boolean;
  copy: ChatChromeCopy;
}

export interface ChatChromeAssets {
  css: string;
  script: string;
}

/** Load the two static chrome assets once in the extension host. */
export function loadChatChromeAssets(extensionRootPath: string): ChatChromeAssets {
  return {
    css: fs.readFileSync(path.join(extensionRootPath, "media", "chat-chrome.css"), "utf8"),
    script: fs.readFileSync(path.join(extensionRootPath, "media", "chat-chrome.js"), "utf8"),
  };
}

function jsonForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

/**
 * Build the small DSHmux-owned layer injected after the upstream DSH root.
 * User/session text is supplied as JSON and applied with textContent by the
 * static browser script; it is never interpolated into HTML attributes.
 */
export function chatChromeHtml(
  init: ChatChromeInit,
  css: string,
  script: string
): string {
  const dictationHtml = init.dictationEnabled
    ? `<div id="dshmux-dictation">
    <span id="dshmux-dictation-status" role="status" aria-live="polite"></span>
    <button id="dshmux-dictation-toggle" class="dshmux-icon-button" type="button" aria-pressed="false">
      <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="1.5" width="5" height="8" rx="2.5"/><path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5M5.5 14.5h5"/></svg>
    </button>
  </div>`
    : "";
  return `
<style id="dshmux-chat-chrome-style">${css}</style>
<header id="dshmux-chat-header">
  <div id="dshmux-header-actions">
    <button id="dshmux-sessions" class="dshmux-icon-button" type="button">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5h9v9h-9zM1.5 6v7.5a1 1 0 0 0 1 1H10"/><path d="M5.5 6h5M5.5 8.5h5M5.5 11h3"/></svg>
    </button>
    <button id="dshmux-new-session" class="dshmux-icon-button" type="button">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>
    </button>
  </div>
  <div id="dshmux-current-title" role="button" tabindex="0"></div>
  ${dictationHtml}
  <button id="dshmux-more" class="dshmux-icon-button" type="button" aria-haspopup="dialog" aria-expanded="false">
    <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="13" cy="8" r="1"/></svg>
  </button>
</header>

<div id="dshmux-session-backdrop" class="dshmux-backdrop" hidden>
  <section id="dshmux-session-dialog" class="dshmux-dialog" role="dialog" aria-modal="true">
    <div class="dshmux-search-row">
      <div class="dshmux-search-wrap">
        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/></svg>
        <input id="dshmux-session-search" type="search" autocomplete="off" spellcheck="false">
      </div>
      <label class="dshmux-full-text"><input id="dshmux-full-text" type="checkbox"><span id="dshmux-full-text-label"></span></label>
    </div>
    <div id="dshmux-session-tabs" role="group">
      <button id="dshmux-pinned-tab" type="button" aria-pressed="false"></button>
      <button id="dshmux-active-tab" type="button" aria-pressed="true"></button>
      <button id="dshmux-archived-tab" type="button" aria-pressed="false"></button>
    </div>
    <div id="dshmux-session-message" role="status" aria-live="polite"></div>
    <div id="dshmux-session-list" role="listbox"></div>
    <button id="dshmux-empty-new" class="dshmux-primary-button" type="button" hidden></button>
  </section>
</div>

<div id="dshmux-overflow" role="dialog" aria-modal="false" hidden>
  <button type="button" data-command="open-in-editor"></button>
  <button type="button" data-command="open-settings"></button>
  <button type="button" data-command="open-doctor"></button>
  <button id="dshmux-toggle-dsh-sidebar" type="button" data-command="toggle-dsh-sidebar" aria-pressed="false"></button>
  <button type="button" data-command="show-status"></button>
  <dl id="dshmux-status-detail" role="status" aria-live="polite" hidden>
    <div><dt id="dshmux-state-label"></dt><dd id="dshmux-state-value"></dd></div>
    <div><dt id="dshmux-extension-label"></dt><dd id="dshmux-extension-value"></dd></div>
    <div><dt id="dshmux-dsh-label"></dt><dd id="dshmux-dsh-value"></dd></div>
  </dl>
  <div class="dshmux-menu-separator" role="separator"></div>
  <button id="dshmux-update-latest" type="button" data-command="upgrade-latest" hidden></button>
  <button id="dshmux-update-next" type="button" data-command="upgrade-next" hidden></button>
  <button id="dshmux-process-action" type="button" data-command=""></button>
</div>

<div id="dshmux-overlay" hidden aria-live="polite">
  <div id="dshmux-overlay-message"></div>
  <div id="dshmux-progress" role="progressbar" hidden></div>
  <div id="dshmux-overlay-actions">
    <button id="dshmux-start" class="dshmux-primary-button" type="button" hidden></button>
    <button id="dshmux-overlay-doctor" class="dshmux-secondary-button" type="button" hidden></button>
  </div>
</div>
<div id="dshmux-toast" role="status" aria-live="polite" hidden></div>
<script>window.__DSHMUX_CHROME_INIT__=${jsonForInlineScript(init)};</script>
<script>${script}</script>`;
}
