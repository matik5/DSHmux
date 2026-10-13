# DSH 0.2.0-rc.2 without PAN — Implementation Plan

**Date**: 2026-10-13

## Requirements
R1: Remove all PAN activation, settings, network adapters, helper APIs, tests and crypto dependencies from the shipped DSHmux extension. Normal chat, local sounds, dictation and Arcade remain available.
R2: Maintain a dedicated patched Harness branch based exactly on upstream dsh-v0.2.0-rc.2; retain our provider-compatible JPEG image transformation and versioned cache separation. Push the tested branch to the fork.
R3: DSHmux Doctor, explicit patched upgrade, compatibility checks and localized guidance select 0.2.0-rc.2 with the exact published patch revision. Publish the DSHmux task branch and verify the new integration/package.
R4: Preserve existing primary worktrees and user credentials/data. Historical PAN records remain historical and are not advertised as supported APIs. No pibox compilation or remote deployment in this round.

## Facts and gap
src/extension.ts constructs PAN lifecycle/question adapters through PanIntegration and synchronizes on state/config/workspace changes. Five pan*.ts modules implement quiet reports, mailbox questions, excerpts and follow-up commands. package.json includes three PAN settings and libsodium runtime dependencies/files. serverManager.ts imports panExcerpt and exposes sendSessionPrompt, describeQuestionSession, readQuestionExcerpt exclusively to PAN; its description test is PAN-only. README en/zh and doc/pan-protocol.md advertise the integration.

src/versionCheck.ts pins0.1.7-rc.1; src/dshInstallService.ts pins its upstream tag/revision and patched branch67ddcb32. installService.ts uses these specs for Doctor/explicit upgrade, including a versioned source checkout. i18nStrings.ts embeds the old version. Upstream0.2.0-rc.2 is639ed015397290b3745d163aafe02ffee4aa3f84, retains Node ^22.19 || >=24 and pnpm11.7.0, and still encodes alpha request images as WebP under request-image-v6.

## Approach and shared-call audit
- Delete src/pan{Lifecycle,QuestionBridge,Integration,Excerpt,Commands}.ts (five modules), their five tests, activation hooks, settings/descriptions, libsodium dependency/package file entries, and the PAN-only server methods/test. References searched in src/test: only deleted adapters/tests call these methods; compatible after removal, no surviving caller. Normal session APIs and sessionPanels/PANELS_KEY are unrelated and retained.
- Archive the client protocol with an explicit retired header; remove README guidance and adjust historical links to archive. No on-disk credentials, cursors or private retry files are modified.
- Apply the old Harness JPEG patch onto the exact new upstream tag; resolve bilingual document pairing metadata, test real image encoding and recorded image tool behavior, build and push normally with required hooks.
- Replace version/tag/upstream revision/patch branch/revision and matching install/version test expectations. Consumers are extension selection, Doctor, installService, update notices and dictation availability; all continue using the same constants/signatures. Keep older-version comparison cases in tests as older releases. No external RPC schema changed by our patch.
- Build DSHmux0.4.15 cleanly; run its suite and a real isolated new-Harness server/session/webview smoke. Verify archive contains no PAN or libsodium and the exact patch SHA.

## Traceability
| Requirement | Task | Verification |
|---|---|---|
| R1,R4 | T1 remove PAN | No active references/dependencies; full extension suite; archive inspection |
| R2 | T2 patched Harness | Focused image/snapshot checks, docs, full build, pre-push hook, remote exact SHA |
| R3 | T3 pin/update/integrate | Install/version tests, real startup/session/webview smoke, VSIX inspection |
| All | T4 close-out/publish | Requirement audit, clean task branches, remote ref equality |

### T1 — Remove PAN runtime and current guidance
Status: ✅
Files: src/extension.ts, src/serverManager.ts, pan modules/tests, package*.json, README en/zh, archived protocol and historical links.
Completion: ordinary activation/package has no PAN, no surviving removed-method callers; user state untouched.

### T2 — Port and publish patched Harness
Status: ✅
Worktree: deepseek-harness/.worktrees/deepseek-harness/dsh-patches-0.2.0-rc.2; branch matik/dsh-patches-0.2.0-rc.2. Request-image source/tests, paired README/note, relevant upgrade guide if required.
Completion: JPEG/no-alpha encoding for transformed/provider WebP requests, real PNG/JPEG passthrough; checks pass and fork SHA confirmed.

### T3 — Upgrade DSHmux and exercise real integration
Status: ✅
Files: versionCheck.ts, dshInstallService.ts, i18nStrings.ts, install/version tests, manifests, README/CHANGELOG en/zh.
Completion: pinned revision equals remote patch branch, tested runtime0.2.0-rc.2, package0.4.15 excludes PAN.

### T4 — Record results and publish task branch
Status: ⏳
Files: this plan/verification.md. Completion: checks/gaps recorded; DSHmux branch pushed; no uncommitted task work.

## Progress audit

The five PAN adapters/helpers, their tests, three settings, crypto dependency and PAN-only manager APIs are removed. Normal chat/sessionPanels and existing user state remain untouched. Historical protocol is retired under doc/archive. Harness JPEG patch is published at dbe724e7dbe44ed5551c2f674f12b85b86558548, exactly one patch commit over the selected upstream tag. DSHmux pins that revision and declares0.2.0-rc.2 tested after real RPC/webview checks. Tests/package pass; branch publication remains T4.
