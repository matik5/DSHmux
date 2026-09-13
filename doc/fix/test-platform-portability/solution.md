# Test platform portability — Solution

**Date**: 2026-09-13

## Goal

Make the test suite deterministic on macOS, Linux, and Windows without changing
normal DSHmux install or Node discovery behavior.

## Facts

- `resolveNodeExecutable` in `src/serverManager.ts:180-278` accepts a simulated
  platform and builds candidates with the matching path API.
- Its POSIX candidate list in `src/serverManager.ts:235-248` always appends host
  system paths, including `/opt/homebrew/bin/node`; that executable exists on
  the current macOS host even when the test passes `platform = "linux"`.
- The login-shell fallback in `src/serverManager.ts:257-275` is already limited
  to `platform === process.platform`.
- `managedStorageForContext`, `managedBinsForContext`, and
  `chooseManagedInstall` in `src/installService.ts:58-74,372-425` deliberately
  use `process.platform` for real VS Code filesystem paths.
- The fake workspace, global storage, folder selections, and assertions in
  `test/installService.test.js:35-244` are hard-coded to Windows paths.
- Explicit Windows and POSIX path behavior remains covered in
  `test/dshInstallService.test.js:50-120`, where platform arguments are passed
  directly to the pure builders.

## Gap

Simulated-platform tests can observe unrelated host executables, and runtime
integration tests combine host path semantics with foreign path fixtures. The
result depends on the machine running the suite rather than the behavior under
test.

## Call-site audit

No public function signature or return contract changes. Existing callers of
`resolveNodeExecutable` remain compatible; only system-wide fallback candidates
are suppressed when its explicit platform differs from the actual host.

Callers checked:

- `src/dshDoctor.ts:143,181` — passes the real platform; behavior is unchanged.
- `src/serverManager.ts:327` — defaults to or receives the launch platform; real
  launches retain native system fallbacks.
- `src/installService.ts:226,340` — passes the real platform; behavior is
  unchanged.
- `test/serverManager.test.js:200,231,235` — simulated-platform calls become
  isolated from host-only system paths.

## Tasks

1. In `src/serverManager.ts`, add native system paths only when the requested
   platform is the current host, while retaining PATH, environment, and home
   candidates for simulations.
2. In `test/installService.test.js`, derive fake filesystem paths and assertions
   with the current host's path API.
3. Run focused tests and the complete `npm test` suite, then record verification.
