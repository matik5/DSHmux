# Managed Storage Location — Summary

**Date**: 2026-09-17
**Worktree**: `~/.worktrees/DSHmux/11-managed-storage-location`, branch `matik/11-managed-storage-location`

## Result

All requirements R1–R6 and gate A7 are implemented and verified. All plan
tasks T1–T9 are ✅; no ❌/⏭️ items. Two informational observations are
recorded in [verification.md](verification.md) (G1: the T5 persist branch is
unreachable until the UI offers a custom managed location; G2: the live-UI
smoke was exercised at the helper level against the real filesystem).

## What changed

- **`src/installService.ts`**
  - New `managedStorageRootsForContext`: ordered, case-deduped roots —
    remembered `dsh.managedStorageDir` → `~/.dshmux` (workspace-host
    homedir) → legacy project `<workspace>/.dshmux` (0.4.8) → legacy
    `globalStorageUri` (0.4.7). Index 0 is the write destination.
  - `managedStorageForContext` is now `roots[0]`; default is
    `<homedir>/.dshmux` instead of the project-local `.dshmux`.
  - New `managedPnpmCandidateForContext`: first pnpm that exists on disk
    across the roots, else the default's pnpm. Used by the Doctor launcher
    probe and the install-verification probe, so a legacy pnpm keeps
    working without re-download.
  - `managedBinsForContext` expands the DSH candidate list over every
    root (source checkout still first): source → `~/.dshmux` → legacy
    project → legacy globalStorage.
  - `resolveVerifiedPnpm` now takes a list of pnpm bins; Node/npm checks
    run once, then it scans the roots in order. `realInstallRuntime` feeds
    it all roots.
  - `runManagedInstall` persists `dsh.managedStorageDir` only when the
    confirmed location differs from the computed default (confirming the
    default no longer pins an absolute home path into `workspaceState`).
  - `runManagedPnpmInstall` shows a modal confirmation with the exact
    destination (`pnpm@<version>`, prefix root) before installing; decline
    does nothing.
- **`src/i18nStrings.ts`** — new key `install.pnpmConfirm` in all 10
  locales (placeholders verbatim).
- **`test/installService.test.js`** — updated fixtures/assertions for the
  new default and non-persistence, full candidate-order `deepEqual`, 4 new
  tests (roots default/remembered, roots dedup, pnpm legacy candidate,
  pnpm decline), and `modalAnswer = "Install"` on the three pnpm-install
  tests.
- **Zero diff** (as planned): `src/dshDoctor.ts`, `src/dshInstallService.ts`,
  `src/extension.ts`, `src/dshChatView.ts`, all other tests.

## Gates

- `npm run compile` (strict tsc): zero issues.
- `npm test`: 255 tests — 254 pass, 0 fail, 1 pre-existing skip.
- Real-filesystem smoke (compiled `out/`, real workspace with a legacy
  `.dshmux`): default resolves to `~/.dshmux`; pnpm candidate resolves to
  the legacy project-local pnpm since `~/.dshmux` has none yet.

No commits were made in this round (per the explicit-path commit policy,
awaiting user instruction).

*Related documents: discussion.md | req.md | solution.md | plan.md | verification.md*
