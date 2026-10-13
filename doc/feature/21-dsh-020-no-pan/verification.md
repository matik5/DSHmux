# DSH 0.2.0-rc.2 without PAN — Verification

**Date**: 2026-10-13

## Coverage
- R1/T1: Activation no longer imports or constructs PAN adapters; state/config/workspace PAN listeners removed. Five PAN modules/tests and PAN-only manager methods removed with every in-repo caller. Settings/descriptions, libsodium dependencies and package inclusion removed. Current READMEs no longer advertise PAN; the previous protocol is explicitly historical under doc/archive. No credentials, pending files or settings outside the repository were changed.
- R2/T2: Harness branch matik/dsh-patches-0.2.0-rc.2 is based on upstream639ed015397290b3745d163aafe02ffee4aa3f84, patch dbe724e7dbe44ed5551c2f674f12b85b86558548. Real encoder tests cover JPEG/no-alpha variants over white, under-budget PNG/JPEG passthrough, durable alpha preservation and cache separation via request-image-v7. LocalAttachmentService.readForRequest calls readRequestImageFile; source public exports/signatures remain unchanged. Fork remote SHA confirmed equal to the pin.
- R3/T3: versionCheck and source installation constants, Doctor paths, explicit upgrade and localized guidance now select0.2.0-rc.2. Source branch/revision tests cover the exact fork and upstream tag. DSHmux0.4.15 manifest and lock agree. Real DshServerManager start/ensureWorkspaceSessionResilient/listWorkspaceSessions/searchSessions plus assembleDocument were exercised against built new patched Harness; cookie-authenticated RPC and all68 boot plugin URLs passed. Dictation uses the same tested-version constant; upstream composer retains the data-composer-input selector. Native microphone inference was not rerun.
- R4: Primary worktrees/branches preserved, user state untouched. No remote/pibox build or installation performed. Historical PAN records remain for audit, not in the VSIX.
- T4: DSHmux task branch published at1255848 and its remote ref verified. Close-out documentation is committed afterward; main integration follows the user’s earlier explicit instruction in this session.

## Checks and results
Harness:
- pnpm install --frozen-lockfile: PASS, Node engine and pnpm11.7.0 unchanged.
- pnpm exec vitest run packages/attachment/attachment-local/tests:93 passed,1 skipped.
- pnpm run doc-sync:43 passed,0 failed; updated en/zh README and decision-note pairing records validated.
- pnpm build: PASS, native addon, Host/Client/desktop bundles and Web assets.
- read-image-reencode keyless snapshot:1 passed,137 filtered out. Initial source replay lacked generated/native artifacts; rerun after the required build passed.
- Normal pre-commit pairing/lint/whitespace/vendor checks and pre-push typecheck: PASS. Fork branch pushed; remote dbe724e7 matches local HEAD.

DSHmux:
- Compile: PASS.
- Initial suite exposed four stale escaped version regex expectations; corrected them. Focused install/version checks:68 passed. Final complete suite:318 passed,2 existing platform skips,0 failed (320 total).
- Initial real smoke hit the shipped full-text opt-out (openAt:never), also present in0.1.7-rc.1. No upstream default was changed. With an isolated home patch enabling first-search, authenticated workspace/session/search RPCs and assembled frontend passed; distRev0fcffa524b54 and68 boot plugin URL fetches succeeded. Temporary homes/cache/test processes removed afterward.
- Fresh VSIX0.4.15:92 files,4.41MB. Archive inspection confirms no PAN output modules, settings or libsodium, and compiled fork branch/exact revision. SHA256:ce8f3fe4f9c735a7d6b4249cbddec46dab2ca0159ac6e4c6d689132ae2b96872.
- git diff --check: PASS.

## Gaps
No unmet implemented criteria. Real external model-provider requests, interactive VS Code window behavior and native dictation were not exercised; these are verification limits, not claimed as passing. The VSIX is built but not installed in this round. Full-text search still requires Harness deployment opt-in. Historical PAN files remain as records; no runtime support remains in the new extension.

## Summary
Removed PAN from shipped DSHmux, ported our JPEG image compatibility patch to DSH0.2.0-rc.2, published the Harness branch and pinned DSHmux to its exact revision. Built and checked DSHmux0.4.15 against the real new runtime.

## Outstanding work
No outstanding tasks.
