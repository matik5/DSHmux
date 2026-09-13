# Test platform portability — Discussion

**Date**: 2026-09-13

The full test suite fails on macOS in seven cases that pass only when the host
filesystem happens to resemble the platform simulated by the test.

- `serverManager.test.js` simulates Linux, but Node discovery still probes the
  macOS host's `/opt/homebrew/bin/node`.
- `installService.test.js` exercises runtime code that intentionally uses
  `process.platform`, while its fake VS Code workspace and expected values are
  hard-coded as Windows paths.
- Windows path normalization already has direct, explicitly parameterized
  coverage in `dshInstallService.test.js`.

The fix should keep production behavior intact, make integration fixtures use
the host path format, and avoid adding a broad platform-abstraction layer.
