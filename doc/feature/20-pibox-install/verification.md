# Pibox DSHmux installation — Verification

**Date**: 2026-10-13

## Coverage
- R1 / T1 / V1: Fresh npm ci + compile/package from source b63d282 produced DSHmux 0.4.14; remote VS Code Server installed it and lists `matik5.dshmux@0.4.14`. Archive inspection confirms ws, libsodium-wrappers-sumo and libsodium-sumo runtime contents and the pinned DSH revision. Installed crypto dependency loads on Linux ARM64.
- R2 / T2 / V2: Remote checkout HEAD is 67ddcb32a7cf8ec2e8f028979d3bebe7588b5bc0; Node 24.18.0 CLI reports 0.1.7-rc.1. Pnpm 11.7.0 install used frozen lockfile. The Linux ARM64 addon was built remotely. Portable lib/frontend artifacts were freshly built locally from the identical clean revision, transferred without node_modules or native binaries, and loaded successfully with remote dependencies.
- R2/R3 / T3 / V3: Only the existing dshmux.dshPath JSON value was changed, verified by comparing all other settings. Backup: `~/.vscode-server/data/Machine/settings.json.dshmux-20261013-1791906158687379430.bak`. The old checkout remains clean on matik/dsh-patches-0.1.5-rc.2. An isolated temporary DSH_HOME was used for runtime verification and removed afterward; the smoke process stopped cleanly.

## Checks and results
- Fresh DSHmux full suite: 276 passed, 1 skipped, 0 failed (277 total).
- VSIX SHA256: e8f2f13276cf65191629538aa3f7f54b7f968e7dd268c74d7677d89dd1688b06.
- Remote package manager: pnpm 11.7.0; dependency installation and native system build succeeded.
- Remote full source build was interrupted by memory/swap exhaustion. SSH stalled and later recovered; no broad process termination or reboot was issued by this task. The portable build completed locally and its architecture-specific binaries were excluded from transfer.
- First smoke ran before transfer completed and fell back to an older discovered CLI; it failed its version assertion and was cleaned up. After complete extraction, the smoke was rerun with an explicit dshBin and confirmed both selected path and version.
- Remote installed-extension smoke: exact new CLI; cookie-authenticated session create/list; webview document assembly with base-relative plugins rewritten; distRev d4f3416c767f. PASS.
- Remote installed extension listing: 0.4.14. Linux ARM64 native addon present; crypto dependency ready. PASS.

## Gaps
No unmet installation criteria. A real editor-window reload/visual interaction and model-provider inference were not exercised. The installed remote extension and new DSH selection activate on reopening/reloading the pibox window; a running older DSH needs Stop/Start if it survives.

## Summary
Installed DSHmux 0.4.14 and its compatible patched DSH 0.1.7-rc.1 on pibox. Selected `/home/mati/.dshmux/deepseek-harness-0.1.7-rc.1/apps/cli/lib/bin.js` without changing PAN configuration, user data or the prior checkout.

## Outstanding work
No outstanding tasks.

## Post-restart recheck

The user confirmed that pibox restarted and requested a fresh check. Installed extension remains 0.4.14; CLI remains 0.1.7-rc.1 at the exact patch revision, and Remote Settings still selects it. Isolated installed-extension smoke was rerun with a memory guard: authenticated session create/list and assembled webview passed, distRev d4f3416c767f. Aggregate test-process peak RSS was 358 MiB; minimum system MemAvailable was 860 MiB (before 1176 MiB, after 1068 MiB). The guard did not trigger. No current-boot OOM/panic messages were found; previous-boot journal entries are unavailable, so the precise restart cause cannot be independently established. Earlier memory/swap exhaustion was observed during source compilation; normal runtime smoke does not reproduce it.

A pre-existing VS Code-managed DSH process still uses the old ~/proj/deepseek-harness CLI (PID 5267 at inspection, approximately 434 MiB RSS). It was not interrupted because it may own ongoing user work. Reloading the pibox VS Code window or stopping/starting DSH activates the already selected new CLI. This distinction is reported to the user; a clean new-version start has been exercised separately.
