# Patched DSH upgrade choice — Summary

**Date**: 2026-09-24

DSHmux 0.4.9 now exposes the pinned `matik/dsh-patches-0.1.7-rc.1` checkout directly in the compact menu, independent of npm update availability. The action confirms its destination, installs and verifies the patched source, remembers its binary, and offers to restart DSH. npm `latest` and `next` actions remain available.

The full test suite passed and the new VSIX was installed into local VS Code. Changes are uncommitted in `matik/dsh-0.1.7-rc.1`; `main` was not changed.

Follow-up: the installed patched checkout was valid but the user's MCP-enabled profile took 62–70 seconds to report ready, exceeding the previous 30-second DSHmux timeout. Source checkouts now receive 120 seconds. A successful explicit patched upgrade also writes the verified binary to `dshmux.dshPath` in User settings. The revised VSIX was installed into local VS Code.
