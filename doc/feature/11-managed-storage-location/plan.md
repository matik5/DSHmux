# Managed Storage Location — Implementation Plan

**Date**: 2026-09-17
**Sources**: [discussion.md](discussion.md), [req.md](req.md), [solution.md](solution.md)

**Worktree**: `~/.worktrees/DSHmux/11-managed-storage-location`, branch
`matik/11-managed-storage-location` (from main `5fb5884`).

**Behavior recap** (from approved req.md): default managed storage root for
DSH and pnpm becomes `<homedir>/.dshmux` on the workspace host (R1); a
remembered explicit location still wins and applies to both tools (R2);
legacy roots (project `<workspace>/.dshmux`, VS Code `globalStorageUri`)
stay discoverable, read-only fallbacks (R3); no migration/cleanup (R4);
pnpm install confirms the exact destination first (R5); candidate order
remembered → `~/.dshmux` → legacy project → legacy globalStorage →
configured/discovery (R6).

**Files changed by this plan**: `src/installService.ts`,
`src/i18nStrings.ts`, `test/installService.test.js`. Zero diff:
`src/dshDoctor.ts`, `src/dshInstallService.ts`, `src/extension.ts`,
`src/dshChatView.ts`, all other tests.

## RTTM

| Requirement | Task | Verification |
|---|---|---|
| R1 — default root `~/.dshmux` | T1, T5 | T8 test: `managedStorageForContext` returns `<homedir>/.dshmux` with no remembered value; T8 test: default confirm persists no state; T9 smoke: fresh install writes under `~/.dshmux`, project dir untouched |
| R2 — remembered location wins, both tools | T1, T5 | T8 test: roots order remembered-first; T8 test: custom-choice confirm persists `dsh.managedStorageDir`; existing T8 candidate-order test (source first, then roots) |
| R3 — legacy roots discoverable, read-only, no re-download | T2, T3, T4 | T8 test: `managedPnpmCandidateForContext` picks legacy project pnpm when `~/.dshmux` has none; T8 test: full bin order includes legacy project and globalStorage roots; `test/dshDoctor.test.js` unchanged and green; T9 smoke: legacy project install reports ready with no re-download |
| R4 — no migration/cleanup | (non-change) | Verification audit: zero diff in `src/dshDoctor.ts`, `src/dshInstallService.ts`; no move/delete/prompt code added (code review at verification stage) |
| R5 — pnpm confirmation shows exact destination | T6, T7 | T8 test: declining the modal → `false`, no `mkdir`/`run`, no output channel; T8 tests: 3 existing pnpm tests confirm via modal and proceed; T9 smoke: Doctor pnpm action shows destination before install |
| R6 — candidate order | T2, T3, T4 | T8 test: `managedBinsForContext` order source → `~/.dshmux` → project → globalStorage; T8 test: `managedStorageRootsForContext` dedup; Doctor and launcher consume the same helpers (code review at verification stage) |
| A7 — gates | T9 | `npm run compile` zero issues; `npm test` green (incl. `test/i18n.test.js` 10-locale parity) |

## Tasks

### T1 — Ordered storage roots helper ✅

**File**: `src/installService.ts:54-70`

- [ ] Add `managedStorageRootsForContext` after `managedStorageDirForParent`
      (lines 58-63):

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

- [ ] Rewrite `managedStorageForContext` (lines 65-70) to:

```ts
export function managedStorageForContext(context: vscode.ExtensionContext): string {
  return managedStorageRootsForContext(context)[0];
}
```

(`MANAGED_STORAGE_KEY` at line 51, `os` and `path` imports already present;
roots are never empty because the homedir root is always added.)

**Completion criteria**: `npm run compile` clean; order is remembered →
`~/.dshmux` → legacy project → legacy globalStorage, deduped
case-insensitively.

### T2 — DSH candidate list expands over all roots ✅

**File**: `src/installService.ts:72-82`

- [ ] Rewrite `managedBinsForContext`:

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

- [ ] Leave `managedBinForContext` (lines 84-86, `bins[0]`) unchanged.

**Completion criteria**: `npm run compile` clean; order source →
remembered root → `~/.dshmux` → legacy project → legacy globalStorage.

### T3 — pnpm selection helper + Doctor probe ✅

**File**: `src/installService.ts:88-96`

- [ ] Add next to the storage helpers:

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

- [ ] In `runDoctorForLauncher` (line 94), replace
      `managedPnpmBin(managedStorageForContext(context), process.platform)`
      with `managedPnpmCandidateForContext(context)`.

**Completion criteria**: `npm run compile` clean; Doctor's pnpm probe sees
a legacy project-local pnpm when `~/.dshmux` has none.

### T4 — DSH repair pnpm gate scans all roots ✅

**File**: `src/installService.ts:369-446`

- [ ] Change `resolveVerifiedPnpm(storageDir: string)` (line 369) to
      `resolveVerifiedPnpm(pnpmBins: string[])`: Node check (lines 370-388)
      and npm check (lines 389-398) run once, then loop:

```ts
for (const pnpmBin of pnpmBins) {
  const launch = resolvePnpmLaunchSpec(node, pnpmBin, env, process.platform, fs.existsSync);
  if (!launch) continue;
  const result = spawnSync(launch.command, [...launch.argsPrefix, "--version"], {
    encoding: "utf8", env, timeout: 5_000, shell: false, windowsHide: true,
  });
  if (result.status === 0 && isSupportedPnpmVersion(result.stdout)) return launch;
}
return null;
```

(replaces the single attempt at lines 399-414; `resolvePnpmLaunchSpec`
returns null when the injected bin is absent, so the loop advances to the
next root).
- [ ] In `realInstallRuntime` (lines 417-446): replace
      `const storageDir = managedStorageForContext(context)` (line 418)
      with `const roots = managedStorageRootsForContext(context)`; set
      `resolvePnpm: () => resolveVerifiedPnpm(roots.map((root) =>
      managedPnpmBin(root, process.platform)))`; and the `validate`
      Doctor-probe pnpm path (line 435) becomes
      `managedPnpmCandidateForContext(context)`.

**Completion criteria**: `npm run compile` clean; DSH repair succeeds when
pnpm exists only in a legacy root; a new install still verifies against the
root being written.

### T5 — Persist explicit choice only ✅

**File**: `src/installService.ts:567`

- [ ] Replace the unconditional persist in `runManagedInstall` with:

```ts
if (storageDir && storageDir.toLowerCase() !== managedStorageForContext(context).toLowerCase()) {
  await context.workspaceState.update(MANAGED_STORAGE_KEY, storageDir);
}
```

(At this point `MANAGED_STORAGE_KEY` is unset — the user confirmed the
default — so the comparison is against the `~/.dshmux` default. A Change…
choice is still persisted (R2). A persisted absolute home path would go
stale if the home directory moves; the computed default always tracks
`os.homedir()`.)

**Completion criteria**: `npm run compile` clean; default confirm writes no
`workspaceState` entry; custom-location confirm persists it.

### T6 — pnpm confirmation modal ✅

**File**: `src/installService.ts:660-664`

- [ ] In `runManagedPnpmInstall`, move the `spec` build (line 664) to the
      very top and add, before opening the output channel:

```ts
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

(Native Cancel only, no "Cancel" button — matches `chooseManagedInstall`.
`spec.cwd` is `managedPnpmRoot`, the exact destination directory (R5).)

**Completion criteria**: `npm run compile` clean; Doctor pnpm action shows
the exact destination; install starts only after confirmation.

### T7 — i18n key `install.pnpmConfirm` ✅

**File**: `src/i18nStrings.ts` (next to `install.managedConfirm`, line 1012)

- [ ] Add the new key with non-empty values for all 10 locales (en, zh,
      ja, ko, et, es, pt, fr, de, uk). English:
      `Install {package}.\n\nLocation: {path}`. Translate the same shape
      into the other 9 locales (placeholders kept verbatim). No other
      string changes.

**Completion criteria**: `npm test` passes `test/i18n.test.js` (all keys ×
10 locales; exact locale column set).

### T8 — Test updates and new coverage ✅

**File**: `test/installService.test.js`

The vscode mock is fresh per test and `node:os` is NOT mocked, so tests
compute the expected default as `os.homedir()` (same value the code uses).

- [ ] Add to the header: `const os = require("node:os");` and fixture
      `const homeStorageDir = path.join(os.homedir(), ".dshmux");`
      (after line 16).
- [ ] Line 173 ("managed install cancellation at confirmation…"): change
      `assert.ok(messages[0].includes(managedStorageDir));` to assert the
      modal shows `homeStorageDir` (the new default destination).
- [ ] Line 219 ("managed install runs exact pinned non-global npm
      spec…"): replace
      `assert.equal(workspaceValues.get("dsh.managedStorageDir"), managedStorageDir);`
      with `assert.equal(workspaceValues.has("dsh.managedStorageDir"), false);`
      (T5: default confirm is not persisted).
- [ ] Lines 241-258 ("patched source is offered as a project checkout
      under .dshmux"): change `managedCheckoutDir` expectations (lines
      250-251) to the checkout under `homeStorageDir`
      (`<homeStorageDir>/deepseek-harness`).
- [ ] Lines 431-469 (3 pnpm tests): set the modal confirm answer before
      `runManagedPnpmInstall` (`modalAnswer = "Install";`).
- [ ] New test: declining the pnpm modal returns `false` with
      `rt.calls.mkdir`/`rt.calls.run` empty and `outputChannels.length === 0`.
- [ ] Extend the candidate-order test (lines 289-297): assert the full bin
      order — `bins[0] === source`, then
      `path.join(homeStorageDir, "managed-dsh", "0.1.5-rc.2",
      "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js")`, then
      `path.join(managedStorageDir, "managed-dsh", …)` (legacy project),
      then `path.join(globalStorageDir, "managed-dsh", …)` (legacy
      globalStorage).
- [ ] New test: `managedStorageForContext(context)` returns
      `homeStorageDir` with no remembered value, and returns the remembered
      value when `workspaceValues.set("dsh.managedStorageDir", …)`.
- [ ] New test: `managedPnpmCandidateForContext` with a stubbed `exists`
      matching only the legacy project root returns that root's pnpm bin.
- [ ] New test: `managedStorageRootsForContext` dedup — a remembered root
      equal to `homeStorageDir` appears exactly once, in first position.

**Completion criteria**: `npm test` green with all new assertions.

### T9 — Build + full gate ✅

**Worktree root**

- [ ] `npm run compile` — strict tsc, zero issues (including informational).
- [ ] `npm test` — full suite green, including `test/i18n.test.js` and
      unchanged `test/dshDoctor.test.js` (expected zero diff there: Doctor
      tests inject probe paths directly).
- [ ] Smoke (verification stage, manual): with a legacy
      `<workspace>/.dshmux` in place and no `~/.dshmux`, Doctor reports
      ready from the legacy root and offers a pnpm/DSH install into
      `~/.dshmux`.

**Completion criteria**: both gates pass; the only changed files are
`src/installService.ts`, `src/i18nStrings.ts`,
`test/installService.test.js`.

## Order

```
T1 (roots helper) ──┬─ T2 (bins over all roots)
                    ├─ T3 (pnpm candidate + Doctor probe)
                    ├─ T4 (repair pnpm gate)
                    └─ T5 (persist explicit only)
T7 (i18n key) ────── T6 (pnpm modal)
T1..T7 ───────────── T8 (tests) ───── T9 (compile + npm test + smoke)
```

## Status

- T1 ✅ — implemented per plan; order remembered → `~/.dshmux` → legacy project → legacy globalStorage, case-deduped
- T2 ✅ — implemented per plan; full-order test asserts source → home → project → globalStorage
- T3 ✅ — implemented per plan; stubbed-exists test + real-fs smoke confirm legacy pnpm discovery
- T4 ✅ — implemented per plan; Node/npm checks run once, then all-root pnpm loop
- T5 ✅ — implemented per plan; default confirm persists nothing (test asserts `has === false`). Note: the persist-when-different branch is unreachable in the current UI (verification.md G1)
- T6 ✅ — implemented per plan; decline test asserts no `mkdir`/`run`/output channel
- T7 ✅ — implemented per plan; `install.pnpmConfirm` in all 10 locales, i18n parity test green
- T8 ✅ — implemented per plan with all new assertions, plus 4 new tests (roots default/remembered, roots dedup, pnpm legacy candidate, pnpm decline). One RTTM wording item ("custom-choice confirm persists `dsh.managedStorageDir`") is not testable with the current UI — see verification.md G1
- T9 ✅ — `npm run compile` zero issues; `npm test` 254 pass / 0 fail / 1 pre-existing skip; changed-file set exactly the 3 planned files. Manual live-UI smoke exercised at the helper level against the real filesystem instead (verification.md G2)

*Related documents: discussion.md | req.md | solution.md*
