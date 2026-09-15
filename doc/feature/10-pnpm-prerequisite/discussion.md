# pnpm Prerequisite — Discussion

**Date**: 2026-09-15

## User request

Before DSH installation runs, DSHmux must ensure that pnpm is installed. The
Doctor must show pnpm as a separate check entry and provide an install option.

## Observed environment

- Windows ARM64 has Node.js 26.8.2 and npm 11.19.1 installed under
  `C:\Program Files\nodejs`.
- Node.js 26 does not bundle Corepack, so installing Node does not make a
  `pnpm` command available.
- DSHmux Doctor finds Node/npm independently of the host's stale `PATH`.
- The managed source installation currently bootstraps pnpm implicitly with
  `npm exec --package=pnpm@11.7.0`.
- In the observed repair, the first pnpm invocation installed dependencies but
  the later build invocation failed because `npm exec` could not resolve the
  temporary `pnpm` executable.

## Code-audit facts

- `src/dshDoctor.ts` defines Doctor states for Node, npm, and DSH only.
- `DoctorReport` contains `node`, `npm`, and `dsh`; it has no pnpm result.
- `runDoctor()` probes npm only after Node is runnable and does not probe pnpm.
- `src/installService.ts` renders rows for host, Node, npm, and DSH only.
- `doctorActionFor()` can return `node`, `npm`, or `repair`; there is no pnpm
  action.
- `runDoctorCommand()` maps Node/npm actions to guidance and maps `repair`
  directly to managed DSH installation.
- `src/dshInstallService.ts` pins `TESTED_PNPM_VERSION` to `11.7.0`, but
  `buildPnpmExecArgs()` relies on npm's temporary executable discovery.
- The managed source installer invokes that `npm exec` wrapper for both
  `pnpm install --frozen-lockfile --force` and `pnpm build`.
- Doctor and install behavior is covered by `test/dshDoctor.test.js`,
  `test/installService.test.js`, and `test/dshInstallService.test.js`.
- Doctor UI strings are centralized in `src/i18nStrings.ts` for all supported
  locales.

## Scope boundary

This feature concerns Doctor prerequisite detection and the managed install
workflow. It does not change Node installation, npm installation, DSH runtime
behavior after installation, or the project's supported pnpm version.
