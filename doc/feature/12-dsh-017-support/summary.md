# DSH 0.1.7-rc.1 support — Summary

**Date**: 2026-09-24

DSHmux's `matik/dsh-0.1.7-rc.1` worktree loads the 0.1.7 Web UI by rewriting relative, `./`-relative, and absolute plugin references in preloads, boot entries, and batches, and by resolving `favicon-dark.svg`. Doctor defaults to the revision-pinned patched Harness source in a versioned checkout, with an official npm package option. The tested-version marker and user guidance now identify 0.1.7-rc.1.

The Harness fork's `matik/dsh-patches-0.1.7-rc.1` branch starts at `dsh-v0.1.7-rc.1` and adds JPEG request-image projection for endpoints without WebP support. It is published at `67ddcb32a7cf8ec2e8f028979d3bebe7588b5bc0`; durable alpha images remain unchanged.

Review of upstream VS Code fix [`c1403dd`](https://github.com/floatinghotpot/deepseek-harness-web-for-vscode/commit/c1403ddc05cdb0f8952e808f14eb9228ccd21607): its diagnosis matches the live 0.1.7 document. It covers all three plugin URL forms, every boot batch, and the dark favicon while retaining the earlier absolute form. DSHmux required the same normalization because its document assembly had the same absolute-only assumption.

The extension version was raised to 0.4.9, packaged from a clean dependency install and regenerated compiler output, and installed in the user's Visual Studio Code extension directory.
