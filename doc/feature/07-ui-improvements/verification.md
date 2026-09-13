# UI improvements — Verification

**Date**: 2026-09-13

**Sources**: [discussion.md](discussion.md), [req.md](req.md), [solution.md](solution.md), [plan.md](plan.md)

**Result**: implementation and feature-scoped verification pass. The round remains open for one live Extension Development Host smoke test; the repository-wide `npm test` command is also not green because seven pre-existing, unrelated platform-sensitive tests fail identically in the primary worktree.

## RTTM close-out

| Requirement | Result | Evidence |
|---|---|---|
| R1 — One chat-first surface | ✅ | `package.json` contributes only `dshmux.chat`; `src/launcherView.ts` is deleted; `--dshmux-header-height` is 40 px; rendered ready states show the DSH root immediately below it. |
| R2 — Compact active-chat header | ✅ | `chatChromeHtml` renders title + sessions/new/overflow buttons; controller tests cover title mapping and upstream selection; 240 px render shows ellipsis and all three actions. |
| R3 — Session popup | ✅ | Actual runtime assets render the searchable Active/Archived dialog at 240/320/480 px. Helper/controller tests cover filtering, recency, selection, rename/archive, and storage-driven upstream selection; source audit confirms dialog/listbox, arrows, Escape, outside-click, focus trap/restore, and safe `textContent` writes. |
| R4 — Fast new session | ✅ | Controller tests prove host-side dedupe, workspace scoping, immediate selection, loading, and preservation of the prior chat on failure. |
| R5 — Lifecycle/version details on demand | ✅ | Ready renders no persistent Start/Stop/version row. Stop/update/status/Doctor are in overflow; stopped and error overlays render recovery actions; latest/next still route through `showUpgradeOptions`. |
| R6 — Visual/a11y/responsive | ✅ with live-host follow-up | Runtime-asset renders cover light/dark/high-contrast palettes and 240/320/480 widths; CSS/source tests cover token use, forced colors, focus-visible, `aria-live`, `aria-busy`, dialog/listbox semantics, and reduced motion. Live screen-reader behavior remains part of the Extension Host smoke item below. |
| R7 — Regression protection | ✅ feature scope / ⚠ repository baseline | Sidebar and editor tests cover stop→ready with a changed port; bridge tests cover transport, clipboard, theme, sounds, and singleton acquisition. Compile and 161 relevant tests pass. Full suite has seven unrelated baseline failures described below. |
| R8 — KISS | ✅ | One sidebar controller replaces the launcher/chat split; old launcher source/test/i18n/manifest paths are removed; no runtime dependency or framework was added; new files follow the approved content/style/behavior boundaries. |
| R9 — DSH sidebar visibility | ✅ source/automated, live follow-up | Overflow contains one localized toggle. Missing webview state defaults to hidden. The pure track transform changes `56px minmax(0px, 1fr) 320px` to `0px minmax(0px, 1fr) 320px`; lookup skips intermediate wrappers and requires that grid signature before CSS marks the first occupant and left handle. Live installed-build inspection remains part of G1. |

## Live-code audit

Every implementation marked done exists and is reached:

- `src/extension.ts` constructs one `DshChatView`, registers its provider, routes update and Doctor refreshes to it, and passes only rename/archive editor-panel hooks.
- `DshChatView` loads `media/chat-chrome.css` and `media/chat-chrome.js` once through `loadChatChromeAssets`, then calls `chatChromeHtml` for both placeholder and assembled documents.
- Its validated message router calls the existing manager APIs for list/create/open/rename/archive/start/stop and existing commands/services for editor/settings/Doctor/status/latest/next.
- `media/bridge-client.js`, `media/chat-chrome.js`, and `DshPanel` all use the same document-scoped `window.__DSHMUX_VSCODE_API__` handle.
- Both `DshChatView` and `DshPanel` mark assembled documents stale on non-ready state and reassemble on the next ready URL; runtime tests execute both paths.
- `media/chat-chrome.js` resolves the DSH shell from `[data-shell-overlay]`, persists the toggle through the existing webview API, and observes only that frame's inline style after discovery.
- `rg` finds no runtime `DshLauncherView`, `dshmux.view`, `launcher?.refresh`, `launcher.*` i18n, obsolete `sessions.new`, or obsolete `upgrade.title` path.

## Automated verification

| Command/check | Result |
|---|---|
| `npm run compile` | ✅ pass |
| `node --check media/chat-chrome.js` | ✅ pass |
| Feature and unaffected-suite run excluding the two known baseline files | ✅ 161 pass, 0 fail, 1 existing platform skip |
| Focused changed-area run | ✅ 76 pass, 0 fail |
| `git diff --check` | ✅ pass |
| Full `npm test` | ⚠ 219 pass, 7 fail, 1 skip |

The seven full-suite failures are six Windows-path assertions in unchanged `test/installService.test.js` and one non-hermetic Node-discovery assertion in unchanged `test/serverManager.test.js`. Running those same two unchanged tests in `/Users/mati/proj/DSHmux` reproduces the same seven failures. They are therefore baseline issues, not regressions from this feature; changing installation or runtime discovery is outside R1–R8.

## Visual evidence

The screenshots were rendered in headless Firefox from the actual compiled `chatChromeHtml` output and the actual `media/chat-chrome.css`/`.js` assets. The DSH body in the fixture is representative only; DSHmux chrome is the shipped implementation.

| State | Evidence |
|---|---|
| Ready, light | [240 px](evidence/screenshots/ready-light-240.png), [320 px](evidence/screenshots/ready-light-320.png), [480 px](evidence/screenshots/ready-light-480.png) |
| Ready, dark | [240 px](evidence/screenshots/ready-dark-240.png), [320 px](evidence/screenshots/ready-dark-320.png), [480 px](evidence/screenshots/ready-dark-480.png) |
| Ready, high contrast palette | [240 px](evidence/screenshots/ready-contrast-240.png), [320 px](evidence/screenshots/ready-contrast-320.png), [480 px](evidence/screenshots/ready-contrast-480.png) |
| Session popup, dark | [240 px](evidence/screenshots/sessions-dark-240.png), [320 px](evidence/screenshots/sessions-dark-320.png), [480 px](evidence/screenshots/sessions-dark-480.png) |
| Recovery | [stopped/light](evidence/screenshots/stopped-light-320.png), [error/high contrast](evidence/screenshots/error-contrast-320.png) |

Observed results: the header is exactly 40 CSS px; all three actions remain visible at 240 px; the title ellipsizes; no screenshot shows horizontal overflow or action collision; the popup list stays within the viewport; ready state has no status/version/Start/Stop text; stopped/error replace chat with a clear recovery surface.

## KISS audit

- Reused unchanged: `DshServerManager`, `BridgeHost`, `assembleDocument`, `runDoctorForLauncher`, `runDoctorCommand`, `checkForUpdates`, `upgradeInfo`, `showUpgradeOptions`, `sessionTitleOf`, `SessionPanelManager`, theme/sound/config helpers.
- Removed: the 732-line launcher controller/template, its 191-line test, its second manifest view/provider/wiring, and all dead launcher/obsolete session/update i18n keys.
- Added boundaries: `chatChrome.ts` (safe fragment/config), `chat-chrome.css` (presentation), and `chat-chrome.js` (browser-only DOM behavior). These are the three boundaries approved in `solution.md`; no store, event bus, UI framework, generic abstraction, or speculative API was added.
- Dependency delta: none; runtime dependencies remain only `ws`.
- Production source/manifest net delta is about +636 lines after removing the launcher. Most of the delta is explicit responsive/a11y styling and the required searchable popup behavior. Host business logic is consolidated rather than duplicated.
- Test net delta is about +236 lines after deleting obsolete launcher/layout coverage; new coverage targets the consolidated controller, pure chrome helpers, API singleton, and editor restart.

## Gaps

| ID | Severity | Gap | Suggested action |
|---|---|---|---|
| G1 | Medium | A live VS Code/Antigravity Extension Development Host was unavailable in this execution environment, so the final real-host mouse/keyboard/screen-reader smoke path was not performed. Runtime-asset rendering and deterministic host/bridge tests passed. | Run the checklist: start → ready → new → switch → rename → archive → open in editor → stop → start, plus Tab/Arrow/Enter/Escape and a screen-reader name check. |
| G2 | Low, pre-existing | Repository-wide `npm test` is not green because of seven reproducible baseline failures in unrelated install/server tests. | Handle as a separate cross-platform test-hermeticity fix; do not mix it into this UI feature. |

No code defect was found in the implemented feature scope. G1 keeps T6 deferred and G2 keeps the full-suite subtask in T5 blocked; both are extracted into `TODO.md`.

*Related documents: [discussion.md](discussion.md) | [req.md](req.md) | [solution.md](solution.md) | [plan.md](plan.md)*
