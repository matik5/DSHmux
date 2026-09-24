# Patched DSH upgrade choice — Requirements

**Date**: 2026-09-24
**Status**: Approved by the user's instruction to implement in this worktree
**Source**: [discussion.md](discussion.md)

- **R1**: The compact DSHmux menu offers a patched `matik5` DSH 0.1.7-rc.1 installation regardless of npm update availability or whether the current DSH is ready.
- **R2**: Selecting it shows the exact fork, branch, and destination, allows a different destination, installs only the pinned patched source, verifies it, and selects its binary for subsequent starts. Existing DSH installations remain intact.
- **R3**: After a successful install, offer to restart the running DSH so the new binary takes effect. Do not interrupt it without the user's choice.
- **R4**: Preserve npm `latest` and `next` actions. Localize new UI text and verify behavior with tests and a packaged VSIX.
- **R5**: A successful explicit patched upgrade writes the verified binary path to `dshmux.dshPath` in User settings as well as the existing workspace selection. Failure to update Settings must not invalidate the installed checkout; the user must be told.
- **R6**: A source checkout must be allowed enough time to start with the user's existing MCP-enabled profile. Standard installed binaries keep their existing startup timeout, and an explicit test timeout keeps precedence.
