# Test platform portability — Implementation Plan

**Date**: 2026-09-13  
**Sources**: [discussion.md](discussion.md), [solution.md](solution.md)

## Requirement-to-task traceability matrix

| Requirement | Task | Verification |
|---|---|---|
| Simulated Node discovery must not depend on host system executables | T1 | Focused `serverManager.test.js` and full suite |
| Install integration tests must use the active host's path semantics | T2 | Focused `installService.test.js` and full suite |
| Existing Windows path behavior must remain covered | T2, T3 | Existing parameterized `dshInstallService.test.js` cases pass |
| Keep the fix small and avoid new abstractions | T1, T2 | Diff audit confirms no new API or dependency |

### T1 — Isolate simulated Node discovery from native system paths

**Status**: ✅

Files: `src/serverManager.ts:216-250`

- [x] Retain PATH, environment, and home-directory candidates for an explicitly supplied platform.
- [x] Include native fixed-path fallbacks only for the actual host platform.
- [x] Keep normal macOS and Linux production lookup behavior unchanged.

```ts
...(platform === process.platform ? nativeSystemCandidates : [])
```

**Completion criteria**: a simulated Linux miss returns `node` on a macOS host even when Homebrew Node exists, then discovers a newly created PATH executable.

### T2 — Use host-native install integration fixtures

**Status**: ✅

Files: `test/installService.test.js:1-255`

- [x] Derive workspace, storage, and selected-parent fixtures from `process.platform`.
- [x] Build expected child paths with `node:path`.
- [x] Keep explicit Windows normalization assertions in the pure builder tests.

```js
const managedStorageDir = path.join(workspaceDir, ".dshmux");
```

**Completion criteria**: all install-service integration assertions compare paths in the same format that runtime code produces on the host.

### T3 — Verify focused and complete suites

**Status**: ✅

Files: `test/serverManager.test.js`, `test/installService.test.js`, `test/dshInstallService.test.js`

- [x] Run TypeScript compilation and the two formerly failing test files.
- [x] Run the complete `npm test` suite.
- [x] Confirm the sole skip is the pre-existing Windows-only junction test.

```sh
npm run compile && node --test test/serverManager.test.js test/installService.test.js
npm test
```

**Completion criteria**: zero test failures.

### T4 — Close the fix documentation

**Status**: ✅

Files: `doc/fix/test-platform-portability/verification.md`, `summary.md`, `TODO.md`

- [x] Audit code existence and live call sites.
- [x] Record verification results and remaining gaps.
- [x] Mechanically derive TODO from non-complete plan items.

```text
verification -> plan review -> summary + TODO
```

**Completion criteria**: verification has no unresolved gap and TODO reports no outstanding tasks.

## Order

```text
T1 ─┐
    ├─> T3 -> T4
T2 ─┘
```

*Related documents: discussion.md | solution.md*
