# PAN question excerpts — Implementation Plan
2026-10-02. User authorized implementation; PAN master plan: /Users/mati/proj/apps/task_pan_1/.worktrees/task_pan_1/notification-excerpts/doc/feature/08-notification-excerpts/plan.md.

R1: Exact asking session, last visible assistant text,500 Unicode characters, no reasoning/tool results, inside existing encrypted question only. R2: Optional failures keep questions/answers/ACK and silent lifecycle working. R3: Deliver0.4.11 installed VSIX and controller bridge dependency preserving credentials/queues.

Facts: PanQuestionBridge.questionPayload/encryptedBody/handle creates Box plaintext and journals ciphertext. DshServerManager.describeQuestionSession reads exact session metadata. Native session/follow snapshots expose event records assistant/message:data.message.content. All callers: extension.ts creates DshServerManager (compatible added method); PAN scripts/fleet/controller.mjs plain bridgeManager wrapper (conflict, delegate method); test/panQuestionBridge.test.js mocks (compatible optional method plus exercised fixture). panLifecycle quietTurnEvent unchanged. No wire/schema changes except optional encrypted plaintext excerpt; old decryptors ignore it.

| Requirement | Task | Verification |
|---|---|---|
| R1,R2 | T1 new panExcerpt, manager/bridge integration | Snapshot/socket/current-turn/security and bridge encrypted response tests |
| R3 | T2 version/artifact/install/controller | Package/hashes and installed bridge fixture |

### T1 — Capture and encrypted delivery
✅ One-shot exact-session socket,20 messages/1MiB/1.2s limit, visible text only/current turn. No saved retry regenerated. Consumer PAN decryptQuestion validates optional500chars and renders text. npm test.

### T2 — Delivery
✅ Build0.4.11 VSIX, update authorized Mac extension and controller bridge path; preserve keys, token, queues. Reload Window required for extension-host load; native phone test separate.
