# Patched DSH upgrade choice — Verification

**Date**: 2026-09-24

## Requirement to plan audit

| Requirement | Tasks | Result |
|---|---|---|
| R1 | T1 | `chatChrome.ts` renders the patched button without a `hidden` condition; `chat-chrome.js` labels and dispatches it; `dshChatView.ts` handles the message. |
| R2 | T2, T3 | `runManagedInstall(..., true)` selects the pinned fork only, keeps the location chooser, validates the CLI, and persists the selected source bin. The extension's bin provider reads that persisted path on subsequent starts. |
| R3 | T3 | A successful install offers restart. Acceptance waits for the old child's `exit` before `start()`. |
| R4 | T1, T3, T4 | npm channel controls remain; all new i18n keys have ten language values; tests and VSIX install passed. |
| R5 | T5 | Explicit patched upgrade writes the verified path to User settings; a failed Settings write warns and keeps the remembered workspace binary. |
| R6 | T6 | Source checkout paths receive 120 seconds; other paths retain 30 seconds; the real 0.1.7 checkout reached ready in 70 seconds through `DshServerManager`. |

## Completed task call audit

- **T1:** The menu control exists in `chatChromeHtml`; `media/chat-chrome.js` sends `upgrade-patched` through the existing overflow handler.
- **T2:** `dshChatView.ts` calls the patched-only installer; the chooser uses `buildPatchedSourceCheckoutSpec`; `runManagedInstall` validates and records the source binary.
- **T3:** The message handler calls `refreshDoctor`, then offers and performs an orderly restart only after acceptance.
- **T4:** Final `npm test`: 258 passed, 1 skipped, 0 failed. `npm run package -- --out dshmux-0.4.9-patched-upgrade-fix.vsix`: 79 files, 1.08 MB. VS Code CLI reported successful forced installation; `code --list-extensions --show-versions` reports `matik5.dshmux@0.4.9`. The installed `out/` and media files contain the new action.
- **T5:** `test/installService.test.js` verifies successful User-setting update only in the explicit patched flow and fallback after a Settings write failure. The installed checkout already reports `0.1.7-rc.1`, and the user's current `dshmux.dshPath` points to it.
- **T6:** Direct `dsh web` with the user's profile became ready after 62 seconds; the source path is therefore valid. The compiled `DshServerManager` reached ready after 70 seconds with the same checkout and profile, then stopped cleanly. The 80 focused server, installer, and i18n tests passed. After adding the Settings-failure test, 33 installer and i18n tests passed. The repaired `dshmux-0.4.9-patched-upgrade-fix.vsix` was packaged and forcibly installed successfully into VS Code.

## Gaps

No known implementation gaps. A running VS Code window may need **Developer: Reload Window** to load the newly installed extension; CLI installation does not prove a live window has reloaded. The patched checkout is already installed on the user's machine; the VSIX install did not relaunch a live VS Code window.
