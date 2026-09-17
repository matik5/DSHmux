# Managed Storage Location — Discussion

**Date**: 2026-09-17

## User request

Doctor-managed installs should be "least surprising" for the user:

- when pnpm is missing, propose installing it to `~/.dshmux/...` by default;
- when DSH is missing, propose installing it to `~/.dshmux/...` by default.

The user-level directory is the default. The explicit "Install globally" and
"Change…" choices remain available. Stale copies left in older locations are
NOT migrated and NOT offered for cleanup — the user deletes them manually.
They must keep working as discoverable fallbacks until deleted.

## Observed environment

- Running DSHmux Doctor in `/Users/mati/proj/DSHmux` installed pnpm 11.7.0
  into `/Users/mati/proj/DSHmux/.dshmux/managed-pnpm/11.7.0/` (~19 MB) —
  inside the open project, with no destination shown before the install
  started.
- The pnpm install action runs immediately from the Doctor row; only the DSH
  repair shows a confirmation modal with the exact destination.
- The project-local `.dshmux` content is currently invisible to `git status`
  only because every file sits under a `node_modules/` directory matched by
  the repository `.gitignore`; in a project without that rule it would
  pollute the working tree.
- Each newly opened project re-downloads its own managed copy, because the
  default storage root follows the first workspace folder.

## Code-audit facts

- `src/installService.ts:51` — the remembered location is
  `dsh.managedStorageDir` in `workspaceState` (per workspace).
- `src/installService.ts:58-63` — `managedStorageDirForParent(parent)` joins
  `parent` with `.dshmux`.
- `src/installService.ts:65-70` — `managedStorageForContext()` resolves:
  remembered location → first workspace folder → `os.homedir()` (only when
  no folder is open).
- `src/installService.ts:73-82` — `managedBinsForContext()` candidate order:
  remembered source checkout, current managed DSH, legacy
  `context.globalStorageUri` managed DSH (0.4.7), deduplicated.
- `src/installService.ts:89-96` — `runDoctorForLauncher()` builds the pnpm
  candidate from `managedStorageForContext()`, so pnpm always shares DSH's
  storage root.
- `src/installService.ts:660-697` — `runManagedPnpmInstall()` builds the
  spec from `managedStorageForContext()`, shows no confirmation modal, and
  installs directly under a cancellable progress notification; the npm
  command line is appended to the Doctor output channel only.
- `src/dshInstallService.ts:113-118` — `managedDshRoot(storageDir)` =
  `storageDir/managed-dsh/<TESTED_DSH_VERSION>`.
- `src/dshInstallService.ts:136-155` — `managedPnpmRoot(storageDir)` =
  `storageDir/managed-pnpm/11.7.0`; `managedPnpmBin` =
  `.../node_modules/pnpm/bin/pnpm.cjs`.
- `src/dshInstallService.ts:158-171` — managed pnpm install is
  `npm install --prefix <root> --no-save --no-audit --no-fund pnpm@11.7.0`.
- `src/dshDoctor.ts:141-172` — Doctor receives `managedPnpmPath` as an
  injected probe input; it never computes storage paths itself.
- History: 05-managed-dependencies (0.4.7) stored managed DSH in VS Code
  `globalStorageUri`; the R2 amendment (commit `dfdd4c0`, approved
  2026-09-13) added the visible choices "Install globally" vs
  "project-specific" (default `<workspace>/.dshmux/managed-dsh/...`) with
  "Change…"; 10-pnpm-prerequisite (commit `d14eb91`) reuses
  `managedStorageForContext()` for pnpm without re-presenting a location
  choice.

## Design direction (agreed in conversation)

- New default root: `<homedir>/.dshmux` on the workspace host — one install
  per machine, shared by all projects, remote-safe (home of the machine that
  runs the workspace extension host).
- Inner names `managed-dsh` / `managed-pnpm` and the versioned layout stay
  unchanged.
- Resolution order for managed installs: remembered explicit location →
  `~/.dshmux` → legacy project `<workspace>/.dshmux` → legacy
  `globalStorageUri` → global npm / configured path / discovery.
- pnpm follows DSH's storage root; a user-chosen Change… location applies to
  both.
- Legacy locations stay readable/discoverable; no migration, no cleanup
  offer, no writes to legacy locations.

## Scope boundary

This feature changes the default managed storage location, the candidate
discovery order, and the pnpm confirmation UX. It does not change: version
pinning, install commands, verification, the global-install choice, the
source-checkout flow, or Doctor's state model. No migration or cleanup UI of
any kind.
