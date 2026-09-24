# Patched DSH upgrade choice — Implementation Plan

**Date**: 2026-09-24
**Sources**: [discussion.md](discussion.md), [req.md](req.md), [solution.md](solution.md)
**Status**: Approved by the user's instruction to implement in this worktree

| Requirement | Task | Verification |
|---|---|---|
| R1 | T1 | Menu control is present regardless of npm dist-tags |
| R2 | T2, T3 | Patched-only test checks choices, pinned ref, and persisted binary |
| R3 | T3 | Restart waits for DSH exit and requires explicit choice |
| R4 | T1, T3, T4 | Existing channel tests, i18n test, full suite, VSIX install |
| R5 | T5 | Patched-only install test checks User setting update after verification |
| R6 | T6 | Timeout selection test and live source boot with MCP profile |

### T1 — Show the patched upgrade

**Status**: ✅

- [x] Add `upgrade-patched` to `src/chatChrome.ts:142` and label/dispatch it in `media/chat-chrome.js:246,788`.
- [x] Keep npm `latest` and `next` controls.

```text
Overflow menu → upgrade-patched → extension host
```

**Completion criteria**: The action is visible with no registry update and includes version and branch.

### T2 — Restrict the install choice to patched source

**Status**: ✅

- [x] Add `patchedOnly` to `src/installService.ts:490-564`, leaving Doctor defaults unchanged.
- [x] Offer the shown destination and Change… while pinning the fork and revision.

```text
runManagedInstall(context, runtime, true) → patched source checkout
```

**Completion criteria**: The selected binary is verified and remembered.

### T3 — Activate on request

**Status**: ✅

- [x] Handle `upgrade-patched` in `src/dshChatView.ts:398`.
- [x] Add localized menu and restart text in `src/i18nStrings.ts:93-128`.
- [x] Wait for child exit before starting DSH again if the user chooses restart.

```text
install → verify → remember → optional stop → exit → start
```

**Completion criteria**: Installation does not stop a running DSH until restart is chosen.

### T4 — Verify and install VSIX

**Status**: ✅

- [x] Add focused tests in `test/installService.test.js` and `test/chatViewLayout.test.js`.
- [x] Run `npm test`.
- [x] Package VSIX and install it in VS Code.

```text
npm run package -- --out dshmux-0.4.9-patched-upgrade.vsix
```

**Completion criteria**: Tests pass and VS Code reports the installed extension.

### T5 — Reflect the verified checkout in Settings

**Status**: ✅

- [x] Update `dshmux.dshPath` after the explicit patched upgrade succeeds in `src/installService.ts:605`.
- [x] Warn on a Settings write failure without discarding the verified workspace selection; localize the warning in `src/i18nStrings.ts`.
- [x] Test that the Doctor's default install leaves Settings unchanged and the explicit patched upgrade writes the path.

```text
verify checkout → remember workspace binary → update User dshmux.dshPath
```

**Completion criteria**: Settings shows the verified absolute path after a patched upgrade.

### T6 — Allow the source profile to finish booting

**Status**: ✅

- [x] Select a 120-second timeout for `apps/cli/lib/bin.js` source paths in `src/serverManager.ts:629`.
- [x] Retain the 30-second default for other paths and respect `readyTimeoutMs` overrides.
- [x] Test POSIX/Windows source paths and ordinary paths in `test/serverManager.test.js`.
- [x] Run the compiled server manager against the user's checkout and profile.

```text
source checkout → 120s; other DSH → 30s; explicit override → caller value
```

**Completion criteria**: The user checkout reaches ready after its observed 62-second profile startup.

## Order

```text
T1 ─┬─> T3 ─> T4
T2 ─┘     └─> T5
T6 ─────────> final VSIX
```

*Related documents: discussion.md | req.md | solution.md*
