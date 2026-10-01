# Readable question context — Verification

**Date**: 2026-10-01

## Coverage
R1/T1: DSH manager.describeQuestionSession reads existing session.list RPC and exact sessionId, including other-workspace rows. Bridge.handle resolves metadata before first encryptedBody call; project basename and trimmed title are capped200. Unknown IDs and lookup errors omit context. Existing spool bypasses metadata/encryption rewrite; answer routing uses original IDs, unchanged.
R2/T1/T2: optional context lives only in plaintext before crypto_box encryption. Encrypted bridge test opens real ciphertext and verifies names, while posted public body has no context/name/path. PAN decryptQuestion validates optional object/nonempty bounded strings after bound metadata authentication; context-free v1 remains accepted.
R3/T2: questions.js renderQuestion calls questionLabels for project/chat, uses textContent and places routing IDs in collapsed details. Refresh retains existing forms; no HTML interpolation from names.
R4/T3: compiled/package installed DSHmux0.4.9 locally via VS Code CLI; installed panQuestionBridge.js and serverManager.js exactly match build (cmp). Before installation diff confirmed only these two compiled modules/maps differed from installed baseline; previous out archive /tmp/dshmux-before-question-context-out.tar.gz retained. Pi web/static updated, workers unchanged because no worker changes. .env.before-question-context-20261001 preserves previous image selection; no DB/schema/token/key changes.

## Checks and results
V1: npm build + node --test test/panQuestionBridge.test.js test/serverManager.test.js54/54 passed. Covers actual websocket question→encrypted PAN body→answer→DSH result→ACK, desktop cancellation, unsupported question fallback, names/unchanged routing, lookup failure, immutable spool and exact session lookup including unnamed/unknown session.
V2: npm build:key-vault passed; npm test:key-vault8/8 passed, including real crypto old/new context, malformed names, labels and live refresh/draft preservation. Both worktrees git diff --check passed.
V3: VSIX packaged95files with sodium/ws runtime dependencies and successfully installed. Pi image pan:question-context-20261001; all5 long-running services healthy. Authenticated production Client GET home/questions/monitor200; public/local readiness ok. New questions bundle URL /static/pan/questions.bundle.5340644a6dbc.js exercises new version through manifest. Diagnostic Client only created/deleted its own session.

## Gaps and limits
Real renamed-chat/context display after VS Code reload needs user device acceptance. No artificial production question/push sent. Prior encrypted questions cannot acquire absent names retroactively. Unknown child agents lack an exact session.list match and deliberately display missing metadata; no false attribution. Server fleet monitor continues to show its existing permitted metadata because new names are E2E-encrypted; readable names are available on decrypted question cards.

## Summary
Readable project/chat labels replace opaque IDs in question header; old ciphertext and answer contracts are compatible. Pi deployed and extension installed; user reloads VS Code and PAN once, then asks a new question. No credentials rotated.

## Outstanding work
No outstanding implementation tasks; actual device/new-question acceptance remains the stated verification limit.
