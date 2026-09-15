# pnpm Prerequisite — Summary

**Date**: 2026-09-15
**Result**: Complete

DSHmux Doctor now treats pnpm 11.7.0 as an explicit setup prerequisite. It
reports pnpm independently, distinguishes missing and incompatible versions,
and offers a managed installation action before DSH repair.

The pnpm action installs the pinned package under the selected DSHmux storage,
streams cancellable progress, and verifies the direct JavaScript entry. DSH
installation has a second prerequisite gate at its own boundary, so it cannot
be entered through another caller without supported Node, npm, and pnpm.

Source checkout installation no longer uses `npm exec` to discover pnpm. It
executes the verified pnpm JavaScript entry through Node (or a verified native
POSIX/executable fallback) with structured arguments and no shell. This avoids
PowerShell policy, Windows shim quoting, and npm temporary-bin PATH failures.
The verified pnpm bin directory is also prepended to the source-build
environment so nested package scripts that invoke bare `pnpm` keep working.

Doctor UI/state/action strings were added for all ten supported locales.
Existing runnable DSH installations retain the established `ready` behavior.

Verification completed with 251/251 tests passing, a real Windows ARM64
managed-prefix install/direct-invocation check, and a full real DSH source
build whose generated CLI reported `0.1.5-rc.2`.
