# pnpm Prerequisite — Implementation Plan

**Date**: 2026-09-15
**Status**: Approved by user on 2026-09-15
**Sources**: [discussion.md](discussion.md), [req.md](req.md), [solution.md](solution.md)

## Requirement-to-task traceability matrix (RTTM)

| Requirement | Task | Verification |
|---|---|---|
| R1 — Explicit pnpm health check | T2, T4 | Doctor unit tests assert pnpm row data for found, missing, and unrunnable launches; UI test observes the pnpm Quick Pick row. |
| R2 — Version compatibility | T1, T2 | Boundary tests accept exactly 11.7.0 and reject missing, malformed, older, and newer versions. |
| R3 — Installation gate | T3, T4 | Tests prove Doctor withholds DSH repair and the installer boundary returns before chooser/runtime mutation when pnpm fails. |
| R4 — pnpm install option | T1, T3, T4 | Tests assert exact pinned npm argv, cancellation/failure behavior, post-success verification, and Doctor refresh. |
| R5 — Platform-safe execution | T1, T3 | Windows tests assert `node.exe <pnpm.cjs>` with structured argv and `shell: false`; source installs contain no `npm exec`. |
| R6 — Existing prerequisite ordering | T2, T4 | State/action matrix covers Node → npm → pnpm → DSH and proves runnable DSH remains ready. |
| R7 — Localized UI | T4 | i18n parity test proves each new key has all ten locales; Doctor UI tests assert the new labels/messages. |
| R8 — Regression coverage | T5, T6 | Full `npm test`, call-site audit, and close-out verification pass. |

## Tasks

### T1 — Add managed pnpm paths, installation, resolution, and validation

**Status**: ✅ done

**Files**:

- `src/dshInstallService.ts:21-303`
- `test/dshInstallService.test.js:1-232`

**Changes**:

- [ ] Keep `TESTED_PNPM_VERSION` as the single version declaration.
- [ ] Add `PnpmLaunchSpec` and a pnpm install-spec type that preserve structured
  command/argument boundaries.
- [ ] Add platform-correct versioned paths:
  `<storage>/managed-pnpm/11.7.0/node_modules/pnpm/bin/pnpm.cjs`.
- [ ] Build exact managed npm-install arguments for `pnpm@11.7.0`.
- [ ] Resolve the managed entry first, standard npm-global package entries
  second, and a direct POSIX executable fallback last.
- [ ] On Windows, return only a native executable or `node.exe <pnpm.cjs>`;
  never return PowerShell/cmd shims that require shell flattening.
- [ ] Add exact-version compatibility and installation validation helpers.
- [ ] Remove `buildPnpmExecArgs()` and its npm-exec contract.
- [ ] Test Windows paths containing spaces, POSIX paths, candidate ordering,
  missing entries, version boundaries, and exact installation argv.

**Implementation shape**:

```ts
export interface PnpmLaunchSpec {
  command: string;
  argsPrefix: string[];
  shell: false;
  resolvedPath: string;
}

export function managedPnpmBin(storageDir: string, platform = process.platform): string;
export function buildManagedPnpmInstallSpec(storageDir: string, platform = process.platform): ManagedInstallSpec;
export function resolvePnpmLaunchSpec(/* resolved Node, managed candidate, env, fs seam */): PnpmLaunchSpec | null;
export function isSupportedPnpmVersion(version: string | null | undefined): boolean;
```

**Completion criteria**: Pure-helper tests pass; no npm-exec pnpm helper or
shell-dependent Windows pnpm launch remains.

**Audit evidence**: Focused compile/tests pass. Search confirms
`buildPnpmExecArgs` and production `npm exec` usage are gone; the shared
resolver has both Doctor and installer callers.

### T2 — Extend Doctor with pnpm probing and ordered states

**Status**: ✅ done

**Files**:

- `src/dshDoctor.ts:36-336`
- `test/dshDoctor.test.js:1-203`

**Changes**:

- [ ] Add `pnpm-missing` and `pnpm-unsupported` to `DoctorState`.
- [ ] Add pnpm availability, version, support, and resolved path to
  `DoctorReport`.
- [ ] Add the shared pnpm resolver to `DoctorProbe` and its production wiring.
- [ ] Probe `--version` only after runnable supported Node and npm exist, using
  a five-second timeout and the resolver's structured launch.
- [ ] Evaluate missing/incompatible pnpm before `dsh-missing` or repair when no
  runnable DSH exists.
- [ ] Preserve the existing rule that a runnable DSH reports `ready`, while
  still returning its independent pnpm result.
- [ ] Replace the old “pnpm is not probed” test with missing, compatible,
  incompatible, exact-launch, and prerequisite-ordering coverage.

**Implementation shape**:

```ts
const pnpm = probePnpm();

if (version !== null) state = "ready";
else if (!node.runnable) state = "node-missing";
else if (!node.supported) state = "node-unsupported";
else if (!npm.available) state = "npm-missing";
else if (!pnpm.available) state = "pnpm-missing";
else if (!pnpm.supported) state = "pnpm-unsupported";
else state = "dsh-missing";
```

**Completion criteria**: Doctor's pure state matrix and exact pnpm launch tests
pass without weakening existing DSH discovery/compatibility tests.

**Audit evidence**: R1/R2/R5/R6 review found no gap. Doctor tests cover exact
launch, missing/incompatible ordering, and ready DSH without setup tooling; 36
focused Doctor/helper/i18n tests pass.

### T3 — Implement pnpm installation and enforce the DSH boundary gate

**Status**: ✅ done

**Files**:

- `src/installService.ts:143-483`
- `test/installService.test.js:1-373`

**Changes**:

- [ ] Add an injectable pnpm installation runtime using the existing
  cancellation/result conventions.
- [ ] Install the pinned package through resolved npm into the managed pnpm
  directory and verify `node <pnpm.cjs> --version` afterwards.
- [ ] Reuse the bounded Doctor output channel and localized progress/result
  reporting.
- [ ] Add a reusable prerequisite resolution/check at the start of
  `runManagedInstall()` before it opens the DSH chooser or mutates storage.
- [ ] Pass the same resolved pnpm launch to the source-install runner.
- [ ] Replace both source npm-exec calls with direct pnpm commands using
  `shell: false`.
- [ ] Prepend the verified pnpm runtime bin directory to the source-build
  environment so nested package scripts can invoke bare `pnpm`.
- [ ] Ensure failure/cancellation returns without launching DSH installation.
- [ ] Test successful install, nonzero exit, cancellation, failed validation,
  gate refusal, and exact source command/env behavior.

**Implementation shape**:

```ts
const pnpm = resolveVerifiedPnpm(/* context, Node/npm environment */);
if (!pnpm.supported) return false;

await runStep(
  pnpm.launch.command,
  [...pnpm.launch.argsPrefix, ...buildSourceInstallArgs(process.platform)],
  spec.cwd
);
```

**Completion criteria**: Direct calls cannot bypass the pnpm prerequisite, the
pnpm installer is cancellable and verified, and source installation never
uses npm exec.

**Audit evidence**: Boundary-gate, install success/failure/cancellation,
direct-launch, and nested-script PATH tests pass. Real Windows managed-prefix
installation and direct pnpm invocation returned 11.7.0; a full DSH source
build completed and its CLI returned 0.1.5-rc.2.

### T4 — Add Doctor pnpm UI, actions, and localization

**Status**: ✅ done

**Files**:

- `src/installService.ts:98-141,486-546`
- `src/i18nStrings.ts:625-1155`
- `test/installService.test.js:374-428`
- `test/i18n.test.js:1-35`

**Changes**:

- [ ] Map both pnpm states to localized placeholders.
- [ ] Extend `doctorActionFor()` with pnpm after Node/npm and before repair;
  allow this maintenance action while an existing DSH remains ready.
- [ ] Render pnpm between npm and DSH with version/path detail and a pass icon
  only for the tested version.
- [ ] Add and dispatch the pnpm install action; on success call `onChanged` and
  reopen Doctor, matching repair refresh behavior.
- [ ] Add every pnpm row/state/action/progress/success/failure string in English,
  Chinese, Japanese, Korean, Estonian, Ukrainian, Spanish, Portuguese, French,
  and German.
- [ ] Test visible ordering, one-action selection, successful refresh, failure
  behavior, and locale completeness.

**Implementation shape**:

```ts
if (!report.pnpm.supported) return "pnpm";
items.push(checkItem(
  report.pnpm.supported ? "ok" : "fail",
  t("doctor.row.pnpm"),
  report.pnpm.version ?? t("doctor.notFound")
));
```

**Completion criteria**: Doctor visibly and accurately reports pnpm and offers
only the correct next action in every prerequisite state, in all locales.

**Audit evidence**: R3/R4/R7/R8 review found no gap. Doctor renders the pnpm
row, dispatches the managed install, refreshes on success, and all locale
columns pass parity checks.

### T5 — Lightweight implementation audits

**Status**: ✅ done

**Files**:

- `doc/feature/10-pnpm-prerequisite/plan.md`
- production/test files changed by T1-T4

**Changes**:

- [ ] After T1-T2, audit R1, R2, R5, and R6 against `req.md`; record gaps in
  the relevant task status notes before continuing.
- [ ] After T3-T4, audit R3, R4, R7, and R8; verify every new exported helper
  has a production caller and every UI action is dispatched.
- [ ] Search for residual `buildPnpmExecArgs`, `npm exec`, incomplete
  `DoctorReport` fixtures, and exhaustive `DoctorState` switches.

**Audit commands**:

```text
rg -n "buildPnpmExecArgs|npm exec|DoctorState|DoctorReport|pnpm" src test
npm.cmd run compile
node --test test/dshDoctor.test.js test/dshInstallService.test.js test/installService.test.js test/i18n.test.js
```

**Completion criteria**: Both audits are recorded, with no unaddressed
requirement gaps or dead production paths.

**Audit evidence**: Residual searches found no production npm-exec bootstrap,
all state/report constructors are adapted, and every new helper has a live
production caller.

### T6 — Full verification and pipeline close-out

**Status**: ✅ done

**Files**:

- `doc/feature/10-pnpm-prerequisite/verification.md`
- `doc/feature/10-pnpm-prerequisite/plan.md`
- `doc/feature/10-pnpm-prerequisite/summary.md`
- `doc/feature/10-pnpm-prerequisite/TODO.md`

**Changes**:

- [ ] Run `npm.cmd test` and record the exact result.
- [ ] Recheck every RTTM row and acceptance criterion.
- [ ] Confirm each completed task exists in code and is called from production,
  not dead.
- [ ] List every gap with severity and suggested action in `verification.md`.
- [ ] Update all task states from verification evidence.
- [ ] Write `summary.md` from verified results.
- [ ] Mechanically extract only `❌` and `⏭️` plan items into `TODO.md`; if
  there are none, write `No outstanding tasks.`

**Completion criteria**: Verification is evidence-backed, plan states match
the findings, and TODO truthfully signals whether the feature round is closed.

**Verification evidence**: `verification.md` records full RTTM/acceptance/live
call coverage; compile and 251/251 tests pass; the real Windows ARM64 DSH source
build passes; summary and mechanical TODO are present.


## Dependency order

```text
T1 pure pnpm primitives
 |
 +--> T2 Doctor model/probe ----+
 |                              |
 +--> T3 installer and gate ----+--> T4 UI/localization
                                      |
                                      v
                                T5 audits
                                      |
                                      v
                                T6 close-out
```

*Related documents: discussion.md | req.md | solution.md*
