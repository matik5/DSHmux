# 04-install — Solution

**Date**: 2026-09-01

**Status**: APPROVED (2026-09-01)

**Sources**: [discussion.md](discussion.md), [req.md](req.md),
[implementation-plan.md](../../install/implementation-plan.md)

## Goal

Give a first-time user a beginner-safe path to a working DSH: a read-only
**Doctor** report that names exactly what is ready/missing on the workspace
host, and guided installation flows where the **primary recommendation is the
patched `matik5/deepseek-harness` branch** (carries the two compatibility
patches mainline lacks) and the **mainline npm package is the labeled
alternative**. All commands are shown and prefilled — never executed by DSHmux.

Scope this round: **R1 (Doctor) + R2 (npm/npx) + R3 (source checkout)**.
R4 (setup bundles) is DEFERRED to `TODO.md`; nothing in this solution builds
I4 code.

## Facts (verified 2026-09-01)

### Reusable discovery (src/serverManager.ts — all pure, test-injectable)

- `resolveNodeExecutable(platform?, execPath?, home?, env?) → string` (L179).
  Returns the bare `node`/`node.exe` when nothing is found — **not guaranteed
  runnable**; must be probed with `--version`.
- `resolveDshVersion(bin) → string | null` (L333): `dsh --version`, 5 s
  timeout, `null` on failure.
- `resolveDshPath(home?, platform?) → { path, tried }` (L406): `$DSH_BIN`, npm
  global prefix bin, Windows roaming `%AppData%\npm`, Homebrew,
  `/usr/local/bin`, `~/.npm-global`, nvm globs, npx-cache globs; `.cmd` shim
  first on Windows; `tried` redacts home to `~`.
- `resolveStartBin(opts, configuredBin, home?, platform?)` (L452): explicit
  `dshBin` authoritative; configured path used only if it exists on this host.
- `spawnSpec(bin, ...)` (L315): `.js` entries run under the resolved Node;
  `.cmd` shims need a shell. `spawnEnvironment(spec, env)` (L284) prepends the
  Node dir to PATH for child processes.
- `DshServerManager` state machine (L472+): `stopped/starting/ready/error/
  stopping`; `start()` failure paths L626–667 produce the ENOENT /
  exit-before-ready / ready-timeout messages.

### Launcher (src/launcherView.ts)

- **Auto-start on view open** (L577–581): `resolveWebviewView` calls
  `manager.start()` whenever not running — the repeated-inevitable-failure
  behavior R1 replaces.
- `LauncherInit` (L28–38) and `server-status` postMessage carry only
  `state/message/version/extVersion/latestVersion/nextVersion`.
- Message handler (L508–549): `start / stop / upgrade / new-session /
  open-session / rename-session / archive-session / open-in-editor /
  open-settings / refresh-sessions / view-ready`.
- `DshLauncherView` constructor (L486–498) takes `(context, manager,
  onUpgrade, sessionHandlers, onOpenInEditor)` — wired at extension.ts L181–189.

### Existing patterns to reuse

- `src/versionCheckService.ts` L118–167: QuickPick → `createTerminal` →
  `sendText(cmd, false)` (prefill only) + info message; "Copy command" item.
- `src/versionCheck.ts`: `TESTED_DSH_VERSION = "0.1.2-rc.1"` (L10),
  `dshCompatibility()` (L71), `compareVersions()` (L36).
- `src/configuration.ts`: `configuredDshBin()` reads `dshmux.dshPath`
  (legacy `deepseekHarness` fallback); **no write helpers today**.
  `package.json` already declares `dshmux.dshPath` with
  `"scope": "machine-overridable"` (L70–75) — no schema change needed.
- `src/commands.ts` L12–50: `registerCommands(context, manager, revealChat,
  openEditorPanel)` registers `dshmux.start/stop/openBrowser/openPanel`.
- `src/i18nStrings.ts`: 9 locales (en, zh, ja, ko, ru, es, pt, fr, de),
  `{placeholder}` interpolation, `t(key, params)`.
- `package.json` L45–66: `contributes.commands` uses `%command.*.title%` keys
  from `package.nls.json` / `package.nls.zh-cn.json`.

### Host / tested-source facts

- `extensionKind: ["workspace"]` — probes and terminals target the workspace
  host; the local UI OS is not the probe target in remote windows.
- npm-shipped DSH packages ripgrep — no host `rg` prerequisite (X2).
- **Tested source (user decision, 2026-09-01)**: repo
  `https://github.com/matik5/deepseek-harness.git`, branch
  `matik/dsh-patches-0.1.2-rc.1`, tip `07bca197e2` = tag `dsh-v0.1.2-rc.1`
  (`a66e4702047846cdaa10c66c9d3df3951f5ea70d`) + the two patch commits from
  [doc/dsh-patches/README.md](../../dsh-patches/README.md) (JPEG attachment
  projection; pi-ai compaction wire marker). The local checkout at
  `/Users/mati/proj/deepseek-harness` is on this branch.

## Gap

1. No Doctor model/report; launcher auto-starts blindly → repeated start
   failures on DSH-less machines, and no plain-language "what is missing /
   what to run" surface.
2. No guided initial-install flow: only the upgrade flow for an already
   installed DSH exists (versionCheckService.ts).
3. No source-checkout validation, no git/pnpm/npm/npx probes, and no
   confirmed machine-scoped write of `dshmux.dshPath`.
4. `package.json` has no `dshmux.doctor` (or install) commands.

## Call-site audit

No shared function's contract changes. Behavior change in one existing call
site:

| Call site | Change | Classification |
|---|---|---|
| `launcherView.ts` L577–581 (auto-start in `resolveWebviewView`) | Auto-start only when Doctor (cached or quick probe) says a runnable DSH exists; otherwise render the setup panel | **intended** — this is R1's launcher requirement; all other start paths (`dshmux.start` command L21–30, `start` message L524–527) keep their behavior, and a failed explicit start still lands in the `error` state |
| `DshLauncherView` constructor signature (L486–498) | Add an optional `onDoctor`/install-action callback parameter (default no-op) | compatible — single call site, extension.ts L181–189, updated in the same task |
| `src/serverManager.ts` | Read-only reuse of `resolveDshPath`, `resolveStartBin`, `resolveDshVersion`, `resolveNodeExecutable`, `spawnSpec`, `spawnEnvironment` — **no edits** | compatible |
| `src/versionCheck.ts` / `versionCheckService.ts` | Read-only reuse of `TESTED_DSH_VERSION`, `dshCompatibility`, terminal-prefill pattern — **no edits** (the upgrade flow's semantics are untouched) | compatible |

## Architecture

Three new pure modules (no `vscode` import — unit-testable exactly like
`versionCheck.ts`) plus thin VS Code wiring:

```
src/dshDoctor.ts          R1: probe seams + runDoctor() + report types
src/dshInstallService.ts  R2+R3: command-plan builders + checkout validation
src/installService.ts     VS Code layer: QuickPick flows, terminal prefill,
                          doctor command, dshPath write, launcher actions
launcherView.ts (edit)    R1: setup panel for dsh-missing states,
                          no-blind-auto-start, "Check again"
package.json + nls (edit) dshmux.doctor command, localized metadata
i18nStrings.ts (edit)     doctor/install strings, 9 locales
```

### Data contracts

```ts
// src/dshDoctor.ts
export type DoctorInstallType = "npm-global" | "npx-cache" | "source" | "custom" | "none";
export type DoctorState =
  | "ready" | "node-missing" | "dsh-missing" | "dsh-unrunnable" | "source-prerequisites-missing";

export interface ToolInfo { available: boolean; version?: string }

export interface DoctorReport {
  host: { platform: string; arch: string; label: string };  // label: "local" | "remote-ssh:…" etc.
  node: { available: boolean; path: string | null; version: string | null; runnable: boolean };
  npm:  ToolInfo;   // npm normally ships with Node
  npx:  ToolInfo;
  git:  ToolInfo;   // required for the primary (source) path
  pnpm: ToolInfo;   // required for the primary (source) path
  dsh: {
    configuredPath: string | undefined;  // dshmux.dshPath, if set
    configuredValid: boolean;            // exists on this host (stale → discovery ran)
    resolvedPath: string | null;
    tried: string[];                     // redacted (home → ~)
    version: string | null;
    compatibility: DshCompatibility;     // from versionCheck.dshCompatibility
    installType: DoctorInstallType;
  };
  state: DoctorState;
  warnings: string[];                    // i18n keys, resolved at the UI layer
}

export interface DoctorProbe {           // injectable seams → deterministic tests
  platform: NodeJS.Platform;
  arch: string;
  home: string;
  execPath: string;
  env: NodeJS.ProcessEnv;
  hostLabel: string;
  configuredDshPath: string | undefined;
  exists: (p: string) => boolean;
  run: (cmd: string, args: string[], opts: { timeoutMs: number; shell?: boolean }) =>
    { ok: boolean; stdout: string };
}
export function realDoctorProbe(): DoctorProbe;      // spawnSync-backed, 5 s bounds
export function runDoctor(probe: DoctorProbe): DoctorReport;
```

Classification rules (pure, testable):

- `node.runnable` = `node --version` probe succeeds on the resolved path.
- `dsh-missing` vs `node-missing`: Node not runnable → `node-missing` (npm/npx
  also reported unavailable); Node runnable but no DSH found (or configured
  path stale and discovery empty) → `dsh-missing`.
- `source-prerequisites-missing`: DSH missing AND Node runnable AND (git or
  pnpm missing) — the primary path is blocked; the npm alternative is offered.
  Git/pnpm missing alone (with DSH present) is a **warning**, never a state
  change.
- `dsh-unrunnable`: a DSH binary resolved but `dsh --version` fails (e.g.
  broken npm link, WSL drive without exec bit).
- `ready`: DSH resolved and `--version` succeeds. Untested `compatibility`
  (`older`/`newer`/`unknown`) adds a warning only — **never blocks start**.
- `installType`: `/_npx/` in path → `npx-cache`; `node_modules/@deepseek-ai/`
  → `npm-global`; `/apps/cli/lib/bin.js` (or realpath inside a checkout
  containing `pnpm-workspace.yaml`) → `source`; anything else → `custom`.

Command plans (src/dshInstallService.ts, pure builders — no execution):

```ts
export const TESTED_SOURCE_REPO = "https://github.com/matik5/deepseek-harness.git";
export const TESTED_SOURCE_BRANCH = "matik/dsh-patches-0.1.2-rc.1";
export const TESTED_SOURCE_REVISION = "07bca197e2";

export interface InstallCommand {
  label: string;            // i18n key
  command: string;          // exact text to prefill
  purpose: string;          // i18n key (one-line plain-language reason)
}

// R3 — PRIMARY recommendation (Node + Git + pnpm present):
buildSourceClonePlan(parentDir: string, platform: NodeJS.Platform): InstallCommand[]
//  1. git clone --branch matik/dsh-patches-0.1.2-rc.1
//     https://github.com/matik5/deepseek-harness.git "<parentDir>/deepseek-harness"
//  2. cd "<parentDir>/deepseek-harness"
//  3. pnpm install
//  4. pnpm build          (builds the workspace, produces apps/cli/lib/bin.js)
// Windows: one plan, `git clone` via cmd, steps 2–4 prefilled as separate
// user-confirmed commands (no hidden multi-command script — req R3).

// R2 — ALTERNATIVE (labeled "mainline, without the two compatibility patches"):
buildNpmPlan(): InstallCommand            // npm i -g @deepseek-ai/dsh@0.1.2-rc.1
buildNpxPlan(): InstallCommand            // npx -y @deepseek-ai/dsh@0.1.2-rc.1 --version
// Both pin TESTED_DSH_VERSION; never latest/next.

// R3 existing-checkout validation (pure given probe seams):
export interface CheckoutCheck {
  valid: boolean;
  binPath: string | null;        // <checkout>/apps/cli/lib/bin.js
  version: string | null;        // from `node <binPath> --version`
  dirty: boolean;                // `git status --porcelain` non-empty
  onPatchedBranch: boolean | null; // branch matches TESTED_SOURCE_BRANCH (null: not a git repo)
}
```

### Launcher contract (webview message protocol, additive)

Outbound (host → webview):

- `doctor` — `{ state, hostLabel, node, npm, npx, git, pnpm, dsh, warnings: string[] }`
  (warning texts already localized). Pushed on view open, after every
  `Check again`, and after explicit start failures in missing states.
- `server-status` — unchanged, plus the webview now receives `doctor` first.

Inbound (webview → host), new types:

- `doctor-check-again` → re-run `runDoctor(realDoctorProbe())`, push `doctor`.
- `install-primary` → source flow (QuickPick: "New clone…" / "Use existing checkout…" / cancel).
- `install-alternative` → npm flow (QuickPick: npm global / npx cache / copy command).
- `install-node` → open https://nodejs.org/en/download via `openExternal`.
- `install-git` / `install-pnpm` → open official install docs via `openExternal`.

### Behavior changes

1. **No blind auto-start** (launcherView.ts L577–581): on `resolveWebviewView`
   and on `view-ready`, run Doctor (fast: bounded probes, ≤ ~5 s worst case).
   `ready`/`dsh-unrunnable` with a resolvable binary → start as today.
   `dsh-missing`/`node-missing`/`source-prerequisites-missing` → render the
   setup panel, do **not** spawn. An explicit Start click always attempts the
   start (user's informed choice) and its failure re-renders the setup panel.
2. **Doctor command** `dshmux.doctor`: runs the report, shows a QuickPick with
   one item per check (icon ✓/⚠/✗, detail line, redacted paths), and an action
   item for the current state ("Set up DSH…" when not ready; "Check again").
3. **dshPath write (R3)**: after a validated checkout, a message shows the
   exact path; on confirm,
   `vscode.workspace.getConfiguration("dshmux").update("dshPath", path,
   vscode.ConfigurationTarget.Machine)` — machine scope (the setting is
   declared `machine-overridable`), and a follow-up Doctor run must show
   `ready` with `installType: source`.
4. **Ready machines unchanged**: existing users with a runnable DSH keep the
   current direct-start flow; the Doctor probe adds at most a bounded
   pre-check and no first-run prompt.
5. **Setup terminal (R5, 2026-09-05 user addendum)**: one session-scoped
   "DSHmux setup" terminal opens on the first setup action and is reused by
   every install flow (including the missing-tool guidance paths). Each
   confirmed step is announced by one auto-echoed `printf '%s\n' '…'` line
   (step number, purpose, exact command — the only auto-executed text) and
   then the command itself is prefilled with `sendText(cmd, false)`.
 6. **GitHub source link (R6, 2026-09-05 user addendum)**: the setup panel
    carries a "Source on GitHub →" row (always present while the panel is
    visible) that opens the exact tested branch — derived from the frozen
    `TESTED_SOURCE_REPO` + `TESTED_SOURCE_BRANCH` — via
    `vscode.env.openExternal`; nothing runs locally.
 7. **Auto-run primary flow (R7, 2026-09-05 user addendum)**: in the
    new-clone branch, the per-step `confirmStep` loop is replaced by ONE final
    modal that lists every plan command (numbered, verbatim) with
    Run / Copy / Cancel. On Run, the shared DSHmux setup terminal receives
    the R5 echo lines for all steps, then the whole plan as a single
    `sendText(plan.map(c => c.command).join(" && "), true)` — a failing step
    stops the `&&` chain. DSHmux cannot read terminal output (no VS Code API),
    so it does not wait; it shows one notification pointing to the terminal
    and to **Check again** for re-verification. R2, the existing-checkout
    branch, and the guidance paths are untouched.
  8. **Locale set change (R9, 2026-09-05 user addendum)**: the string-table
     columns become en, zh, ja, ko, et, es, pt, fr, de, uk — Russian is
     dropped, Estonian and Ukrainian are added to every key. The resolver in
     `src/i18n.ts` gains `et`/`uk` prefix entries and loses `ru` (Russian
     display language now falls back to English). `package.nls.*` files are
     unaffected (they carry only the default EN + zh-cn command/setting
     titles).

## File-change list

| File | Change |
|---|---|
| `src/dshDoctor.ts` | **new** — report types, `DoctorProbe`, `realDoctorProbe`, `runDoctor`, `classifyInstallType` |
| `src/dshInstallService.ts` | **new** — tested-source constants, `InstallCommand` plans (clone / npm / npx), `CheckoutCheck` builder, parent-dir default |
| `src/installService.ts` | **new** — VS Code layer: `runDoctorCommand`, `runPrimaryInstallFlow`, `runAlternativeInstallFlow`, `validateExistingCheckout` (dialog + `dshPath` confirm/write), shared `prefillTerminal(command)` helper (mirrors versionCheckService L163–166) |
| `src/launcherView.ts` | edit — `DoctorAware` init + `doctor` message in/out, setup panel HTML/JS (primary + alternative + tool links + Check again), auto-start gate (L577–581), constructor gains install-action callbacks |
| `src/commands.ts` | edit — register `dshmux.doctor` via a new `onDoctor` parameter (kept thin: `registerCommands(context, manager, revealChat, openEditorPanel, onDoctor?)`) |
| `src/extension.ts` | edit — construct install-service callbacks, wire to launcher + commands; Doctor hostLabel from `vscode.env.remoteName` |
| `src/i18nStrings.ts` | edit — `doctor.*` and `install.*` keys, 9 locales, EN + ZH synced (zh/ja/ko/ru/es/pt/fr/de follow the existing 9-locale table convention; R9 supersedes: final set is the 10 locales en, zh, ja, ko, et, es, pt, fr, de, uk — see behavior item 8) |
| `package.json` | edit — `contributes.commands` += `dshmux.doctor` (`%command.doctor.title%`) |
| `package.nls.json`, `package.nls.zh-cn.json` | edit — `command.doctor.title` |
| `test/dshDoctor.test.js` | **new** — classification matrix (missing node / missing dsh / stale config / npm-global / npx-cache / source / Windows shim / untested / dirty-checkout / spaces-in-path) with an injected probe; read-only + no-server guarantees |
| `test/dshInstallService.test.js` | **new** — command construction, version pinning, Windows quoting/shell selection, checkout validation (stale build, missing artifact, dirty repo, wrong branch) |
| `test/launcherView.test.js` or existing launcher coverage | edit — auto-start gate (missing DSH → no spawn; ready → spawn), doctor message round-trip |

## Verification gates

- `npm run compile` zero issues after every TS task.
- `node --check` on any edited webview JS (the launcher HTML/JS is template
  literal in TS — covered by compile; no standalone webview JS file changes
  expected, so `node --check` applies only if a `media/` file is touched).
- `npm test` green after each task; new tests are deterministic (injected
  probes, temp dirs for checkout validation, no real package installs).

## Non-goals (this round)

- No I4 setup-bundle code (deferred, in TODO.md).
- No auto-installation of Node/npm/Git/pnpm (X1), no host ripgrep (X2), no
  in-place patching or modification of any checkout (X3).
- No changes to `DshServerManager` internals or the upgrade flow's semantics.
