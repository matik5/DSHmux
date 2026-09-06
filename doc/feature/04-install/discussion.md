# 04-install — Discussion

**Date**: 2026-09-01

**Sources**:
- [doc/install/implementation-plan.md](../../install/implementation-plan.md) — installer roadmap; I1–I4 are NOT DEFERRED, order 1–4

## Why this feature

A first-time user who installs DSHmux on a machine without DSH gets a
start failure (spawn ENOENT or ready-timeout), an error string with a list of
probed paths, and a Start button that repeats the same failure. The ideas file
asks for: environment detection, a guided choice between npm and source
installation, and a local user-setup package helper. The roadmap refines this
into four ordered phases:

1. **I1 — DSH Doctor**: read-only environment report + actionable state.
2. **I2 — Guided npm/npx installation**: version-pinned install commands, user-confirmed.
3. **I3 — Guided source-checkout installation**: advanced path, validated build artifacts.
4. **I4 — Portable user setup bundles**: export/import selected DSH configuration safely.

Rejections that shape the design (roadmap §Rejected): no automatic Node/npm/Git/
pnpm installation (X1), no host ripgrep installation (X2 — the npm-shipped DSH
packages its own ripgrep), no silent in-place patching of any DSH installation (X3).

## Code-audit facts (DSHmux, 2026-09-01)

### Discovery helpers — all pure and test-injectable (src/serverManager.ts)

- `resolveNodeExecutable(platform?, execPath?, home?, env?) → string` (L179).
  Probes PATH, Volta, `~/.local/bin`, asdf/mise/fn/nvm shims, Homebrew,
  `~/.nvm/versions/node/*/bin`, Windows Program Files/LOCALAPPDATA/scoop, then a
  bounded 5 s `shell -lic "command -v node"` fallback. **Returns the bare
  `node`/`node.exe` name when nothing is found — the return value is not
  guaranteed runnable**; Doctor must probe the resolved path with `--version`.
- `resolveDshVersion(bin) → string | null` (L333). `dsh --version` via
  `spawnSync`, 5 s timeout, `null` on any failure.
- `resolveDshPath(home?, platform?) → { path: string | null; tried: string[] }`
  (L406). Candidate order: `$DSH_BIN`, npm global prefix `bin`, Windows roaming
  `%AppData%\npm`, `/opt/homebrew/bin`, `/usr/local/bin`, `~/.npm-global/bin`,
  `~/.nvm/versions/node/*/bin/dsh`, npx cache (`~/.npm/_npx/*/node_modules/.bin/dsh`
  or `%LocalAppData%\npm-cache\_npx\...`). Windows probes the `.cmd` shim first.
  `tried` is redacted (`~` for home).
- `resolveStartBin(opts, configuredBin, home?, platform?)` (L452). `opts.dshBin`
  is authoritative; the configured `dshmux.dshPath` is used only if it exists on
  this host, else auto-discovery runs (a stale setting can never break startup).
- `spawnSpec(bin, ...)` (L315). `.js` entries (source checkouts:
  `apps/cli/lib/bin.js`) run explicitly under the resolved Node; on Windows a
  `.cmd` shim needs a shell.
- `probeNoOpenSupport(bin)` (L362). Bounded read of `dsh web --help`, cached per
  binary; returns `null` when the probe itself fails.
- `DshServerManager.start()` failure paths (L626–667): child `error` ENOENT →
  `"dsh not found. Tried: PATH, …"` or `"Node.js was not found while launching …"`;
  exit before ready → stderr tail (bounded 2 KB); ready timeout → settleError.
  State machine: `stopped / starting / ready / error / stopping`; `state` events
  carry `{ state, url?, message? }` plus `version` when known.

### Launcher (src/launcherView.ts)

- `resolveWebviewView` **auto-starts** the server whenever it is not running
  (L577–581). On a machine without DSH, every sidebar reveal attempts an
  inevitable failed start — exactly the behavior I1 replaces.
- Error state renders the failure message plus a primary **Start** button
  (re-click repeats the failure). `LauncherInit` (L28–38) currently carries only
  `state / message / version / extVersion / latestVersion / nextVersion`.
- Status push contract: `server-status` postMessage (state, message, version,
  latestVersion, nextVersion); a `view-ready` handshake re-pushes the current
  state so a page that finishes loading late never freezes.
- The ready-state compatibility warning (`launcher.compatibilityUntested`) is
  advisory only — an untested DSH version never blocks start. Doctor must keep
  the same policy.

### Upgrade flow — the terminal-prefill pattern (src/versionCheckService.ts)

- `showUpgradeOptions` (L118): QuickPick of install options →
  `vscode.window.createTerminal("DSHmux upgrade")` → `terminal.sendText(cmd, false)`
  — **prefill only, the user presses Enter** — plus an info message; a
  "Copy command" item writes the command to the clipboard instead.
- `checkForUpdates` (L32): 24 h gate in `workspaceState`, registry fetch with a
  5 s timeout, all failures silent (offline = no nagging).
- `src/versionCheck.ts`: single `TESTED_DSH_VERSION = "0.1.2-rc.1"` anchor;
  `dshCompatibility()` → `tested / older / newer / unknown`;
  `upgradeCommandFor(dshPath, channel)` builds channel commands.

### Configuration, commands, i18n

- `src/configuration.ts`: `dshmux.dshPath` (string, default empty) with legacy
  `deepseekHarness` namespace fallback; read-only helpers today. I3 needs a
  narrow, confirmed **machine-scoped** write (`ConfigurationTarget.Machine`).
- `src/commands.ts`: `dshmux.start / stop / openBrowser / openPanel`, registered
  via `registerCommands(context, manager, revealChat, openEditorPanel)`.
  Doctor adds `dshmux.doctor` (and bundle commands for I4).
- `src/i18nStrings.ts`: 9 locales (en, zh, ja, ko, ru, es, pt, fr, de),
  `{placeholder}` interpolation, accessed via `t(key, params)`; `package.nls.json`
  + `package.nls.zh-cn.json` hold command/setting metadata.
- `src/extension.ts` (L24–211): creates the manager with the `configuredDshBin`
  provider; auto-restart from `dsh.wasRunning`; constructs the launcher with an
  upgrade callback wired to `showUpgradeOptions`; `revealChat()` at activation.

### Host facts

- `package.json`: `extensionKind: ["workspace"]` — all probes and any terminal
  prefill run on the **workspace extension host** (in Remote SSH/WSL/Dev
  Containers, not the UI machine). Doctor must report the workspace host.
- npm-shipped DSH carries a packaged ripgrep; host `rg` is not a prerequisite.

## DSH-side facts needed for I4

I4 (setup bundles) depends on the exact settings Remote API, the `~/.dsh`
file model, the MCP server definition schema, and profile/patch formats of the
tested DSH version (0.1.2-rc.1). A read-only audit of the DSH checkout is
running; its findings go into `solution.md` **before the manifest contract is
frozen** (roadmap I4: "Audit the exact MCP patch schema of the tested DSH
version before freezing the manifest contract").

## Open questions / decisions

1. **I3 tested source revision**: the roadmap requires recording an explicit
   tested upstream revision alongside `TESTED_DSH_VERSION`, not inferring a Git
   tag from the npm version. The rc.1 tag/commit of the deepseek-harness
   repository must be recorded as a constant (candidate: the `v0.1.2-rc.1` tag,
   to be confirmed against the remote).
2. **Doctor result surface**: a dedicated view, a QuickPick + output channel, or
   a launcher section? Constraint from the roadmap: the launcher must show the
   Doctor result and installation actions when no runnable DSH is found, and a
   ready machine must keep the current direct-start flow with no extra prompt.
3. **I4 transport**: which settings endpoints exist on rc.1, their auth (the
   launch-token cookie DSHmux already exchanges), redaction behavior, and
   conflict semantics — from the audit subagent.
4. **Scope of "check again"**: the roadmap forbids observing terminal command
   completion; Doctor re-runs only on explicit user action.
