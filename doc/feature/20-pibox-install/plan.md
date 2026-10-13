# Pibox DSHmux installation — Implementation Plan

**Date**: 2026-10-13

## Goal and requirements
- R1: Install current DSHmux 0.4.14 (source b63d282) into pibox's VS Code Remote extension host.
- R2: Install its tested patched DSH 0.1.7-rc.1 at revision 67ddcb32a7cf8ec2e8f028979d3bebe7588b5bc0 and select it in Remote Settings.
- R3: Preserve existing checkout, DSH user data, credentials and unrelated settings; verify executable and server readiness. No PAN configuration changes.

## Facts and gap
Pibox is Linux aarch64, user mati, with Node 24.18.0 in ~/.nvm (not on noninteractive SSH PATH). VS Code Server 1.138.0 provides code-server. Installed extension is 0.4.8; Remote Settings selects ~/proj/deepseek-harness/apps/cli/lib/bin.js, reporting DSH 0.1.5-rc.2. That checkout is clean on the old patched branch. Local src/dshInstallService.ts pins the new patch revision and pnpm 11.7.0. The latest local package is 0.4.14.

## Approach and compatibility audit
Build a fresh universal VSIX from the current committed source in this isolated worktree. Install pinned pnpm into ~/.dshmux managed storage and a separate source checkout at ~/.dshmux/deepseek-harness-0.1.7-rc.1; build the native addon on pibox for its architecture. If source compilation exceeds its available memory, build portable JavaScript/frontend artifacts locally from the identical clean pinned revision and copy only generated lib/frontend/build-record files; never copy macOS native modules or node_modules. Use the existing VS Code Server extension CLI. Back up the settings file before changing only dshmux.dshPath. This existing setting is consumed by configuration.ts/extension.ts/serverManager.ts and remains an absolute CLI path; all consumers are compatible. No wire or storage schema change. Smoke-test the new DSH with an isolated temporary user home and cleanly stop the test process.

## Traceability
| Requirement | Task | Verification |
|---|---|---|
| R1 | T1 VSIX build/install | V1 manifest/dependency contents; remote extension listing |
| R2 | T2 patched checkout/build | V2 exact revision and CLI version |
| R2, R3 | T3 configure/check | V3 settings diff, local isolated web readiness |

### T1 — Build and install DSHmux
Status: ✅
Use npm ci, compile/package; copy the VSIX and install with remote code-server. Completion: pibox reports matik5.dshmux@0.4.14.

### T2 — Install patched DSH
Status: ✅
Install managed pnpm 11.7.0, clone pinned source, frozen-lockfile install and build. Completion: revision matches and CLI reports 0.1.7-rc.1 on ARM64.

### T3 — Select and verify
Status: ✅
Back up Remote Settings, select the new CLI only; verify fresh DSH web server readiness in isolated home, stop it, record results in verification.md. Completion: only intended setting changes, previous checkout/data preserved.

Progress: Fresh VSIX installed and listed as 0.4.14. Full local suite: 276 passed, 1 skipped. Remote dependency installation and linux-arm64 native build succeeded. Remote TypeScript compilation exhausted free memory/swap; its termination has been requested. A fresh full build from the identical pinned local source completed, and a portable artifact archive excludes all native binaries. SSH currently stalls during banner exchange; T2/T3 remain pending until transfer and runtime checks finish.

Close-out: SSH recovered. Portable artifacts were transferred, new DSH executed at exactly 0.1.7-rc.1, and the installed extension created/listed an authenticated session and assembled the webview (distRev d4f3416c767f). Remote Settings now selects the new CLI, with a byte-preserving change to its sole dshPath entry and a timestamped backup. Existing checkout remains clean on its previous branch.
