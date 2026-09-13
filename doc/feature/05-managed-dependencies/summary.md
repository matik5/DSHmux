# 05-managed-dependencies — Summary

**Date**: 2026-09-13
**Release**: DSHmux 0.4.7

DSHmux no longer guides users to the `matik/dsh-patches-*` fork. Doctor now installs the pinned official `@deepseek-ai/dsh@0.1.5-rc.2` package into a versioned directory owned by the extension, without a global npm install or a `dshmux.dshPath` rewrite.

The launcher replaces the large setup and compatibility panels with one small **Missing deps · Fix** button. It opens Doctor, which displays one state-appropriate action: install/repair DSH, install a supported Node release, or restore npm. Repeated checks only toggle the existing button, so duplicate notices cannot accumulate.

Node is still required because the official DSH CLI is a Node application. The requirement is now reported accurately as Node 22.19+ within Node 22, or Node 24+. Git and pnpm are not runtime dependencies and are no longer probed or shown as blockers. A runnable existing global, npx-cache, source-checkout, or custom installation continues to work.

Quality gates passed: TypeScript compilation, 202/202 tests, a real isolated official-package install and web-server launch, source invariants, and VSIX packaging. Windows managed repair preserves structured arguments without a shell, shares Doctor's Node/npm PATH, waits for cancellation shutdown, refreshes the launcher on **Check again**, and suppresses ineffective global upgrades. The deliverable is `dshmux-0.4.7.vsix`.

See [verification.md](verification.md) for evidence and the one non-blocking physical-Windows acceptance gap.
