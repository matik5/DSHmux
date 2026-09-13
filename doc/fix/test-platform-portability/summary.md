# Test platform portability — Summary

**Date**: 2026-09-13

Created a separate fix on branch `matik/fix-test-platform-portability` in its own worktree.

- Native fallback paths in Node discovery are no longer consulted when a test explicitly simulates a different platform.
- Install-service integration fixtures now use host-native paths.
- Explicit Windows path rules remain tested by the pure path-builder tests.
- The complete suite passes with 227 passed, 0 failed, and 1 expected Windows-only skip.

No version bump was made.
