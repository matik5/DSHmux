# Managed Storage Location — Solution

**Date**: 2026-09-17
**Status**: APPROVED (2026-09-17)
**Sources**: [discussion.md](discussion.md), [req.md](req.md)

## 1. Goal

- The managed install default root becomes `<homedir>/.dshmux` on the
  workspace host, shared by managed DSH and managed pnpm (R1).
- A remembered explicit location still wins and applies to both tools (R2).
- Legacy roots (project-local `<workspace>/.dshmux`, VS Code
  `globalStorageUri`) stay discoverable, read-only fallbacks (R3); nothing is
  migrated, moved, or offered for deletion (R4).
- The pnpm install action confirms the exact destination before installing
  (R5).
- Candidate order: remembered → `~/.dshmux` → legacy project → legacy
  globalStorage → configured/discovery (R6).

## 2. Facts (verified against the code)

- `src/installService.ts:51` — `MANAGED_STORAGE_KEY = "dsh.managedStorageDir"`
  (per-workspace `workspaceState`) remembers an explicit location.
- `src/installService.ts:58-63` — `managedStorageDirForParent(parent)` =
  `join(parent, ".dshmux")`, platform-aware path join.
- `src/installService.ts:65-70` — `managedStorageForContext(context)`:
  remembered → `workspaceFolders[0]` → `os.homedir()` (only when no folder
  is open). **This is the current write destination and the source of the
  project-local default.**
- `src/installService.ts:73-82` — `managedBinsForContext(context)`:
  `[source, current, legacy-globalStorage]`, deduped case-insensitively.
  `current` = `managedDshBin(managedStorageForContext(...))`, `legacy` =
  `managedDshBin(context.globalStorageUri.fsPath)`.
- `src/installService.ts:84-86` — `managedBinForContext` = bins[0]; exported,
  no other references in `src/` or `test/`.
- `src/installService.ts:89-96` — `runDoctorForLauncher`: DSH managed
  candidate = first candidate with `resolveDshVersion === TESTED_DSH_VERSION`
  else `[0]`; pnpm candidate = `managedPnpmBin(managedStorageForContext(...))`
  — a **single** pnpm path per Doctor run.
- `src/installService.ts:369-415` — `resolveVerifiedPnpm(storageDir)`:
  verifies Node + npm, then `resolvePnpmLaunchSpec(node,
  managedPnpmBin(storageDir), ...)` and `pnpm --version` gate. Single root.
- `src/installService.ts:417-446` — `realInstallRuntime(context)` builds
  `resolvePnpm` and `validate` (Doctor probe) from
  `managedStorageForContext(context)` — single root.
- `src/installService.ts:461-520` — `chooseManagedInstall`: modal
  `install.managedConfirm` **shows `spec.cwd` (exact destination)** with
  buttons Install globally / Install to shown location / source switch /
  Change…. Line 497: `sourceParent ??= storageDir` — the source-checkout
  default parent **is** the storage root.
- `src/installService.ts:523-578` — `runManagedInstall`: pnpm gate →
  `chooseManagedInstall` → install → verify → on success persists
  `MANAGED_STORAGE_KEY` = chosen `storageDir` (line 567) **unconditionally**.
- `src/installService.ts:660-697` — `runManagedPnpmInstall`: builds spec from
  `managedStorageForContext(context)`, opens output channel, installs under
  cancellable progress, verifies, success/fail messages. **No confirmation
  modal and no destination shown** (R5 gap).
- `src/dshInstallService.ts:113-155` — `managedDshRoot/Bin(storageDir,
  platform)` = `storageDir/managed-dsh/<TESTED_DSH_VERSION>/...`;
  `managedPnpmRoot/Bin(storageDir, platform)` =
  `storageDir/managed-pnpm/11.7.0/node_modules/pnpm/bin/pnpm.cjs`. Pure
  path helpers — **no change needed**.
- `src/dshInstallService.ts:158-171` — `buildManagedPnpmInstallSpec` =
  `npm install --prefix <root> --no-save --no-audit --no-fund pnpm@11.7.0`.
- `src/dshInstallService.ts:313-380` — `resolvePnpmLaunchSpec(node,
  managedBin, ...)`: candidate 1 is the injected `managedBin`; only then
  PATH-based pnpm candidates (appData/npm, PATH dirs). A pnpm root that is
  not injected is invisible to Doctor.
- `src/dshDoctor.ts:100-146, 151-208` — `DoctorProbe` carries
  `managedDshPath?` and `managedPnpmPath` as **injected single paths**;
  `realDoctorProbe(hostLabel, configuredDshPath, managedDshPath,
  managedPnpmPath)` wires the real fs/spawn. `runDoctor` itself is pure.
- `src/dshDoctor.ts:320-334` — DSH resolution in Doctor: valid managed →
  configured → global discovery. No change needed.
- `src/extension.ts:30-35` — launch-time DSH provider: first
  `managedBinsForContext(context)` candidate whose `resolveDshVersion`
  matches, else `configuredDshBin()`.
- `src/dshChatView.ts:168, 209` — chat view runs `runDoctorForLauncher`
  before start (and on error).
- `src/i18nStrings.ts:1012-1023` — `install.managedConfirm` shows
  `{package}` and `{path}` in all 10 locales.
- `src/i18nStrings.ts` + `test/i18n.test.js:13-31` — every key must have a
  non-empty value in **all 10 locales** (en, zh, ja, ko, et, es, pt, fr, de,
  uk); the locale column set must be exactly those 10.
- `test/installService.test.js:9-16, 173, 219, 250-251` — fixtures:
  `workspaceDir = /Projects/Current` (mocked vscode only; **`node:os` is
  not mocked** — `os.homedir()` is the real home at test time). Assertions
  pin the current project-local default: line 173 (modal shows
  `<workspace>/.dshmux/managed-dsh/...`), line 219 (remembered value =
  `<workspace>/.dshmux`), lines 250-251 (source checkout under
  `<workspace>/.dshmux`).
- `test/installService.test.js:431-469` — pnpm install tests call
  `runManagedPnpmInstall` with no modal interaction; adding a confirmation
  modal (R5) will cancel them unless fixtures are updated.
- `test/dshDoctor.test.js:210-212` — already fixtures pnpm under
  `~/.dshmux/managed-pnpm/...`; pure test data, zero diff.

## 3. Gap

1. `managedStorageForContext` defaults to the first workspace folder, not
   `~/.dshmux` (R1).
2. Candidate lists contain only the *current* root and the 0.4.7
   globalStorage root; the 0.4.8 project-local root is only reachable while
   it happens to equal the current root (R3, R6).
3. The pnpm probe and the DSH-repair pnpm gate each see exactly one pnpm
   root — a legacy project-local pnpm would become invisible after the R1
   flip (R3, R6).
4. `runManagedPnpmInstall` shows no destination and no confirmation (R5).
5. On a confirmed default-location install the code persists the root into
   per-workspace state (line 567), pinning an absolute home path that would
   go stale if the home directory moves (R1 hygiene).

## 4. Call-site audit

### 4.1 `managedStorageForContext` — return semantics change (new default root)

| Call site | Classification |
|---|---|
| `src/installService.ts:74` (`managedBinsForContext`) | **conflict → rewritten by T2** to expand all roots. |
| `src/installService.ts:94` (`runDoctorForLauncher`, pnpm probe path) | **conflict → rewritten by T3** to select across roots. |
| `src/installService.ts:418` (`realInstallRuntime`, pnpm gate + validate probe) | **conflict → rewritten by T4** to select across roots. |
| `src/installService.ts:464` (`chooseManagedInstall`, modal destination) | **compatible** — the destination shown is exactly the new default (or remembered). |
| `src/installService.ts:497` (`chooseManagedInstall`, `sourceParent ??= storageDir`) | **compatible, noted** — the source-checkout default parent moves with the storage root to `~/.dshmux/deepseek-harness`. Flow, options, and verification are unchanged (non-goal preserved); the location follows R1. |
| `src/installService.ts:664` (`runManagedPnpmInstall`, spec root) | **compatible** — installs into the new default root (R1). |
| `test/installService.test.js:173, 219, 250-251` | **conflict → test updates T8** to homedir-based expectations. |

### 4.2 `managedBinsForContext` — candidate list changes (root expanded)

| Call site | Classification |
|---|---|
| `src/extension.ts:31` (launch-time DSH provider) | **compatible** — the widened list only adds the new default and the legacy project root; the version-matching pick is unchanged. |
| `src/installService.ts:85` (`managedBinForContext`) | **compatible** — index 0 only changes when a remembered or `~/.dshmux` install exists, which is the intended default. No external callers. |
| `src/installService.ts:90` (`runDoctorForLauncher`) | **compatible** — same selection logic, wider candidate list (R6). |
| `test/installService.test.js:289-297` ("remembered source checkout precedes…") | **compatible** — asserts `bins[0] === source` and `some(...)` membership; new root is an extra entry. T8 extends it with an explicit order assertion. |

### 4.3 `runManagedPnpmInstall` — new confirmation precondition (R5)

| Call site | Classification |
|---|---|
| `src/installService.ts:748` (Doctor QuickPick "pnpm" action) | **compatible** — the confirmation is the desired UX before this flow. |
| `test/installService.test.js:431-469` (3 pnpm tests) | **conflict → test update T8** — set the modal answer to the confirm button; cancellation test added. |

### 4.4 `resolveVerifiedPnpm` — parameter becomes a pnpm bin (not a root)

Private (single caller `src/installService.ts:421`, rewritten by T4). No
external contract.

No other references to the touched symbols exist in `src/` or `test/`
(verified by repository-wide grep, 2026-09-17).

## 5. Tasks

### T1 — Ordered storage roots helper (`src/installService.ts:54-70`)

Add, after `managedStorageDirForParent`:

```ts
/**
 * Ordered, deduplicated managed storage roots. Index 0 is where new
 * installs write (remembered choice, else the user-level default); the
 * rest are read-only legacy fallbacks (0.4.8 project-local, 0.4.7
 * globalStorage).
 */
export function managedStorageRootsForContext(
  context: vscode.ExtensionContext
): string[] {
  const roots: string[] = [];
  const add = (root: string | undefined): void => {
    if (!root?.trim()) return;
    if (!roots.some((existing) => existing.toLowerCase() === root.toLowerCase())) {
      roots.push(root);
    }
  };
  add(context.workspaceState.get<string>(MANAGED_STORAGE_KEY)?.trim());
  add(managedStorageDirForParent(os.homedir(), process.platform));
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspace) add(managedStorageDirForParent(workspace, process.platform));
  add(context.globalStorageUri.fsPath);
  return roots;
}
```

Rewrite `managedStorageForContext` (lines 65-70) to:

```ts
export function managedStorageForContext(context: vscode.ExtensionContext): string {
  return managedStorageRootsForContext(context)[0];
}
```

Roots are never empty (the homedir root is always added), so `[0]` is
defined.

**Completion criteria**: `npm run compile` clean; root order is
remembered → `~/.dshmux` → legacy project → legacy globalStorage, deduped
case-insensitively.

### T2 — DSH candidate list expands over all roots (`src/installService.ts:72-82`)

Rewrite `managedBinsForContext`:

```ts
/** Remembered source checkout, then the managed bin of every storage root in order. */
export function managedBinsForContext(context: vscode.ExtensionContext): string[] {
  const source = context.workspaceState.get<string>(SOURCE_CHECKOUT_KEY)?.trim();
  const bins = [source,
    ...managedStorageRootsForContext(context).map((root) => managedDshBin(root, process.platform))
  ].filter((candidate): candidate is string => Boolean(candidate));
  return bins.filter((candidate, index, all) =>
    all.findIndex((other) => other.toLowerCase() === candidate.toLowerCase()) === index
  );
}
```

Order: source → remembered root → `~/.dshmux` → legacy project → legacy
globalStorage (R6; source-first is pre-existing behavior).

**Completion criteria**: `npm run compile` clean; `managedBinForContext`
unchanged (bins[0]).

### T3 — Single existing pnpm selection helper + Doctor probe (`src/installService.ts:88-96`)

Add a pure selection helper next to the storage helpers:

```ts
/** First managed pnpm that exists on disk, else the new default's pnpm. */
export function managedPnpmCandidateForContext(
  context: vscode.ExtensionContext,
  exists: (path: string) => boolean = fs.existsSync
): string {
  const candidates = managedStorageRootsForContext(context)
    .map((root) => managedPnpmBin(root, process.platform));
  return candidates.find((candidate) => exists(candidate)) ?? candidates[0];
}
```

(`fs` is already imported in this file, lines 1-47.)

In `runDoctorForLauncher` (line 94), replace
`managedPnpmBin(managedStorageForContext(context), process.platform)` with
`managedPnpmCandidateForContext(context)`.

**Completion criteria**: `npm run compile` clean; Doctor's pnpm probe sees a
legacy project-local pnpm when `~/.dshmux` has none (R3).

### T4 — DSH repair pnpm gate scans all roots (`src/installService.ts:369-446`)

- Change `resolveVerifiedPnpm(storageDir: string)` (line 369) to
  `resolveVerifiedPnpm(pnpmBins: string[])`: try each bin in order —
  `resolvePnpmLaunchSpec(node, pnpmBin, ...)` (line 399) returns null when
  the injected bin is absent, so the loop simply moves to the next root —
  and verify the first launch with `pnpm --version` (lines 407-414). Node
  and npm checks (lines 370-398) run once, before the loop.
- In `realInstallRuntime` (lines 417-446): replace
  `const storageDir = managedStorageForContext(context)` with
  `const roots = managedStorageRootsForContext(context)`;
  `resolvePnpm: () => resolveVerifiedPnpm(roots.map((root) =>
  managedPnpmBin(root, process.platform)))`; and the `validate` probe
  (line 435) uses `managedPnpmCandidateForContext(context)`.

**Completion criteria**: `npm run compile` clean; DSH repair succeeds when
pnpm exists only in a legacy root (R3), and installs verify against the
root being written (R1).

### T5 — Persist explicit choice only (`src/installService.ts:567`)

Replace the unconditional persist with a default-skip:

```ts
if (storageDir && storageDir.toLowerCase() !== managedStorageForContext(context).toLowerCase()) {
  await context.workspaceState.update(MANAGED_STORAGE_KEY, storageDir);
}
```

At this point `MANAGED_STORAGE_KEY` is unset (confirming the default), so
the comparison is against the `~/.dshmux` default. An explicitly chosen
custom location (Change…) is still persisted (R2). Reason: a persisted
absolute home path would go stale if the home directory moves, while the
computed default always tracks `os.homedir()`.

**Completion criteria**: `npm run compile` clean; confirming the default
writes no `workspaceState` entry; confirming a custom location persists it.

### T6 — pnpm confirmation modal (`src/installService.ts:660-664`)

At the top of `runManagedPnpmInstall`, before opening the output channel:

```ts
const spec = buildManagedPnpmInstallSpec(managedStorageForContext(context), process.platform);
const confirm = t("install.managedRun");
if (
  await vscode.window.showInformationMessage(
    t("install.pnpmConfirm", { package: spec.packageSpec, path: spec.cwd }),
    { modal: true },
    confirm
  ) !== confirm
) {
  return false;
}
```

Native Cancel (no "Cancel" button, matching `chooseManagedInstall`).
`spec.cwd` is `managedPnpmRoot` — the exact destination directory (R5).

**Completion criteria**: `npm run compile` clean; clicking the Doctor pnpm
action shows the exact destination; the install starts only after
confirmation.

### T7 — i18n key `install.pnpmConfirm` (`src/i18nStrings.ts`)

Add a new key next to `install.managedConfirm` (line 1012) with non-empty
values for all 10 locales (en, zh, ja, ko, et, es, pt, fr, de, uk), e.g.
en: `Install {package}.\n\nLocation: {path}`. No other string changes.

**Completion criteria**: `npm test` passes `test/i18n.test.js` (all keys ×
all 10 locales, exact locale column set).

### T8 — Test updates and new coverage (`test/installService.test.js`)

The vscode mock is per-module-fresh and `node:os` is not mocked, so tests
compute the expected default as `os.homedir()` (same value the code uses).

- Add fixture: `const homeStorageDir = path.join(os.homedir(), ".dshmux")`
  (requires `const os = require("node:os");` at the top).
- Line 173: modal destination assertion → `homeStorageDir` (and
  `managed-dsh/<version>` under it), not `managedStorageDir`.
- Line 219: remembered-value assertion → after confirming the **default**,
  `workspaceValues.has("dsh.managedStorageDir")` is `false` (T5).
- Lines 241-258 ("patched source … under .dshmux"): expect the checkout
  under `homeStorageDir/deepseek-harness`.
- Lines 431-469 (3 pnpm tests): set the modal confirm answer
  (`modalAnswer = "Install"`) before `runManagedPnpmInstall`; add one test:
  declining the modal returns `false` with no `mkdir`/`run` calls and no
  output channel.
- Extend the candidate-order test (lines 289-297): assert the full bin
  order source → `homeStorageDir/managed-dsh/...` →
  `<workspace>/.dshmux/managed-dsh/...` → `Code Storage/managed-dsh/...`.
- New test: `managedStorageForContext` returns `homeStorageDir` with no
  remembered value; returns the remembered value when one is set.
- New test: `managedPnpmCandidateForContext` with a stubbed `exists` that
  only matches the legacy project root returns that root's pnpm bin.
- New test: `managedStorageRootsForContext` dedup — a remembered root equal
  to `~/.dshmux` appears once, in first position.

**Completion criteria**: `npm test` green with the new assertions.

### T9 — Build + full gate

- `npm run compile` (strict tsc, zero issues).
- `npm test` (full suite, including `test/i18n.test.js` and
  `test/dshDoctor.test.js` — expected zero diff there: the Doctor tests
  inject probe paths directly).
- Manual smoke (per verification stage, not this gate): with a legacy
  `<workspace>/.dshmux` in place and no `~/.dshmux`, Doctor reports ready
  from the legacy root and offers a pnpm/DSH install into `~/.dshmux`.

**Completion criteria**: both gates pass; no other test file changed.

## 6. Explicit non-changes

- `src/dshDoctor.ts` — zero diff (probe inputs are injected).
- `src/dshInstallService.ts` — zero diff (pure `storageDir`-parameter
  helpers).
- `src/extension.ts`, `src/dshChatView.ts` — zero diff (they consume the
  unchanged signatures).
- Global-install choice, source-checkout flow/options, version pins,
  install commands, verification logic, Doctor state model — unchanged.
- No migration, move, or cleanup of legacy locations (R4).

## 7. Risks and mitigations

- **Read-only homedir**: `mkdir` fails → existing bounded failure path
  (error message + Open log). Doctor still reports the environment; nothing
  is silently retried elsewhere.
- **Remote SSH**: `os.homedir()` resolves on the workspace host (the
  extension host process), which is the requirement (R1); `globalStorageUri`
  remains a legacy candidate only.
- **Stale remembered path** (e.g., renamed custom directory): pre-existing
  behavior, unchanged — the remembered path fails verification and the
  modal lets the user Change… again.
