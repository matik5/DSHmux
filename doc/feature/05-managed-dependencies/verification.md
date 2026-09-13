# 05-managed-dependencies — Verification

**Date**: 2026-09-13
**Result**: PASS

## Requirement traceability

| Requirement | Live implementation | Evidence |
|---|---|---|
| R1 official DSH only | `buildManagedInstallSpec` pins `@deepseek-ai/dsh@0.1.5-rc.2`; official tag/revision constants replace the fork | Exact metadata/argv tests; forbidden-reference audit returned no matches |
| R2 Doctor installs and repairs | launcher opens `runDoctorCommand`; repair calls `runManagedInstall`, installs under extension global storage, then verifies the CLI | confirmation, cancellation, process, retry, wrong-version and output-bound tests |
| R2 existing installs remain usable | Doctor selects managed, configured, then discovered candidates; manager retains configured/discovery fallback | Doctor precedence and source/custom/global discovery regressions |
| R3 accurate prerequisites | Doctor checks Node `^22.19.0 || >=24.0.0` and npm only when no runnable DSH exists | boundary matrix includes rejected Node 22.18 and 23; Git/pnpm absence test |
| R4 one quiet launcher action | one static `#dependencyFix` posts `open-doctor`; messages only toggle it | launcher/layout tests cover all states and repeated messages |
| Release 0.4.7 | package and lock metadata are 0.4.7 | VSIX manifest and embedded package inspection |
| Install-location amendment | Doctor exposes global and project choices, project defaults to `.dshmux`, Change targets a normal official checkout, and only native Cancel remains | Exact action/path/argv/persistence tests; i18n parity |

## Call-site audit

- `managedDshBin` is consumed by Doctor and activation; activation trusts it only after exact-version validation.
- `runDoctorForLauncher` is called on initial render and refresh.
- `runDoctorCommand` is registered as the Doctor command and calls the managed repair flow for repairable states.
- `dependencyFix` has one HTML node and one route to the Doctor command.
- Removed source-clone/update APIs, Git/pnpm readiness probes, setup panel and compatibility banner have no live callers.

## Executed checks

- `npm run compile`: PASS, TypeScript emitted no errors.
- `npm test`: PASS, **212/212** tests, including Windows runtime repair and install-location regressions.
- Forbidden text audit across source, tests, package metadata and changelogs: PASS; no patched-branch, patched-source, obsolete Doctor state, or Node 20 references.
- `git diff --check`: PASS.
- Real managed install: PASS. The production-shaped npm argv installed the official package in an isolated prefix; `--version` returned `0.1.5-rc.2`; `dsh web --port 45731 --no-open` reached a ready URL.
- Windows behavior: PASS at deterministic level for paths with spaces, shell-free `npm-cli.js` argv, managed JS entry, Node range, and existing `dsh.cmd` discovery.
- Review regressions: PASS. Tests cover Doctor/installer PATH parity, cancellation waiting for child close, and suppression of ineffective global/npx upgrades for managed DSH.
- `npm run package`: PASS. `dshmux-0.4.7.vsix`, 76 files, 1.06 MB. Both the VSIX identity and embedded package report version 0.4.7.
- Repackaged amended build: PASS. `dshmux-0.4.7.vsix`, 75 files, 1.07 MB; forced local installation reports `matik5.dshmux@0.4.7`.

The npm 11 smoke emitted dependency install-script approval warnings, but the installed CLI still passed exact-version verification and launched the DSH web server successfully.

## Gap log

| Gap | Severity | Disposition |
|---|---|---|
| A physical Windows VS Code host was not available for this run. | P3 | Windows-specific command/path behavior is covered deterministically; install the produced VSIX on Windows for final UI acceptance. |

## Conclusion

All approved requirements and plan tasks are implemented and verified. No blocking or release-critical gaps remain.
