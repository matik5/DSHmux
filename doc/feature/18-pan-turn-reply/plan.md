# PAN turn reply — Implementation Plan

2026-10-02. Sources: PAN doc/feature/09-turn-reply/plan.md and delivered DSH0.4.11 pan-excerpts feature17. User approved DSH native API and implementation; portable user workflow authorization supersedes old documentation approval gates.

R1: encrypted PAN command reaches exact existing workspace session. R2: stable requestId prevents duplicate messages; local receipts survive restart without plaintext. R3: existing questions/quiet lifecycle/excerpts/keys remain compatible; package and installed copy updated.

Facts: PanQuestionBridge owns source private key/cryptoContext and3s tick; ServerManager api retries alternative protocol only404. Lifecycle registers same safe session ID. DSH session-controller commands.ts checks duplicate requestId in queues/history. New reply target uses a source-scoped route with persistent private receiver UUID and exact current workspace session allowlist.

| Requirement | Task | Verification |
|---|---|---|
|R1|T1|Exact session fixture, wrong binding/unknown session rejection|
|R2|T1|Restart/prepared/accepted/lost ACK fixtures, stable requestId|
|R3|T2|Existing npm tests + installed module hashes and controller bridge fixture|

### T1 — Receiver and exact session prompt
✅ src/panQuestionBridge.ts tick/stop; new src/panCommands.ts; src/serverManager.ts sendSessionPrompt. Additive interface, retain key/bridge exports. Claim before send, private metadata receipt without message/ciphertext; exact decrypted binding and expiry validation. V1/V2.

### T2 — Release and installed delivery
✅ version0.4.12, build/test/VSIX, install home Mac, update PAN controller bridge dependency if affected. Preserve configuration/keys/queues; Reload Window required, native phone acceptance remains separate. V3.


## Final audit

0.4.12 VSIX SHA25624121a5272fa3c6c45c7dbf942081900637a46ec2d93e4db4c05e57885e9d69d installed at ~/.vscode/extensions/matik5.dshmux-0.4.12. Compiled module hashes and original settings/token/key digests verified. User must Reload Window; physical phone unsolicited-follow-up acceptance belongs to PAN feature09 T6 and is not claimed by these component fixtures.

Research controller1.2.1 retains exact0.4.11 bridge code in a stable private ~/.local/share/pan/research-controller/bridge-0.4.11/out dependency, so VS Code garbage collection cannot delete it after extension update. Only config.bridge_dir/dependency manifest change; idle controller gracefully restarted, token/key retained. Actual encrypted-question/answer/report fixture passes against old installed0.4.11, new installed0.4.12 and final stable0.4.11. Existing four-argument question bridge callers remain compatible; optional fifth workspace root is only supplied by DSHmux extension.ts:45. No research control route is advertised by the unchanged three-argument controller.
