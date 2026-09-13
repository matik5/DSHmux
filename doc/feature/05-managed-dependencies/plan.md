# 05-managed-dependencies — Implementation Plan

**Date**: 2026-09-13
**Status**: APPROVED (2026-09-13)
**Sources**: [discussion.md](discussion.md), [req.md](req.md), [solution.md](solution.md)

## Requirement-to-task traceability matrix

| Requirement | Task | Verification |
|---|---|---|
| R1: default install is official `@deepseek-ai/dsh@0.1.5-rc.2` | T1, T3 | Exact package/argument tests; repository reference audit |
| R1: no runtime dependency on `matik/dsh-patches-*` | T1, T3, T4, T5 | `rg` invariant over `src`, `test`, package metadata and changelogs |
| R1: retained existing source installs still launch | T2, T4 | Doctor source classification and configured source-path regression tests |
| R2: Doctor offers Install/Repair | T3, T4 | Doctor action-state and command-routing tests |
| R2: install is extension-managed and non-global | T1, T3 | Managed-path tests; child arguments include `--prefix`; no config-write assertion |
| R2: explicit confirmation, progress/log, cancellation | T3 | Mocked VS Code + child runner tests for confirm/cancel/output/termination |
| R2: verify exact installed CLI version before use | T1, T3, T4 | Missing file, failed probe, wrong version and success tests |
| R2: repair is repeatable and incomplete installs are not ready | T1, T2, T3 | Retry and partial-directory tests |
| R2: existing global/npx/source/custom installs remain supported | T2, T4 | Existing discovery/classification regression matrix |
| R3: accurate Node engine requirement | T1, T2, T5 | Boundary tests: 22.18 reject, 22.19 accept, 23 reject, 24+ accept; string audit |
| R3: Git/pnpm do not affect runtime readiness | T2, T3 | Doctor tests with Git/pnpm absent; QuickPick row assertions |
| R4: one compact `Missing deps · Fix` action | T4, T5 | HTML/layout and message-routing tests |
| R4: no launcher setup or compatibility notices | T4, T5 | Source/HTML absence assertions |
| R4: repeated Doctor messages do not duplicate controls | T4 | Static-single-button and repeated-message test |
| R4: only ready auto-starts; Doctor failure keeps fallback | T4 | Launcher state matrix tests |
| Release 0.4.7 passes compile/tests/smoke/package | T5, T6 | Version assertions, `npm test`, VSIX inspection, recorded verification |

## Tasks

### T1 — Official managed-install primitives — ✅

**Files**: `src/dshInstallService.ts:1-201`,
`test/dshInstallService.test.js:1-251`

- [x] Replace fork constants with the official repository, tag, full revision,
  and package constants.
- [x] Remove `buildSourceClonePlan`, `buildSourceUpdatePlan`,
  `recommendedSourceBranchExists`, source download prerequisites, and patched
  branch validation from the guided-install contract.
- [x] Add platform-pure `managedDshRoot(storageDir)` and
  `managedDshBin(storageDir)` helpers.
- [x] Add a structured npm command builder. It must pin the tested version and
  include `--prefix`, `--no-save`, `--no-audit`, and `--no-fund`.
- [x] Add `isSupportedNodeVersion(version)` implementing the exact official
  range `^22.19.0 || >=24.0.0` without accepting Node 23.
- [x] Add a pure/injected managed-install validator: expected CLI exists and
  reports exactly `TESTED_DSH_VERSION`.
- [x] Rewrite unit tests for official metadata, POSIX/Windows paths including
  spaces, exact npm args, Node boundaries, incomplete install, failed CLI,
  wrong version, and valid install.

Core contract:

```ts
interface ManagedInstallSpec {
  command: "npm";
  args: string[];
  cwd: string;
  binPath: string;
}

isSupportedNodeVersion("v22.19.0") === true;
isSupportedNodeVersion("v23.0.0") === false;
```

**Completion criteria**: no fork/source-plan export remains; exact official
package pin and all Node/path/validation tests pass.

### T2 — Runtime-oriented Doctor report — ✅

**Files**: `src/dshDoctor.ts:20-304`, `test/dshDoctor.test.js:1-350`

- [x] Change `DoctorState` to `ready`, `dsh-missing`, `dsh-unrunnable`,
  `node-missing`, `node-unsupported`, and `npm-missing`.
- [x] Add `node.supported` and managed CLI input/result fields to the report.
- [x] Resolve candidates in the shared order: valid managed CLI, valid
  configured CLI, then current host discovery.
- [x] Classify a runnable DSH as ready before prerequisite states; retain
  compatibility and install-type detail without blocking it.
- [x] Remove Git/pnpm probing, source-prerequisite state, and source-tools
  warnings from runtime Doctor.
- [x] Preserve stale configured-path warning, redaction, host label, bounded
  probes, and all existing install-type classifications.
- [x] Rewrite the deterministic state matrix and add managed/configured/
  discovered precedence plus Node-range tests.

State logic:

```ts
if (dshVersion !== null) state = "ready";
else if (resolvedPath !== null) state = "dsh-unrunnable";
else if (!node.runnable) state = "node-missing";
else if (!node.supported) state = "node-unsupported";
else if (!npm.available) state = "npm-missing";
else state = "dsh-missing";
```

**Completion criteria**: Git/pnpm availability cannot alter readiness; every
new state and candidate-precedence branch has a deterministic test.

### T3 — Doctor-managed installation and repair — ✅

**Files**: `src/installService.ts:1-450`, `test/installService.test.js:1-end`

- [x] Make `runDoctorForLauncher` and `runDoctorCommand` accept the existing
  extension context/storage path.
- [x] Rebuild the Doctor QuickPick around host, Node support, npm, DSH version,
  path, installation type, compatibility, state-specific repair/guidance, and
  Check again.
- [x] Delete fork remote checks, source clone/update flows, Git/pnpm guidance,
  npm/npx alternative selection, setup terminal, and related command-prefill
  helpers that no longer have callers.
- [x] Add an injectable npm child runner for unit tests. Production uses
  structured args, Windows shell handling, and the workspace-host environment.
- [x] Confirm exact package/version/destination before writing anything.
- [x] Create only the exact versioned managed directory, run npm within
  cancellable `withProgress`, and stream bounded stdout/stderr to one reused
  `DSHmux Doctor` output channel.
- [x] On cancellation terminate only the owned npm child. Do not recursively
  delete managed storage.
- [x] Verify file + exact version after npm exits 0. Success refreshes Doctor;
  failure offers one concise Open log action.
- [x] Keep Node guidance but correct it to 22.19+ (22.x) or 24+; add npm-missing
  guidance. Neither invokes an OS package manager.
- [x] Test cancel-before-confirm, cancellation during install, exact process
  call, success, nonzero exit, missing/wrong binary, retry, output truncation,
  and zero writes to `dshmux.dshPath`.

Repair skeleton:

```ts
const spec = buildManagedInstallSpec(context.globalStorageUri.fsPath, platform);
if (!(await confirmManagedInstall(spec))) return;
await fs.promises.mkdir(spec.cwd, { recursive: true });
const result = await runManagedNpm(spec, progress, token, output);
if (result.ok && validateManagedInstall(spec.binPath, probe).valid) refresh();
```

**Completion criteria**: Doctor can complete and verify a pinned managed
install; all mutations require the explicit repair confirmation.

### T4 — Compact launcher and managed-path wiring — ✅

**Files**: `src/launcherView.ts:1-890`, `src/extension.ts:1-230`,
`test/dshLauncher.test.js:1-end`, `test/chatViewLayout.test.js:1-100`

- [x] Remove setup panel HTML/CSS/JS, compatibility warning, fork source link,
  warning transport, tool rows, and six obsolete install messages/actions.
- [x] Add one statically rendered mini `dependencyFix` button in the header;
  localize its label and route its click through the existing `open-doctor`
  message/command.
- [x] Doctor messages carry only the readiness state required to toggle the
  button; repeated messages mutate visibility and never create DOM nodes.
- [x] Allow auto-start only for `ready`; retain the previous blind-start
  fallback only when Doctor throws.
- [x] Derive the managed CLI path from `context.globalStorageUri.fsPath` once in
  `activate`; manager provider precedence is verified managed path, configured
  path, then its unchanged discovery fallback.
- [x] Collapse `DoctorActions` to only behavior still needed after repair and
  update every constructor/callback site.
- [x] Rewrite launcher tests for all not-ready states, ready, probe failure,
  one Fix button, repeated Doctor messages, and Doctor routing.
- [x] Replace layout-test compatibility assertions with compact-action
  placement and removed-panel assertions.

Static UI contract:

```html
<button class="mini dependency-fix" id="dependencyFix">
  Missing deps · Fix
</button>
```

**Completion criteria**: source contains no setup-panel or compatibility-banner
renderer; a missing dependency results in exactly one Doctor-opening control.

### T5 — Localization and 0.4.7 metadata — ✅

**Files**: `src/i18nStrings.ts:1-end`, `package.json:1-130`,
`package-lock.json`, `CHANGELOG.md`, `CHANGELOG.zh.md`

- [x] Remove now-unused patched-source/setup/compatibility strings after a
  complete key-reference audit.
- [x] Add compact Fix, managed install/repair, destination, progress, success,
  failure, log, Node unsupported, npm missing, and accurate prerequisite text
  in all ten supported locale columns.
- [x] Bump package and lockfile version from 0.4.6 to 0.4.7.
- [x] Add release notes describing official upstream, Doctor-managed repair,
  quiet launcher, correct Node range, and preserved existing installs.
- [x] Ensure no user-facing string claims Node 20 is sufficient or labels the
  fork as recommended.

**Completion criteria**: i18n parity passes; package metadata consistently says
0.4.7; obsolete keys have no references.

### T6 — Verification, package, and close-out — ✅

**Files**: `doc/feature/05-managed-dependencies/verification.md`,
`doc/feature/05-managed-dependencies/plan.md`,
`doc/feature/05-managed-dependencies/summary.md`,
`doc/feature/05-managed-dependencies/TODO.md`

- [x] Run `npm run compile` and the full `npm test` suite.
- [x] Audit every `✅` item for code existence and a live call site.
- [x] Run repository invariants:

```sh
rg -n "matik/dsh-patches|patched source|source-prerequisites-missing" src test package.json CHANGELOG.md CHANGELOG.zh.md
rg -n "Node.js 20|Node 20" src package.nls.json package.nls.zh-cn.json
```

- [x] Run a Windows-path deterministic smoke through the unit seams and a
  local managed-install smoke where safe.
- [x] Run `npm run package`, inspect the generated VSIX version and packaged
  file list, and keep the artifact in the workspace without publishing it.
- [x] Write `verification.md` with RTTM coverage and gap severity, update every
  task state in this plan, write `summary.md`, and mechanically generate
  `TODO.md` from `❌`/`⏭️` items (`No outstanding tasks.` when none).

**Completion criteria**: tests and packaging pass, 0.4.7 VSIX exists, every
requirement is evidenced, and `TODO.md` truthfully reflects remaining work.

## Execution order

```text
T1 managed primitives
 ├──> T2 Doctor model ──┐
 └──> T3 Doctor repair ─┼──> T4 launcher/wiring ──> T5 release metadata ──> T6 close-out
                       ┘
```

After T2, T3, and T5, perform a lightweight audit against `req.md` and record
any gap immediately rather than deferring it to final verification.

*Related documents: discussion.md | req.md | solution.md*
