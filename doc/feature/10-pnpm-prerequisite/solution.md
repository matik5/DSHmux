# pnpm Prerequisite — Solution

**Date**: 2026-09-15
**Status**: Approved by user on 2026-09-15
**Sources**: [discussion.md](discussion.md), [req.md](req.md)

## 1. Goal

Make pnpm 11.7.0 an explicit, independently verified Doctor prerequisite for
managed DSH installation. Doctor will display pnpm, install the pinned version
into extension-managed storage when necessary, and invoke the verified pnpm
JavaScript entry directly for source installation/builds.

An already runnable DSH remains runnable and keeps Doctor's `ready` state. A
missing pnpm can still be installed from that Doctor view, but its absence does
not invalidate an existing DSH runtime.

## 2. Facts

### Doctor model and probes

- `src/dshDoctor.ts:36-42` defines only `ready`, Node, npm, and DSH states.
- `src/dshDoctor.ts:49-78` exposes Node, npm, and DSH results in
  `DoctorReport`; pnpm is absent.
- `src/dshDoctor.ts:94-132` puts all process/filesystem behavior behind
  `DoctorProbe`. npm has a shared launch resolver seam; pnpm has none.
- `src/dshDoctor.ts:137-188` gives probes a Node-augmented environment and
  executes structured commands with a five-second timeout.
- `src/dshDoctor.ts:262-273` probes npm through the exact resolved npm launch.
- `src/dshDoctor.ts:311-323` declares an environment repairable as soon as
  Node and npm pass; it does not inspect pnpm.
- `src/dshDoctor.ts:313-314` deliberately treats any runnable DSH as ready
  before evaluating setup prerequisites.

### pnpm and installation

- `src/dshInstallService.ts:21` is the single tested-version declaration:
  `TESTED_PNPM_VERSION = "11.7.0"`.
- `src/dshInstallService.ts:191-196` constructs an npm-exec wrapper rather
  than an installed pnpm launch.
- `src/dshInstallService.ts:211-257` already demonstrates the desired Windows
  safety pattern for npm: find a JavaScript CLI entry and invoke it through the
  resolved Node executable with `shell: false`.
- `src/installService.ts:216-332` implements the real managed install runner.
  Its source branch resolves Node/npm, validates the Git checkout, and invokes
  both pnpm steps through npm exec.
- `src/installService.ts:308-318` runs source install and build as separate
  npm-exec calls. This is the observed failure point after dependency install.
- `src/installService.ts:434-483` owns confirmation, cancellable progress,
  bounded logging, validation, and success/failure reporting for DSH installs.
- There is no pnpm install spec, pnpm managed path, pnpm validation primitive,
  or pnpm-specific install workflow.

### Doctor UI

- `src/installService.ts:98-106` maps every current Doctor state to i18n.
- `src/installService.ts:136-141` selects exactly one action in prerequisite
  order: Node, npm, then DSH repair.
- `src/installService.ts:506-528` renders Host, Node, npm, and DSH rows and the
  selected action.
- `src/installService.ts:536-545` dispatches Check again, Node guidance, npm
  guidance, and DSH repair. It has no pnpm handler.
- `src/i18nStrings.ts:625-1155` contains every Doctor/install string across all
  ten supported locales; `test/i18n.test.js` enforces complete locale parity.

### Existing tests

- `test/dshDoctor.test.js` supplies a fully injected `DoctorProbe`, verifies
  prerequisite ordering, and currently asserts that pnpm is not probed.
- `test/dshInstallService.test.js` verifies the exact npm-exec pnpm arguments,
  npm resolution, structured Windows invocation, and version checks.
- `test/installService.test.js` injects `ManagedInstallRuntime`, verifies DSH
  install behavior and action ordering, and stubs the VS Code surfaces used by
  Doctor.

## 3. Gap

The Doctor cannot distinguish an installed, compatible pnpm from a missing or
incompatible one. Its DSH action becomes available after npm alone passes, and
the source installer then tries to acquire pnpm implicitly through `npm exec`.
That hidden bootstrap is neither visible nor independently verifiable and can
fail when npm omits its temporary pnpm bin directory from the spawned PATH.

The gap is closed only when pnpm has its own report/state/action, installation
is verifiable and cancellable, and all source commands use the same verified
pnpm launch that Doctor accepted.

## 4. Proposed design

### 4.1 Managed pnpm contract

Add pure helpers in `src/dshInstallService.ts`:

```ts
interface PnpmLaunchSpec {
  command: string;
  argsPrefix: string[];
  shell: false;
  resolvedPath: string;
}

managedPnpmRoot(storageDir, platform): string
managedPnpmBin(storageDir, platform): string
buildManagedPnpmInstallSpec(storageDir, platform): ManagedInstallSpec
resolvePnpmLaunchSpec(nodePath, managedBin, env, platform, exists): PnpmLaunchSpec | null
isSupportedPnpmVersion(version): boolean
```

The managed layout will be:

```text
<storage>/managed-pnpm/11.7.0/node_modules/pnpm/bin/pnpm.cjs
```

Installation will use the already resolved npm launcher with structured args:

```text
npm install --prefix <managed-pnpm-root> --no-save --no-audit --no-fund pnpm@11.7.0
```

Resolution order will be:

1. the extension-managed pinned pnpm entry;
2. a standard npm global pnpm package entry derived from platform environment
   and PATH prefixes;
3. on POSIX, the executable `pnpm` command as a compatibility fallback.

Windows accepts only a native executable or a known pnpm JavaScript entry run
through Node. It will not run `.ps1` or flatten `.cmd` arguments through a
shell. The exact tested version must pass `--version` before the launch is
accepted.

### 4.2 Doctor report and ordering

Extend `DoctorReport` with:

```ts
pnpm: {
  available: boolean;
  version?: string;
  supported: boolean;
  path?: string;
}
```

Extend the probe with the shared pnpm resolver. Probe pnpm only after Node and
npm are runnable. Add `pnpm-missing` and `pnpm-unsupported` states.

When no runnable DSH exists, state/action priority becomes:

```text
Node missing/unsupported -> npm missing -> pnpm missing/unsupported -> DSH repair
```

When DSH already runs, the state remains `ready`; Doctor still shows a failed
pnpm row and may offer the pnpm install action, but does not repair or replace
DSH.

### 4.3 pnpm install action

Add a small pnpm-specific injectable runtime and `runManagedPnpmInstall()` in
`src/installService.ts`. It will:

1. resolve Node and npm using the same helpers as Doctor;
2. install pnpm 11.7.0 into the managed pnpm root;
3. stream bounded output through the DSHmux Doctor channel;
4. honor cancellation and wait for the child to close;
5. verify the direct pnpm entry with `node <pnpm.cjs> --version`;
6. report localized success/failure;
7. rerun Doctor after success.

No DSH chooser, directory creation, clone, package installation, or build is
entered by this action.

### 4.4 DSH installation gate and direct execution

`runDoctorCommand()` exposes DSH repair only after a compatible pnpm launch is
verified. `runManagedInstall()` also performs the same precondition check at
its boundary so other present or future callers cannot bypass Doctor.

For source installs, replace:

```text
npm exec --package=pnpm@11.7.0 -- pnpm <args>
```

with:

```text
node <verified-pnpm.cjs> <args>
```

On POSIX fallback installations the verified executable is spawned directly.
All launches use argument arrays and `shell: false`.

### 4.5 UI and localization

Add a pnpm row between npm and DSH. Its detail shows the detected version/path
or `not found`, and its icon passes only for version 11.7.0. Add localized
strings for missing/unsupported state, install action, progress, success, and
failure in every supported locale.

## 5. Call-site audit

### `DoctorReport` / `DoctorState` contract

| Call site | Classification | Required adaptation |
|---|---|---|
| `src/installService.ts:82-141` | compatible with changes | Map new states, inspect `report.pnpm`, and add the pnpm action. |
| `src/installService.ts:501-545` | compatible with changes | Render the row and dispatch installation. |
| `src/dshChatView.ts:102,168-215,399-418` | compatible | It reads only `state`; existing DSH remains `ready`, while missing DSH is gated by the new states. |
| `test/dshDoctor.test.js:38-165` | requires fixture adaptation | Supply pnpm resolution/results and assert new ordering. |
| `test/installService.test.js:374-412` | requires fixture adaptation | Add `pnpm` to report fixtures and test pnpm action selection/dispatch. |

No caller depends on exhaustive destructuring of `DoctorReport`; adding the
pnpm field does not remove an existing field.

### `DoctorProbe` contract

| Call site | Classification | Required adaptation |
|---|---|---|
| `src/dshDoctor.ts:137-188` | compatible with changes | Wire the production pnpm resolver. |
| `test/dshDoctor.test.js:8-29` | requires fixture adaptation | Add a deterministic pnpm resolver default. |

These are the only constructors found for `DoctorProbe`.

### pnpm command construction

| Call site | Classification | Required adaptation |
|---|---|---|
| `src/installService.ts:308-318` | conflict with required behavior | Replace npm-exec command construction with the verified direct pnpm launch. |
| `test/dshInstallService.test.js:99-102` | conflict with required behavior | Replace the npm-exec expectation with managed path/install/direct-launch tests. |

`buildPnpmExecArgs()` has no other callers and will be removed.

### DSH installation entry points

| Call site | Classification | Required adaptation |
|---|---|---|
| `src/installService.ts:542` | compatible with gate | Doctor calls it only after pnpm passes. |
| `test/installService.test.js:140-361` | requires fixture adaptation | Existing direct calls must inject a passing pnpm prerequisite except new gate-failure tests. |

`runManagedInstall()` has no other production caller. The boundary check avoids
relying solely on UI ordering.

## 6. Tasks

1. **Pure pnpm primitives** — update `src/dshInstallService.ts:21-303` with
   managed paths, install spec, safe resolver, direct launch contract, and exact
   compatibility check; remove `buildPnpmExecArgs()`.
2. **Doctor model/probe** — update `src/dshDoctor.ts:36-336` with pnpm report,
   resolver seam, bounded version probe, and ordered states while preserving
   ready existing DSH behavior.
3. **Install workflows and gate** — update `src/installService.ts:1-546` with
   managed pnpm installation, verification, Doctor row/action handling, the
   DSH boundary precondition, and direct pnpm source commands.
4. **Localized UI** — update `src/i18nStrings.ts:625-1155` with complete pnpm
   Doctor/install strings for all ten locales.
5. **Regression tests** — update `test/dshDoctor.test.js`,
   `test/dshInstallService.test.js`, `test/installService.test.js`, and rely on
   `test/i18n.test.js` for locale parity.
6. **Verification and close-out** — compile, run the complete test suite, audit
   live call paths, update plan states, then generate `verification.md`,
   `summary.md`, and mechanical `TODO.md`.
