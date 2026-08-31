# DeepSeek Harness and DSHmux Compatibility Patches

**Date**: 2026-08-31  
**Status**: Maintained

This directory records compatibility changes developed while integrating a
patched DeepSeek Harness with DSHmux. Each change has a human-readable record
and a Git patch beside it.

The patch files are source archives. DSHmux does not discover or apply them at
runtime. Build the patched Harness separately, then point
`dshmux.dshPath` at its built CLI.

## Catalog

| Change | Target repository | Local status | Record | Patch |
|---|---|---|---|---|
| Compaction admission header | `deepseek-ai/deepseek-harness` | Applied as commit `59de2bcde4` | [Details](compaction-admission-header.md) | [Patch](compaction-admission-header.patch) |
| Remote loopback proxy mapping | `matik5/DSHmux` | Merged in DSHmux as commit `3557288a` | [Details](remote-loopback-proxy.md) | [Patch](remote-loopback-proxy.patch) |
| Provider-compatible JPEG request images | `deepseek-ai/deepseek-harness` | Present in the local Harness working tree | [Details](request-image-jpeg-compatibility.md) | [Patch](request-image-jpeg-compatibility.patch) |

## Repository boundaries

The fixes live at different layers:

- Harness owns model requests, compaction calls, durable image attachments, and
  provider-facing image projection.
- DSHmux owns Harness process launch and the VS Code webview transport.
- A DSHmux webview cannot convert an image loaded by Harness's internal
  `read_image` tool because those bytes never cross the webview bridge.
- The remote loopback issue is therefore a DSHmux patch, while compaction and
  image projection are Harness patches.

Do not apply all three patches to one repository.

## Before applying a patch

1. Read the matching Markdown record and confirm its target and base revision.
2. Use a clean branch based on the documented revision.
3. Run the documented dry-run command.
4. Apply the patch and run its verification commands.
5. Rebuild Harness before restarting it from DSHmux.

These snapshots may need rebasing as either upstream repository changes. Never
silently resolve a failed hunk: re-check the upstream behavior first, because
the original fix may already have been merged or replaced.

## Updating this catalog

When a patch changes:

1. Regenerate it from only the files belonging to that fix.
2. Update its base revision, behavior, limitations, and verification results.
3. Confirm the patch applies in a disposable worktree.
4. Keep unrelated local commits and working-tree changes out of the artifact.
