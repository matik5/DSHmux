# PAN encrypted question bridge — Implementation Plan

**Date**: 2026-09-30  
**Sources**: [discussion.md](discussion.md), [req.md](req.md), [solution.md](solution.md)

| Requirement | Task | Verification |
|---|---|---|
| R1, R3, R6 | T1 encrypted forwarding | Fake DSH/PAN cryptographic round trip |
| R2 | T2 answer delivery | DSH result and PAN ack assertions |
| R4 | T3 cancellation/retry | Desktop cancellation and stable request ID tests |
| R5 | T4 fallback | Unsupported shape returns `next` |

T1 → T2 → T3 → T4 → deployment/real-device check

### T1 — Forward encrypted question

- [x] ✅ Add `src/panQuestionBridge.ts` and wire it from `src/extension.ts`; add `dshmux.panMailboxKeyFile` to `package.json`. Use libsodium `crypto_box_easy`, with 0600 local key and encrypted retry body.

**Completion criteria**: A supported question reaches PAN without plaintext in PAN logs or settings.

### T2 — Resume agent

- [x] ✅ Poll encrypted PAN responses; verify routing metadata and send structured answer to DSH `$events/result`; ack afterward.

**Completion criteria**: Test shows the original DSH event ID receives the selected label.

### T3 — Handle other resolution and retries

- [x] ✅ Keep deterministic request ID and exact encrypted body on retry; cancel PAN on DSH `cancel`; reconcile stale encrypted spool entries after reconnect. PAN cancellation endpoint lives in the PAN repository.

**Completion criteria**: Desktop settlement closes the PAN question and retry cannot duplicate it.

### T4 — Unsupported shapes

- [x] ✅ Delegate multi-question and multi-select frames to DSH with `next`.

**Completion criteria**: No unsupported answer is flattened into one PAN choice.

### T5 — Real device acceptance

- [ ] ⏭️ After the owner creates the viewer vault, ask a live DSH question, answer on iPhone, and verify ACKED in PAN monitor. The viewer vault is not initialized yet; the adapter is installed but deliberately delegates to the desktop until it exists.

**Completion criteria**: One live DSH turn resumes from an iPhone answer; no duplicate attention remains.

*Related documents: discussion.md | req.md | solution.md*
