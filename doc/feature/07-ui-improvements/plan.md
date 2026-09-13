# UI improvements — Implementation Plan

**Date**: 2026-09-13

**Sources**: [discussion.md](discussion.md), [req.md](req.md), [solution.md](solution.md)

**Status**: implementation round closed; live-host verification remains in TODO

## Target state and constraints

The implementation must produce one contributed sidebar view, `dshmux.chat`. Its webview contains one compact header of at most 44 CSS px with the active session title and three icon buttons: session history, new session, and overflow. The existing embedded DSH Web UI fills all remaining height. Session history is an in-view searchable dialog; process/version/upgrade actions are on demand rather than persistent.

Non-negotiable constraints:

- delete the old `dshmux.view` contribution and `src/launcherView.ts`; do not retain a hidden or collapsed legacy route;
- reuse `DshServerManager`, `runDoctorForLauncher`, `runDoctorCommand`, `checkForUpdates`, `upgradeInfo`, `showUpgradeOptions`, `BridgeHost`, `assembleDocument`, `sessionTitleOf`, and `SessionPanelManager`;
- do not change the server/session/archive/upgrade semantics or weaken CSP, auth-cookie, loopback, or port-mapping behavior;
- add no UI framework, runtime package, generic state store, event bus, design system, or speculative extension point;
- keep chrome responsibilities split only across `src/chatChrome.ts`, `media/chat-chrome.css`, and `media/chat-chrome.js`; do not replace the launcher with another mega-template;
- all new runtime UI copy must exist in the ten languages already present in `src/i18nStrings.ts`;
- preserve `retainContextWhenHidden`, editor-tab support, theme sync, sounds, clipboard, streaming, workspace alignment, and latest/next safe terminal-prefill behavior.

### Message contract

```ts
type HostToChrome =
  | { type: "server-status"; state: ServerState; message?: string }
  | { type: "session-loading"; loading: boolean }
  | { type: "sessions-snapshot"; items: ChromeSession[]; archivedItems: ChromeSession[]; currentSessionId?: string; error?: string }
  | { type: "session-operation"; operation: "new" | "rename" | "archive"; state: "pending" | "success" | "error"; sessionId?: string; message?: string }
  | { type: "status-detail"; state: ServerState; extensionVersion?: string; dshVersion?: string; message?: string };

type ChromeToHost =
  | { type: "chrome-ready" | "refresh-sessions" | "new-session" | "start" | "stop" | "open-in-editor" | "open-settings" | "open-doctor" | "show-status" }
  | { type: "open-session" | "archive-session" | "active-session-changed"; sessionId: string }
  | { type: "rename-session"; sessionId: string; title: string }
  | { type: "upgrade"; channel: "latest" | "next" };
```

`ChromeSession` is exactly `{ sessionId, title, updatedAt, archived }`. Untrusted webview messages must be validated before manager or command calls. User-controlled values must enter the DOM through properties such as `textContent` and `value`, never through generated `innerHTML`.

## Requirement-to-task traceability matrix (RTTM)

| Requirement | Task | Verification |
|---|---|---|
| R1 — One chat-first surface | T1, T3, T5, T6 | Manifest has exactly one view; launcher files/references are absent; rendered chrome is ≤44 px and the DSH root receives the remaining height. |
| R2 — Compact active-chat header | T1, T2, T5, T6 | Current title follows open/new/rename/upstream selection; three accessible icon buttons remain usable at 240 px. |
| R3 — Codex-like session popup | T1, T2, T5, T6 | Search, recency order, active/archived states, selection, rename/archive, scrolling, outside-click, Escape, keyboard navigation, and focus restoration pass automated/manual checks. |
| R4 — Fast new session | T1, T2, T5, T6 | One activation creates one workspace session; pending blocks duplicates; success selects it; failure preserves the previous chat. |
| R5 — Lifecycle/version details on demand | T1, T2, T3, T5, T6 | Ready has no persistent status/version/start/stop UI; overflow exposes Stop/status/versions/updates; stopped/error overlays expose recovery. |
| R6 — Visual, responsive, accessible | T1, T5, T6 | Theme-token audit plus 240/320/480 px light/dark/high-contrast and keyboard/reduced-motion verification. |
| R7 — Regression protection | T2, T3, T4, T5, T6 | Compile/full test suite pass; manual start→ready→new→switch→rename→archive→editor→stop→start flow passes; both webview surfaces reconnect after restart. |
| R8 — KISS | T1–T5, T7 | No new dependency/framework or duplicate flow; old launcher/dead keys/tests removed; new modules are called; final diff-size and dead-code audit is documented. |
| R9 — DSH sidebar visibility | T8 | Default collapses only the first DSH shell track; overflow toggles/restores it; rightbar track remains unchanged; preference uses webview state. |

## Tasks

### T1 — Build the compact chat chrome

**Status**: ✅ done

**Files and current locations**:

- `src/chatChrome.ts:1-new` — new file
- `media/chat-chrome.css:1-new` — new file
- `media/chat-chrome.js:1-new` — new file
- `src/i18nStrings.ts:22-517,808` — launcher/session/overlay copy to replace or reuse
- `src/documentAssembly.ts:47-52,254-274` — existing injection contract, unchanged

- [x] Add a small VS Code-free `chatChromeHtml(init, css, script)` builder plus a focused asset loader; load the two static assets once and pass only serialized initial state/localized copy into them.
- [x] Render one ≤44 px header with an ellipsized title and actual `<button>` elements for sessions, new, and overflow.
- [x] Reserve the rest of the document height for `#root`; avoid horizontal overflow at 240, 320, and 480 px and account for the existing `#root` zoom behavior.
- [x] Add a floating `role="dialog"` session picker with labeled search, Active/Archived control, current-row semantics, scrollable results, empty/error states, and contextual rename/archive buttons.
- [x] Implement case-insensitive title filtering, descending `updatedAt` order, relative time, ArrowUp/ArrowDown/Enter/Escape, outside-click close, focus trap while open, and focus return to the sessions button.
- [x] Add the compact overflow/status surface with Open in editor, Settings, Doctor, conditional Stop, extension/DSH details, and conditional latest/next items.
- [x] Implement stopped, starting, stopping, error, and session-loading overlay states with `aria-live`, `aria-busy`, and reduced-motion behavior.
- [x] Make new-session pending visible/disabled and protect all DOM writes from user-authored HTML.
- [x] Observe only `dsh.sessions.current` writes/events, preserve storage semantics, and send `active-session-changed` when upstream DSH changes session.
- [x] Add every new visible/ARIA/error string to all ten maps in `src/i18nStrings.ts`; do not remove old keys until T3 removes their call sites.

Expected public shape:

```ts
export interface ChatChromeInit {
  lang: string;
  currentSessionId?: string;
  currentTitle: string;
  initialSessionLoading: boolean;
  copy: ChatChromeCopy;
}

export function chatChromeHtml(
  init: ChatChromeInit,
  css: string,
  script: string
): string;
```

**Completion criteria**: The three new files have one responsibility each, contain no backend logic or dependency, parse successfully, render a ≤44 px header plus transient layers, and expose only the approved message contract with complete ten-language copy.

### T2 — Consolidate sidebar state and actions in `DshChatView`

**Status**: ✅ done

**Files and current locations**:

- `src/dshChatView.ts:1-388`
- `src/serverManager.ts:53-63,1010-1138` — reuse only
- `src/workspaceTracker.ts:41-58` — reuse `sessionTitleOf`
- `src/installService.ts:82-104` — reuse bounded Doctor result
- `src/versionCheckService.ts:94-175` — reuse cached update metadata and safe upgrade interaction

- [x] Replace `placeholderHtml()` and `statusChromeHtml()` with the T1 builder and static assets; keep the placeholder functional before DSH is ready.
- [x] Add one cached workspace session snapshot and map titles through `sessionTitleOf`; blank sessions use `t("sessions.newSession")`.
- [x] Sort both active and archived lists by descending `updatedAt` before posting them.
- [x] Poll every five seconds only while the view exists, is visible, and the manager is ready; keep the existing re-entry guard and refresh immediately on visibility/open/mutation.
- [x] Send cached state on `chrome-ready`, but only render/update the session list when the popup asks or a session mutation completes.
- [x] Validate every `ChromeToHost` discriminant and required field before dispatch.
- [x] Move create/open/rename/archive orchestration into this single controller. Guard new-session with one host-side pending boolean; retain the previous selected document on create failure.
- [x] Accept only two external hooks: editor-panel title update after successful rename, and editor-panel close after successful archive.
- [x] Route open-editor/settings/Doctor/stop/status/upgrade to existing commands/services; never auto-run an upgrade command.
- [x] Keep `loadSession`'s current loading signal, baked preset, same-ID no-op, retry, socket reset, and refresh sequence race guard.
- [x] On a valid upstream `active-session-changed`, update current ID/title from cache (refresh cache if missing) without reassembling a document the DSH UI already switched.
- [x] On any non-ready server state mark the assembled document stale; on the next ready state reassemble against the new URL/port.
- [x] Preserve theme/sound live updates and sync polling on `onDidChangeVisibility` and disposal.
- [x] Complete lightweight audit A after T1–T2 and record R1–R8 gaps in the audit log below.

Core controller state should stay explicit and local:

```ts
interface SessionPanelHooks {
  onSessionRenamed(sessionId: string, title: string): void;
  onSessionArchived(sessionId: string): void;
}

private sessions: ChromeSession[] = [];
private archivedSessions: ChromeSession[] = [];
private currentSessionId?: string;
private newSessionPending = false;
private assembled = false;
```

**Completion criteria**: One `DshChatView` owns all sidebar UI state/actions, every mutation updates the snapshot/header consistently, session loading remains race-safe, polling stops when unnecessary, and audit A finds no duplicated flow or unplanned requirement.

### T3 — Remove the launcher and simplify extension/manifest wiring

**Status**: ✅ done

**Files and current locations**:

- `src/extension.ts:1-215`
- `src/launcherView.ts:1-732` — delete
- `package.json:45-71,123-147`
- `package.nls.json:12-15`
- `package.nls.zh-cn.json:12-15`

- [x] Remove the `DshLauncherView` import, instance, provider registration, callbacks, and all `launcher?.refresh*` calls.
- [x] Construct `DshChatView` with only `panels.updateTitle` and `panels.close` notification hooks.
- [x] Keep ready ordering exactly: theme sync → resilient workspace session resolution → `chatView.loadSession(...)` → background update check.
- [x] Point the update callback at `chatView.refreshMetadata()` and Doctor repair callback at `chatView.refreshDoctor()`.
- [x] Make the existing `dshmux.openPanel` command open `chatView.shownSessionId`; retain the editor tab as a secondary surface.
- [x] Preserve same-workspace auto-restart, persisted open panels, primary-workspace change handling, and reveal-after-provider-registration.
- [x] Delete `src/launcherView.ts` only after migrated Doctor/auto-start/handshake behavior exists in T2.
- [x] Change `contributes.views.dshmux` to exactly one `dshmux.chat` webview named `DSHmux`; remove its duplicate chat description.
- [x] Update/remove the corresponding existing `package.nls*.json` keys; do not add new manifest commands, context keys, or locale files.
- [x] Confirm `package.json` gained no dependency.

Target manifest fragment:

```json
"views": {
  "dshmux": [
    { "type": "webview", "id": "dshmux.chat", "name": "%view.chat.name%" }
  ]
}
```

**Completion criteria**: Runtime registers one sidebar provider, `rg "DshLauncherView|dshmux\.view|launcher\?\.refresh" src test package.json` has no live result, the chat is revealed as before, and no feature dependency or parallel command wiring was added.

### T4 — Make shared webview lifecycle restart-safe

**Status**: ✅ done

**Files and current locations**:

- `media/bridge-client.js:12-23`
- `src/dshPanel.ts:32-90,93-143,239-279`
- `src/dshChatView.ts:214-220,329-381` — coordinated state behavior from T2

- [x] Store/reuse one document-scoped VS Code API instance in assembled documents; let placeholders acquire it only when the bridge is absent.
- [x] Update chat and editor status chrome to use the singleton without changing message payloads.
- [x] Add explicit assembled/stale state to `DshPanel`; mark stale on non-ready, refresh an open panel on the next ready URL, and set state only after the newest document is installed.
- [x] Preserve `BridgeHost.resetSockets()`, auth cookie, CSP, port mapping, session preset, theme, and sound options.
- [x] Prevent disposed views/panels or stale async refreshes from writing HTML.
- [x] Complete lightweight audit B after T3–T4 and record R1–R8/dead-code gaps below.

Singleton pattern:

```js
var vscode = window.__DSHMUX_VSCODE_API__ || acquireVsCodeApi();
window.__DSHMUX_VSCODE_API__ = vscode;
```

**Completion criteria**: Each assembled document acquires the VS Code API at most once, both sidebar and editor-tab reconnect after stop→start, and transport/security behavior remains unchanged.

### T5 — Replace obsolete tests with requirement-level regression coverage

**Status**: ❌ blocked — feature-scoped tests pass; full `npm test` reproduces seven unrelated baseline failures

**Files and current locations**:

- `test/chatViewLayout.test.js:1-115`
- `test/dshChatView.test.js:1-224`
- `test/dshLauncher.test.js:1-191` — delete after migration
- `test/chatChrome.test.js:1-new` — new file
- `test/dshPanel.test.js:1-new` — new file if no existing harness can cover restart behavior
- `test/bridgeClient.test.js:1-110+`
- existing `test/i18n.test.js`, `test/documentAssembly.test.js`, `test/installService.test.js`, `test/serverManager.test.js`

- [x] Rewrite layout assertions for exactly one contributed view, no launcher source/registration, retained webview context, and a compact chat chrome.
- [x] Expand the VS Code/manager fakes for visibility, Doctor, session APIs, commands, version metadata, and message capture.
- [x] Preserve all current session preset/loading/no-op/retry/race tests.
- [x] Add chat-controller tests for handshake, Doctor-gated auto-start, visible-only polling, recency mapping, current title, message validation, create dedupe/failure preservation, open, rename, archive, status detail, upgrade channel, and stop→start reassembly.
- [x] Test editor callbacks after successful rename/archive and ensure they do not run on failure.
- [ ] Test the remaining live-DOM behavior (Arrow/Enter/Escape, focus restoration, outside click, pending state, and storage notification) in an Extension Development Host; pure helpers, safe serialization, host behavior, and rendered popup states are covered.
- [x] Test CSS/static structure for ≤44 px header, flexible root, no fixed brand color hierarchy, high-contrast focus, narrow widths, and reduced motion.
- [x] Add bridge singleton and editor-panel restart regression tests.
- [x] Delete `test/dshLauncher.test.js` only when its still-valid Doctor gate, view-ready handshake, and auto-start assertions are represented elsewhere.
- [ ] Make the repository-wide `npm test` green; compile, focused tests, and the non-baseline suite pass, but seven unrelated failures reproduce in the primary worktree.

Representative one-view assertion:

```js
assert.deepEqual(
  pkg.contributes.views.dshmux.map((view) => view.id),
  ["dshmux.chat"]
);
assert.equal(fs.existsSync(path.join(root, "src", "launcherView.ts")), false);
```

**Completion criteria**: Obsolete layout assumptions are replaced rather than silently dropped, all R1–R8 interaction/state branches have automated coverage where deterministic, and both full commands pass.

### T6 — Perform visual and end-to-end verification

**Status**: ⏭️ deferred — rendered verification complete; live Extension Development Host smoke unavailable

**Files**:

- `src/chatChrome.ts:1-new` and `media/chat-chrome.css:1-new` — rendered chrome under test
- `src/dshChatView.ts:1-388` — runtime host under test
- temporary rendered fixture — generated from the runtime chrome if an Extension Development Host cannot be captured
- `doc/feature/07-ui-improvements/verification.md:1-new` — evidence destination in T7

- [x] Capture/render ready, session-popup, stopped, and error states.
- [x] Check 240, 320, and 480 px widths in light, dark, and high-contrast themes; confirm no horizontal scrollbar or action collision.
- [x] Measure DSHmux-owned ready chrome at ≤44 CSS px and confirm vertical resize increases chat height by the same amount.
- [ ] Verify the complete mouse and keyboard flow in a live Extension Development Host; static/a11y audit and rendered popup evidence pass.
- [ ] Verify screen-reader announcements in a live Extension Development Host; markup, focus-visible, `aria-live`/`aria-busy`, forced-colors, and reduced-motion source checks pass.
- [ ] Run the manual lifecycle path in a live Extension Development Host; controller/bridge tests cover every transition, including both surfaces on stop → start.
- [x] Confirm streaming, clipboard, theme sync, completion sounds, workspace restore/alignment, and editor-tab behavior still work.
- [x] Confirm latest/next actions only prefill the terminal and never execute automatically.

Required evidence matrix:

```text
ready:          light 240 / 320 / 480, dark, high contrast
session popup:  search + current + archive + narrow
recovery:       stopped + starting/stopping + error/Doctor
lifecycle:      start → ... → stop → start (sidebar and editor tab)
```

**Completion criteria**: Every manual acceptance path passes and the four required UI states have screenshots or rendered evidence suitable for `verification.md`; any failure is recorded instead of being waived.

### T7 — Close the feature pipeline and run the KISS audit

**Status**: ✅ done — close-out accurately retains the two external verification items in TODO

**Files**:

- `doc/feature/07-ui-improvements/verification.md:1-new` — new
- `doc/feature/07-ui-improvements/plan.md:1-end` — update task states after verification
- `doc/feature/07-ui-improvements/summary.md:1-new` — new
- `doc/feature/07-ui-improvements/TODO.md:1-new` — mechanically generated

- [x] Recheck every RTTM row against code and T5/T6 evidence.
- [x] For every task marked `✅`, prove that the implementation exists and is called rather than dead.
- [x] List every gap with severity and suggested action; do not mark the feature complete when a required acceptance check failed.
- [x] Run the KISS audit: list reused components, removed components, justified new modules, dependency delta, source/test line delta, and duplicate-flow/dead-code search results.
- [x] Update T1–T7 to `✅`, `❌`, or `⏭️` based only on verification facts.
- [x] Create `summary.md` from the verified result.
- [x] Generate `TODO.md` mechanically from every `❌` and `⏭️` plan item; when none exist, write exactly `No outstanding tasks.`.

Expected closed TODO body:

```md
# TODO

No outstanding tasks.
```

**Completion criteria**: Verification contains RTTM, live-code, regression, visual, and KISS evidence; plan states match facts; summary exists; and TODO truthfully reflects every unfinished/deferred item.

### T8 — Add the DSH sidebar visibility toggle

**Status**: ✅ done

**Files and current locations**:

- `src/chatChrome.ts` — overflow button and localized copy contract
- `src/dshChatView.ts` — localization mapping only
- `src/i18nStrings.ts` — Show/Hide copy in all ten languages
- `media/chat-chrome.js` — webview state, shell discovery, first-track collapse/restore
- `media/chat-chrome.css` — hide the left occupant and its resize handle
- `test/chatChrome.test.js` — track-preservation and static structure regression

- [x] Default an absent preference to hidden and persist explicit user choice through `getState`/`setState`.
- [x] Add one overflow toggle whose text and `aria-pressed` state follow visibility.
- [x] Resolve the nearest pixel-leading grid ancestor through `[data-shell-overlay]`, not its immediate wrapper or a generated CSS-module class.
- [x] Replace only the leading pixel track with `0px`; retain and restore the remaining inline template.
- [x] Keep the hidden sidebar occupant in grid flow with `visibility:hidden`; never use `display:none`, which would move chat into the zero-width first track.
- [x] Observe only shell style changes after discovery, avoiding transcript/streaming observation.
- [x] Add no host message, command, dependency, framework, or upstream source modification.

```js
hiddenSidebarGridTemplate("56px minmax(0px, 1fr) 320px")
// => "0px minmax(0px, 1fr) 320px"
```

**Completion criteria**: The DSH rail is hidden on first use, the overflow action restores/re-hides it, an intermediate wrapper cannot hide the whole chat, the rightbar track is byte-for-byte preserved, and compile/focused tests pass.

## Implementation order

```text
T1 chrome + copy ──> T2 controller ──> T3 wiring ──┐
       │                                           │
       └────────────> T4 shared lifecycle ─────────┤
                                                   ▼
                                                  T5 tests
                                                   │
                                                   ▼
                                                  T6 visual/E2E
                                                   │
                                                   ▼
                                                  T7 close-out
                                                   │
                                                   ▼
                                                  T8 sidebar toggle

Audit A: after T1–T2
Audit B: after T3–T4
Final audit: T7
```

## Lightweight implementation audit log

| Checkpoint | Status | Requirements checked | Gaps / action |
|---|---|---|---|
| Audit A — after T1–T2 | ✅ | R1–R8 | One chrome/controller path exists and TypeScript/browser parsing passes. Remaining: interaction tests, visual proof, and reduce/audit source size under R8. |
| Audit B — after T3–T4 | ✅ | R1–R8 + dead paths | Runtime launcher path and second manifest view are gone; shared restart path compiles. Remaining dead paths are the old launcher tests and 12 `launcher.*` i18n keys, both assigned to T5/T6 cleanup. |
| Final audit — T7 | ✅ | R1–R8 + live-code/KISS | Feature code, render matrix, compile, and 161-test non-baseline suite pass. Live-host smoke is deferred; seven full-suite failures reproduce in the primary worktree. See `verification.md`. |
| R9 addendum — T8 | ✅ | R9 + KISS | One browser-local toggle reuses webview state and DSH's semantic shell anchor; no host contract, dependency, or upstream code was added. Compile and focused tests pass. |

---

**Approval gate passed**: user approved this plan on 2026-09-13.

*Related documents: [discussion.md](discussion.md) | [req.md](req.md) | [solution.md](solution.md)*
