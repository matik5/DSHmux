# 05-managed-dependencies — Solution

**Date**: 2026-09-13

**Status**: APPROVED (2026-09-13)

**Sources**: [discussion.md](discussion.md), [req.md](req.md)

## 1. Goal

DSHmux 0.4.7 uses a pinned, official DeepSeek Harness 0.1.5-rc.2 package and
owns a deterministic repair path in DSH Doctor. The launcher does not explain
or install dependencies itself: when DSH cannot run, it exposes one compact
**Missing deps · Fix** button that opens Doctor.

The default repair installs DSH into extension-managed storage on the
workspace host. It never requires the `matik5` fork, Git, pnpm, a source build,
administrator access, or a global npm prefix.

## 2. Facts

### 2.1 Official runtime contract

- Official repository/tag: `deepseek-ai/deepseek-harness`,
  `dsh-v0.1.5-rc.2`, commit
  `fb2c4b9e698e30edb738bca4cf0618587db7d203`.
- The tagged root manifest declares Node `^22.19.0 || >=24.0.0` and
  `pnpm@11.7.0` for source development.
- The published runtime package is `@deepseek-ai/dsh@0.1.5-rc.2`, whose CLI
  entry is `lib/bin.js`.
- `src/versionCheck.ts:10` already defines
  `TESTED_DSH_VERSION = "0.1.5-rc.2"`.

### 2.2 Discovery and launch

- `src/serverManager.ts:155-263` resolves an external Node executable.
- `spawnSpec` at `src/serverManager.ts:316-333` launches `.js` CLI entries
  explicitly through that Node executable and launches Windows npm shims
  through a shell.
- `resolveStartBin` at `src/serverManager.ts:477-494` accepts an explicit or
  configured path, otherwise uses the global/npx discovery candidates from
  `resolveDshPath`.
- `DshServerManager` receives one path provider in `src/extension.ts:27`; this
  is the narrow seam for preferring the managed CLI without changing all
  existing global/custom discovery behavior.

### 2.3 Doctor

- `src/dshDoctor.ts:220-304` probes Node, npm/npx, Git/pnpm, then DSH.
- State selection at `src/dshDoctor.ts:274-283` prioritizes `node-missing` and
  uses Git/pnpm to select `source-prerequisites-missing`, because 0.4.6 treats
  the fork source build as primary.
- Node is only classified as runnable/not runnable; its version is not checked
  against the official engine range.
- `src/installService.ts:172-268` builds the Doctor QuickPick, including
  source/fork checks and two install choices.
- `runPrimaryInstallFlow` at `src/installService.ts:320-431` owns the fork
  clone/update flow. `runAlternativeInstallFlow` at lines 434 onward only
  prefills npm/npx commands and cannot verify completion.
- `runDoctorForLauncher` and `runDoctorCommand` currently have no
  `ExtensionContext`, so neither can derive a managed storage path.

### 2.4 Launcher

- `src/launcherView.ts:93-124` composes a full missing-state setup panel.
- HTML/CSS/JS at lines 229-426 renders and repeatedly rebuilds prerequisite
  rows and several install actions.
- Dynamically rebuilt tool buttons do not receive the IDs that the cleanup loop
  at lines 393-397 searches for. Repeated Doctor messages therefore duplicate
  rows.
- The separate compatibility warning is created at lines 88-91 and 263, then
  updated at lines 582-590.
- The host routes six setup messages at lines 751-780. The existing
  `open-doctor` route at lines 803-804 already opens the correct command.
- Auto-start at lines 826-860 permits `ready`, `dsh-unrunnable`, or a failed
  Doctor probe.

### 2.5 Tests and release metadata

- `test/dshDoctor.test.js` pins the five-state classification and Git/pnpm
  source-prerequisite behavior.
- `test/dshInstallService.test.js` pins every fork constant and source command.
- `test/installService.test.js` covers the source auto-run and npm prefill
  behavior.
- `test/dshLauncher.test.js` pins the large setup panel and all six action
  routes; `test/chatViewLayout.test.js` requires the compatibility warning.
- `package.json` is version `0.4.6`; both changelogs describe releases.

## 3. Gap

The current architecture makes fork-source development prerequisites part of
the ordinary runtime state, while the requested product needs one official,
managed npm dependency. The launcher owns too much repair UI and duplicates
dynamic elements. Doctor lacks an executable install operation, managed-path
awareness, and accurate Node version compatibility. The manager has no way to
prefer an extension-managed CLI.

## 4. Target design

### 4.1 Managed installation layout

Introduce pure path helpers in `src/dshInstallService.ts`:

```ts
managedDshRoot(context.globalStorageUri.fsPath)
// <globalStorage>/managed-dsh/0.1.5-rc.2

managedDshBin(context.globalStorageUri.fsPath)
// <root>/node_modules/@deepseek-ai/dsh/lib/bin.js
```

The versioned directory makes installations deterministic and prevents a
future DSHmux version from silently reusing a different DSH package graph.
There is no automatic deletion of earlier versions in 0.4.7.

The exact managed install command is represented as executable plus argument
array, not an interpolated shell string:

```ts
npm install --prefix <root> --no-save --no-audit --no-fund
  @deepseek-ai/dsh@0.1.5-rc.2
```

On Windows the production runner uses the same shell rule already required for
`npm.cmd`; test seams receive structured command/args. The storage path is
derived from VS Code, not user input.

### 4.2 Managed path precedence

`activate(context)` constructs one `managedBin` path and supplies the manager
a provider with this precedence:

```text
verified managed CLI → configured dshmux.dshPath → existing discovery
```

“Verified” means the file exists and `resolveDshVersion` returns the tested
version. An incomplete managed directory is ignored. No synced configuration
value needs to be written, so a local managed path cannot become a stale path
on another machine.

Doctor receives the same managed candidate. Its resolution order is managed,
configured, then existing discovery, using one shared helper rather than a
second path algorithm.

### 4.3 Doctor state and dependency model

Replace source-oriented state with runtime-oriented state:

```ts
type DoctorState =
  | "ready"
  | "dsh-missing"
  | "dsh-unrunnable"
  | "node-missing"
  | "node-unsupported"
  | "npm-missing";
```

Classification order:

1. A resolved DSH with a readable version is `ready`, even if its version is
   older/newer; compatibility stays Doctor detail.
2. A resolved DSH whose version probe fails is `dsh-unrunnable`.
3. With no runnable DSH, missing Node is `node-missing`.
4. Node outside `^22.19.0 || >=24.0.0` is `node-unsupported`.
5. Missing npm is `npm-missing`.
6. Otherwise DSH is `dsh-missing` and managed repair is available.

This prevents Git/pnpm from changing runtime readiness. Git and pnpm rows and
source warnings are removed from the default Doctor report. Existing source
installs remain classified and runnable; source *installation* is no longer a
0.4.7 guided path.

Node compatibility is a pure function with tests for 22.18 (reject), 22.19
(accept), 23.x (reject per official range), and 24+ (accept). User-facing text
states the actual accepted versions, never “20+”.

### 4.4 Doctor-owned repair

`runDoctorCommand(context)` shows host, Node, npm, DSH, installed path/version,
and compatibility. Its action set is state-specific:

- `dsh-missing` / `dsh-unrunnable`: **Install/Repair DSH 0.1.5-rc.2**.
- `node-missing` / `node-unsupported`: one official Node prerequisite action.
- `npm-missing`: one npm/Node installation guidance action.
- every state: **Check again**.

The repair action:

1. Shows a modal confirmation containing the exact package, version, and
   managed destination.
2. Creates the versioned managed directory.
3. Runs npm through an injectable child-process runner inside
   `vscode.window.withProgress`; streams bounded output to a dedicated
   `DSHmux Doctor` output channel.
4. On cancellation, terminates only that npm child. A partial directory is
   harmless because readiness requires post-install verification.
5. Verifies the expected CLI file and exact `--version` result.
6. Refreshes Doctor and launcher. It never writes global npm state or
   `dshmux.dshPath`.

Failures return one concise message with an **Open log** action. They do not
emit multiple prerequisite banners. Repeating repair runs the same pinned npm
operation over the same versioned prefix and is safe.

### 4.5 Compact launcher contract

Delete the setup panel and compatibility warning. Add one mini button in the
header:

```html
<button id="dependencyFix" class="mini dependency-fix">
  Missing deps · Fix
</button>
```

It is visible whenever a successful Doctor report is not `ready`, including
`dsh-unrunnable`. It posts only `open-doctor`, reusing the existing host route.
No dependency detail, warning list, source link, or install message is sent to
or rendered by the webview.

Only `ready` allows auto-start. If the Doctor itself throws, the old fallback
start remains so a diagnostic failure cannot permanently disable a working
installation.

Because the button is static and only its visibility changes, repeated Doctor
messages cannot duplicate it.

## 5. Call-site audit

| Changed contract | Call site | Classification / required adaptation |
|---|---|---|
| `DoctorState` removes `source-prerequisites-missing`, adds `node-unsupported` and `npm-missing` | `src/installService.ts:124-136` | **Conflict** — update state-to-i18n mapping and actions. |
| same | `src/launcherView.ts:62-67, 93-124, 367-405, 826-829` | **Conflict** — replace setup-state branching with `state !== ready` compact-button visibility and ready-only start. |
| same | `test/dshDoctor.test.js`, `test/dshLauncher.test.js`, `test/installService.test.js` | **Conflict** — replace source-state fixtures/assertions with runtime dependency matrix. |
| `DoctorReport` removes Git/pnpm as runtime prerequisites and adds Node support status / managed path | `src/installService.ts:174-240` | **Conflict** — QuickPick rows and actions are rebuilt around Node/npm/DSH. |
| same | `src/launcherView.ts:695-710` | **Compatible after narrowing** — webview only needs `state`; stop sending tool/warning detail. |
| `runDoctorForLauncher(context)` gains context/storage input | `src/launcherView.ts:685,821` | **Conflict** — launcher stores/passes its existing `ExtensionContext`. |
| same | `src/extension.ts:153` | **Conflict removed** — old source install callback is deleted; command/refresh calls receive context. |
| `runDoctorCommand(context)` gains context | `src/extension.ts:147-166`, `src/commands.ts:58-65` | **Compatible via callback** — extension closure passes context; command registration signature need not change. |
| old source-plan exports removed/replaced with managed path/install spec | `src/installService.ts:25-35, 218-239, 320-431` | **Conflict by design** — fork flow and remote branch check are deleted; managed repair replaces them. |
| same | `test/dshInstallService.test.js`, `test/installService.test.js` | **Conflict** — rewrite around managed paths, pinned structured npm args, confirmation, verification, retry, failure, cancellation. |
| launcher removes setup action messages and `DoctorActions` members | `src/extension.ts:146-164` | **Conflict** — collapse to Doctor open/refresh behavior; remove primary/alternative/node/git/pnpm callbacks. |
| compatibility banner removed | `test/chatViewLayout.test.js:76-84` | **Conflict** — assert absence and compact dependency action placement instead. |
| manager path provider now prefers verified managed path | `src/extension.ts:27` | **Compatible** — `DshServerManager` provider contract still returns `string | undefined`; only the closure changes. |
| existing configured/global/npx/source resolution | `DshServerManager.start`, Doctor, upgrade service | **Compatible** — managed path is an earlier candidate; existing fallback behavior remains. |

No known caller requires the fork-source behavior after the launcher and Doctor
actions are replaced. Existing source-built binaries remain supported through
the unchanged configured-path and discovery launch contracts.

## 6. Tasks

### T1 — Managed install primitives

**Files**: `src/dshInstallService.ts`, `test/dshInstallService.test.js`

- Replace fork constants/plans with official metadata, managed path helpers,
  structured pinned npm install spec, Node range predicate, and managed CLI
  verification helper.
- Test POSIX/Windows paths, spaces, exact package pin, official metadata, Node
  range boundaries, and incomplete/wrong-version installs.

### T2 — Runtime-oriented Doctor

**Files**: `src/dshDoctor.ts`, `test/dshDoctor.test.js`

- Add managed-candidate input and runtime-oriented state classification.
- Remove Git/pnpm effects and source-only warnings.
- Test all states, managed/configured/discovered precedence, Windows behavior,
  stale configured path, and compatibility-warning detail.

### T3 — Executable Doctor repair

**Files**: `src/installService.ts`, `test/installService.test.js`

- Replace source/npm choice flows with managed install/repair, confirmation,
  cancellable progress, bounded output channel logging, verification, concise
  failure UI, and refreshed report.
- Keep official Node guidance with the corrected version requirement.
- Test confirmation/cancellation, exact child process call, success,
  verification failure, retry, and no global configuration write.

### T4 — Compact launcher and wiring

**Files**: `src/launcherView.ts`, `src/extension.ts`,
`test/dshLauncher.test.js`, `test/chatViewLayout.test.js`

- Remove setup/compatibility UI and obsolete action messages.
- Add the static compact dependency button routed to `dshmux.doctor`.
- Prefer verified managed CLI in the manager provider and give Doctor access to
  extension storage.
- Test every not-ready state, ready auto-start, Doctor failure fallback,
  routing, and no duplication after repeated reports.

### T5 — Localization and 0.4.7 release

**Files**: `src/i18nStrings.ts`, `package.json`, `package-lock.json`,
`CHANGELOG.md`, `CHANGELOG.zh.md`

- Remove fork/patched-source launcher copy, add managed repair and correct Node
  prerequisite strings in all supported locales, bump to 0.4.7, and document
  the migration.

### T6 — Verification and packaging

- Run compile and the full unit suite.
- Audit runtime/test sources for forbidden fork/patch-flow references.
- Package the 0.4.7 VSIX and inspect its contents/version.
- Record `verification.md`, reconcile `plan.md`, then generate `summary.md` and
  `TODO.md` mechanically from final task states.

## 7. Approved install-location amendment

Doctor's repair confirmation has two primary choices plus one location helper:

```text
Install globally
Install to shown location
Change…
Cancel (native VS Code button only)
```

The initially shown location is the project-specific npm prefix
`<workspace>/.dshmux/managed-dsh/0.1.5-rc.2`. Choosing **Change…** switches the
shown destination to `<selected-parent>/deepseek-harness`; confirming that
location clones the official tested tag, runs pnpm 11.7.0 install/build through
the already-resolved npm launcher, and verifies `apps/cli/lib/bin.js`.

The selected checkout bin is stored in workspace state. Launch and Doctor
candidate order is remembered checkout, project-managed install, legacy
globalStorage managed install, configured path, then ordinary discovery.
Global npm installation is explicit and validates the discovered global shim.

Affected call sites are `runManagedInstall`, the activation-time binary
provider, Doctor's managed candidate, and installer tests. Existing macOS/POSIX
npm execution remains shell-free and uses the same structured argv contract.
