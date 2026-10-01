# Optional PAN — verification

**Date**: 2026-10-01

## Coverage
- R1 / T1 / V1: `package.json` declares `dshmux.panEnabled=false`. `extension.ts:42–58` passes that setting and live DSH state to `PanIntegration.sync`; disabled/stopped windows do not construct either adapter. Controller regression tests exercise the default, enabling, reconfiguration/workspace change, disabling, stopping and disposal.
- R2 / T1 / V2: activation state, settings (including compatible legacy setting names), workspace and extension-disposal paths all use the controller. Reconfiguration disposes old instances and creates fresh ones. Lifecycle queued delivery checks `active`; mailbox PAN/DSH submissions and post-bootstrap/post-metadata continuations refuse stopped instances. Tests exercise stopped lifecycle queue and disabling during in-flight bootstrap. Existing encrypted round trip, cancellation, fallback and context tests still pass.
- R3 / T2 / V3: `doc/pan-protocol.md` audited against both adapters: endpoint/method/body/receipt fields; deterministic identity; encryption and base64 variant; DSH result mapping; ACK ordering; cancellation, spool, retry and restart limitations. Both README links and settings descriptions lead to this opt-in feature. No PAN counterpart implementation or deployment documentation was added.
- R4 / T2 / V3: Endpoint examples use `https://pan.example.com`; README and protocol document contain no actual PAN service origin.
- T3 / V4: R1–R4 map to called activation paths and checked artifacts; all tasks complete.

## Checks and results
- `npm run compile`: pass.
- `node --test test/panIntegration.test.js test/panLifecycle.test.js test/panQuestionBridge.test.js`: 10 passed.
- `npm test`: 270 passed, 1 skipped, 0 failed (271 total).
- `git diff --check`: pass.
- V3 protocol/source comparison and README links: pass by inspection.

## Gaps and limits
No unmet scoped criteria. Live acceptance with PAN's developing counterpart and real VS Code configuration switching were not exercised; automated checks exercise the controller and adapter paths with simulated transports. The document explicitly describes that limitation. Windows secret-file ACL behavior remains unverified and is documented. Already submitted HTTP requests may finish when disabled; no subsequent PAN/DSH submission occurs from stopped instances. No new VSIX was built or installed in this round.

## Summary
PAN is optional under an explicit default-off setting; existing credential paths do not turn it on. Runtime changes stop/restart its adapters without a DSH restart. The provisional DSHmux client protocol is documented independently of the developing PAN counterpart.

## Outstanding work
No outstanding tasks.
