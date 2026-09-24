# DSH 0.1.7-rc.1 support — Discussion

**Date**: 2026-09-24

The user requested a new DSHmux worktree, support for dsh 0.1.7-rc.1 using the maintained patched Harness branch, and review of the upstream VS Code fix. The upstream `c1403dd` change confirms that dsh 0.1.7-rc.1 serves `<base href="./">`, base-relative plugin preloads and boot URLs, two application batches, and `favicon-dark.svg`. DSHmux's existing document assembly handles only `/plugins/...` and older favicon references. The 0.1.7-rc.1 Harness tag still emits WebP for transparent model-request images; some configured OpenAI-compatible endpoints cannot decode it. Existing DSHmux Doctor defaults to the official npm package and has a manually selectable patched source build.
