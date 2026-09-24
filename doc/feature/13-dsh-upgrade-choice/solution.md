# Patched DSH upgrade choice — Solution

**Date**: 2026-09-24
**Status**: Approved by the user's instruction to implement in this worktree
**Sources**: [discussion.md](discussion.md), [req.md](req.md)

## Goal

Expose the existing pinned patched source installer as a direct menu action for a working older DSH.

## Facts

- `src/dshInstallService.ts:14-18` pins `matik5/deepseek-harness`, branch `matik/dsh-patches-0.1.7-rc.1`, and revision `67ddcb32a7cf8ec2e8f028979d3bebe7588b5bc0`. `buildPatchedSourceCheckoutSpec` chooses a versioned checkout path.
- `src/installService.ts:490-610` provides the destination chooser, source clone, build, verification, and workspace source-bin persistence. `managedBinsForContext` at line 104 prefers the remembered source.
- `src/extension.ts:29-35` resolves the remembered tested-version binary when starting DSH.
- `src/versionCheckService.ts:126-175` builds only npm channel choices. `src/chatChrome.ts:139-143` contains the menu controls; `media/chat-chrome.js:781-792` dispatches their commands.
- `src/dshChatView.ts:383-397` handles npm upgrades. The same message handler can invoke the existing installer. `DshServerManager.stop()` emits `exit` after termination, so a restart must await it.
- `src/installService.ts:605` remembers the verified source binary in workspace state but does not write `dshmux.dshPath`; the installed checkout is selected internally while Settings can retain an older value.
- `src/serverManager.ts:75,629,743` applies a 30-second default ready timeout to every DSH path. The user checkout reports 0.1.7-rc.1 and directly printed its ready URL after 62 seconds with the current MCP-enabled profile. A fresh profile became ready within 40 seconds. The 30-second timeout is therefore too short for this source checkout's actual startup.

## Gap

The patched installer is reachable through Doctor only when DSH is broken or missing. A ready 0.1.5-rc.2 leaves no path from the shown update menu to the pinned fork.

After installing, Settings does not show the selected path, and the valid checkout times out before its user profile finishes startup.

## Call-site audit

`chooseManagedInstall` is called only by `runManagedInstall` (`src/installService.ts:564`); its default retains the current Doctor choices. `runManagedInstall` is called by Doctor (`src/installService.ts:799`) and focused tests (`test/installService.test.js`); its default retains the current Doctor behavior. The new menu caller supplies patched-only mode. No caller depends on a changed return value.

`DshServerManager.start` is called by commands, the sidebar, and activation restore. Every caller uses the default timeout unless a test explicitly sets `readyTimeoutMs`. Selecting the timeout by resolved executable path keeps explicit timeouts and ordinary npm/CLI starts unchanged. `dshmux.dshPath` is read by `configuredDshBin`; the explicit patched install can write its verified path after the existing workspace-state update without changing other installer choices.

## Tasks

1. Add a persistent patched-build menu control in `src/chatChrome.ts` and dispatch it in `media/chat-chrome.js`.
2. Add a patched-only mode to the existing chooser and installer in `src/installService.ts`, preserving default Doctor behavior.
3. Wire install and optional orderly restart in `src/dshChatView.ts`; localize strings in `src/i18nStrings.ts`.
4. Add focused tests, run the suite, package the VSIX, and install it into VS Code.
5. Write the verified path to User settings only after an explicit patched upgrade; warn if that setting update fails.
6. Give source checkouts a 120-second ready timeout while retaining 30 seconds for other binaries and explicit overrides.
