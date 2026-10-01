# PAN delivery and readiness — Verification

2026-10-02. [Plan](plan.md). Source commit afa8495 on feat/pan-delivery; unmerged. Parent PAN feature07-workstream-status contains full server/caller audit and deployment evidence.

## Coverage

- **R1/T1 ✅:** PanQuestionBridge context declaration precedes question creation; deliverAnswer persists prepared checkpoint before result-RPC, marks accepted after successful harness response. drainReceipts, restart/reconnect and tick retry exact ACK/evidence without resubmitting accepted result. reconcileSpool preserves uncertain prepared entries instead of falsely ACKing/cancelling them. Actual bridge fixtures exercise encrypted payload routing, lost ACK/evidence, accepted restart and unresolved external outcome.
- **R2/T2 ✅:** PanLifecycle successful workspace/session follow snapshot supplies60s contact batch up to20 sessions. Host-reported readiness tied to open socket/follow, never inferred from turn_end/registry. Context uses same normalized identity as question bridge. Contact payload includes only IDs/bool/time, no cwd/title/transcript. Disabled integration regressions covered.
- **R3/T3 ✅,T4 ⏳:** version0.4.10 built/installed to local Mac with server prerequisite already deployed; installed bridge/lifecycle modules match compile. Controller1.2.0 imports installed bridge and passes subprocess fixture. Existing native extension host remains pending reload; cannot infer it loaded new code from successful CLI installation.

## Checks and results

- Final npm test (tsc + node --test): **273 total,272 passed,1 skipped,0 failed**, /tmp/pan-dsh-delivery-final-test.log. Skipped existing Windows-only junction ESM repair on macOS. Focused10 bridge/lifecycle cases passed as well.
- PAN_TEST_DSH_BRIDGE=/Users/mati/.vscode/extensions/matik5.dshmux-0.4.10/out node --test tests/controller_flow.test.js from PAN feature worktree: **1 passed,0 skipped**. Actual installed module/controller path with fake harness and encrypted viewer reply, one model-prompt fixture, ACK/delivery receipt and identical progress/report503/429 retry. Native model/phone not exercised.
- Artifact ~/.local/share/pan/client-releases/dshmux-0.4.10.vsix SHA25649937153072d671dd8fd802b810f8dc8a5b23b7c8e550a686db60d94c4373454. VS Code CLI installation succeeded; package.json0.4.10 and installed panQuestionBridge.js/panLifecycle.js hashes match source. All95 installed archive files checked:94 byte-identical; package.json only adds VS Code __metadata, release fields unchanged. Old0.4.9 folder retained.
- Existing installed0.4.9 had implicit PAN enable and configured token/key, user JSONC flag absent; set panEnabled=true to retain authorized integration with newer opt-in behavior. AST-verified other settings unchanged; explicit false would not be overwritten. Existing token/key hash checkpoints all unchanged. No identity generated/rotated during update; private receipt/question paths retained.
- Server prerequisite pan:workstream-status-5b5939926287 migrations0017/0018 deployed/healthy before client install. Mac research-controller1.2.0 source/manifest match, owned LaunchAgent restarted ready; only bridge_dir config changed to installed0.4.10/out, state/model/profile retained. Existing sources/Copilot/Codex payloads compatible.
- Before/after Mac configuration/keys/state/controller CMS archives on NAS /volume1/docker/pan/backups/pan-mac-{before,after}-workstream-status-20261002.tar.cms, hashes verified. Recovery private key not read/copied, no decrypt/restore drill.

## Gaps

- **T4 required:** Developer: Reload Window in local VS Code; native real question→phone answer→DSH continuation and matching monitor harness receipt/contact. Installation/subprocess fixture does not prove the loaded native host. Native acceptance pending, no success claim.
- A prepared receipt with lost external result is uncertain and retained for reconciliation. Accepted receipts retry safely; no distributed exactly-once claim and no response-bound resumed proof emitted by DSH. No other remote/work client installation assumed.

## Summary

DSH0.4.10 implements/ships durable handover and observed readiness, tested with actual installed modules and preserved identities. Current native session activation/phone acceptance still requires T4. Both feature branches unmerged.

## Outstanding work

- **T4 ⏳:** existing extension-host Reload Window and native phone question/handover/contact acceptance; user action required. T1–T3 implementation/delivery verified.
