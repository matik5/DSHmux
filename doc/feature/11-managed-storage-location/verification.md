# Managed Storage Location — Verification

**Date**: 2026-09-17
**Plan**: [plan.md](plan.md) · **Worktree**: `~/.worktrees/DSHmux/11-managed-storage-location`, branch `matik/11-managed-storage-location`

## Gate results (T9)

| Gate | Result |
|---|---|
| `npm run compile` (strict tsc) | ✅ zero issues |
| `npm test` (node:test, full suite) | ✅ 255 tests: 254 pass, 0 fail, 1 pre-existing skip — includes `test/i18n.test.js` 10-locale parity and unchanged `test/dshDoctor.test.js` |
| Changed-file set | ✅ exactly `src/installService.ts`, `src/i18nStrings.ts`, `test/installService.test.js` (verified via `git status --short`; the untracked `doc/feature/11-managed-storage-location/` is pipeline documentation only) |
| Real-filesystem smoke | ✅ one-shot `node` script against compiled `out/installService.js` with the real workspace (`/Users/mati/proj/DSHmux`, which has a legacy `.dshmux`): default root resolved to `~/.dshmux`; roots ordered `~/.dshmux` → project `.dshmux` → globalStorage; pnpm candidate resolved to the **legacy project-local pnpm** because `~/.dshmux` has no pnpm yet — the R3 fallback on a real machine |

## (a) RTTM recheck

| Requirement | Tasks | Verdict |
|---|---|---|
| R1 — default root `~/.dshmux` | T1, T5, T8 | ✅ `managedStorageForContext` returns `<homedir>/.dshmux` with no remembered value (test "storage roots default to the user-level .dshmux…"); default confirm persists no `workspaceState` entry (assertion updated in the pinned-spec test); smoke confirmed `~/.dshmux` as the resolved default on a real workspace |
| R2 — remembered location wins, both tools | T1, T5, T8 | ✅ Remembered value is roots[0] (test asserts full roots order with a remembered custom value; `managedStorageForContext` returns it); DSH candidate list spans all roots with remembered first (candidate-order test, full `deepEqual`); the same roots drive the pnpm candidate, so one choice covers both tools. **RTTM wording note**: the plan's "custom-choice confirm persists `dsh.managedStorageDir`" test was not written because the current UI offers no custom *managed-npm* location — Change… applies only to the source-checkout parent (persisted via `dsh.sourceCheckoutBin`, pre-existing). The T5 guard persists a differing `storageDir` whenever one ever occurs; see gap G1 |
| R3 — legacy roots discoverable, read-only, no re-download | T2, T3, T4, T8 | ✅ `managedBinsForContext` order includes legacy project and globalStorage (full-order test); `managedPnpmCandidateForContext` picks an existing legacy pnpm over an absent default (stubbed-exists test + real-fs smoke); `resolveVerifiedPnpm` scans all root pnpm bins (T4 loop); `test/dshDoctor.test.js` zero diff and green. "Read-only" holds by construction: only `spec.cwd` under roots[0] is ever created/written (`runtime.mkdir(spec.cwd)`) |
| R4 — no migration/cleanup | (non-change) | ✅ `git diff` touches no other source file; no move/delete/prompt code added — `src/dshDoctor.ts`, `src/dshInstallService.ts`, `src/extension.ts`, `src/dshChatView.ts` are unmodified |
| R5 — pnpm confirmation shows exact destination | T6, T7, T8 | ✅ Modal built from `spec.packageSpec` + `spec.cwd` (the pnpm prefix root) shown before any `mkdir`/output channel; decline test asserts `false`, empty `mkdir`/`run`, zero output channels, and that the declined message still names the destination; the three existing pnpm tests now confirm via the modal; `install.pnpmConfirm` exists in all 10 locales (i18n parity test green) |
| R6 — candidate order | T2, T3, T4, T8 | ✅ `managedBinsForContext` deepEqual: source → `~/.dshmux` → project → globalStorage; roots dedup case-insensitively (dedup test: remembered == default appears once, first); Doctor and launcher consume the same helpers (see (b)) |
| A7 — gates | T9 | ✅ compile zero issues; full test suite green |

## (b) Code exists and is called (per ✅ task)

| Task | Symbol | Definition | Call sites |
|---|---|---|---|
| T1 | `managedStorageRootsForContext` | `src/installService.ts` | `managedStorageForContext`, `managedPnpmCandidateForContext`, `managedBinsForContext`, `realInstallRuntime` |
| T1 | `managedStorageForContext` (rewritten) | `src/installService.ts` | `chooseManagedInstall`, T5 persist guard, `runManagedPnpmInstall` spec |
| T2 | `managedBinsForContext` (rewritten) | `src/installService.ts` | `runDoctorForLauncher`, `managedBinForContext`, `src/extension.ts:31` (launcher bin pick) |
| T3 | `managedPnpmCandidateForContext` | `src/installService.ts` | `runDoctorForLauncher` probe, `realInstallRuntime.validate` probe |
| T4 | `resolveVerifiedPnpm(pnpmBins)` (loop) | `src/installService.ts` | `realInstallRuntime.resolvePnpm` (all-root bin list) |
| T5 | persist guard | `runManagedInstall` success branch | — (single call site; behavior asserted by updated test) |
| T6 | pnpm confirmation modal | `runManagedPnpmInstall`, before output channel | reached from Doctor "pnpm" action (`runDoctorCommand`) and the pnpm install command path |
| T7 | `install.pnpmConfirm` | `src/i18nStrings.ts` | `t("install.pnpmConfirm", …)` in T6 |
| T8 | new/updated tests | `test/installService.test.js` | run by `npm test` (all green) |

No dead code was introduced; `managedStorageDirForParent` remains in use by the roots helper.

## (c) Gaps

| ID | Severity | Description | Suggested action |
|---|---|---|---|
| G1 | Informational | The T5 "persist when different" branch is unreachable in the current UI: Change… only redirects the source-checkout parent, so a managed-npm `storageDir` can never differ from the computed default at confirm time. The guard is future-proofing for a UI that offers a custom managed location; R2 (remembered wins, both tools) is fully verified regardless | No action needed this round; the guard becomes testable end-to-end when such a UI ships |
| G2 | Closed (2026-09-17) | Live-UI smoke completed: worktree VSIX packaged (`dshmux-0.4.8.vsix`) and installed into the user's VS Code (`~/.vscode/extensions/matik5.dshmux-0.4.8`, new symbols verified in the installed `out/`); after window reload the user confirmed "seems to work" — Doctor reports pnpm available from the legacy project root and offers the DSH install into `~/.dshmux` | None |

**No defects found. No requirement is unmet.**

*Related documents: discussion.md | req.md | solution.md | plan.md*
