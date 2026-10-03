# Home chat context

2026-10-03. Authorized by PAN user task; no extra approval gates. Main record: /Users/mati/proj/apps/task_pan_1/doc/fix/home-chat-context/plan.md.

R1 exact session chat/cwd from existing workspace session list, encrypted sealed excerpt only.
R2 retain cursor/silent ACK and persist ciphertext before first send; replay byte-identical across failure/restart.
R3 release0.4.14 and install home extension; keep token/mailbox key/config and question/command semantics.

Facts: panLifecycle observer consumes manager.listWorkspaceSessions, currently discards title/cwd; stable event ID session+seq; server main02582b7 rejects turn_end encrypted_detail until PAN update. PanQuestionBridge/standalone runtime consume separate module and remain unchanged. Existing installed0.4.13 has persistent human questions and exact-session command bridge; preserve all.

T1 ✅ src/panLifecycle.ts/package metadata: metadata map, bootstrap/seal, private durable event body. Verify crypto binding/privacy/no changed retry.
T2 ✅ test/panLifecycle.test.js + npm test, build VSIX, install home0.4.14. Verify installed hashes; active editor requires Reload Window.

T3 ⏳ running editor Reload Window and fresh native turn acceptance (user action requested). No forced restart.
