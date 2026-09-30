# PAN lifecycle adapter — Implementation Plan

**Date**: 2026-09-30  
**Sources**: [discussion.md](discussion.md), [req.md](req.md), [solution.md](solution.md)

| Requirement | Task | Verification |
|---|---|---|
| R1, R2 | T1 observer and event filter | Closed-webview observer test |
| R3 | T2 token-file setting | Missing/unsafe token test |
| R4, R5 | T3 reconnect, cursor and retry | Reconnect and idempotency test |

T1 → T2 → T3

### T1 — Observe sessions

- [x] ✅ Add `src/panLifecycle.ts` and call it from `src/extension.ts` on DSH ready. Consume only `turn/end` from `session/follow`.

**Completion criteria**: An event is sent with only session ID and neutral metadata.

### T2 — Configure secret

- [x] ✅ Add `dshmux.panTokenFile` to `package.json`. Require 0600 token file; default disabled.

**Completion criteria**: No token appears in config, event body or logs.

### T3 — Recover

- [x] ✅ Persist last accepted sequence and retry after transient failure; test reconnection.

**Completion criteria**: A repeated delivery uses the same event ID and body.

*Related documents: discussion.md | req.md | solution.md*
