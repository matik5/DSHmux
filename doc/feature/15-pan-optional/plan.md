# Optional PAN integration — Implementation Plan

**Date**: 2026-10-01
**Sources**: [discussion.md](discussion.md), [req.md](req.md), [solution.md](solution.md), [Lifecycle](../10-pan-lifecycle/verification.md), [Mailbox](../14-pan-mailbox/verification.md)

## Goal and requirements
- R1: PAN is explicitly optional and disabled by default, even with existing credential paths. Ordinary DSH chat remains available.
- R2: Enable/disable takes effect on a running DSH without a restart; stopped DSH and disabled PAN do not start PAN observers. Disabling closes subscriptions and prevents subsequent delivery from stopped instances; requests already sent may finish.
- R3: Document only the DSHmux client protocol and configuration, including outgoing questions, incoming answers, validation, ACK, cancellation, encryption, retries and limitations. PAN service/UI development and deployment are outside scope.

- R4: Public PAN documentation contains only example.com endpoint examples, with no actual private service URLs.

## Facts and gap
`src/extension.ts:40–56` constructs both adapters and starts them on ready and credential changes; `:145–146` restarts lifecycle on workspace changes. Credentials alone opt in today. `PanLifecycleObserver.start` requires a token and URL; `PanQuestionBridge.start` requires both credential paths and a URL. Both adapters have stop/dispose but queued async work can outlive stop. The README omits the PAN settings and wire protocol. PAN's origin is fixed in both adapters.

## Approach and call-site audit
Add `dshmux.panEnabled=false` and a small controller that constructs adapters only when enabled and DSH is ready. Synchronize from the three audited activation call sites (state, settings, workspace). All are compatible: normal DSH state handling stays intact; settings now intentionally require explicit opt-in. Adapter constructors are also used directly by tests, with no signature changes. Add active guards to queued delivery paths; use fresh adapter instances after reconfiguration so old asynchronous work cannot revive. Existing ciphertext and routing schemas remain unchanged, so external consumers and saved spool files remain compatible. Describe the existing provisional client contract in `doc/pan-protocol.md`, linked from both READMEs. No external PAN implementation is inspected or modified.

## Traceability
| Requirement | Task | Verification |
|---|---|---|
| R1, R2 | T1 controller, settings, activation and stopped-instance guards | V1 controller regression tests; V2 existing adapter tests and complete suite |
| R3, R4 | T2 client protocol and README links | V3 compare documentation with both adapters |
| All | T3 close-out | V4 requirement and call-path audit |

### T1 — Explicit opt-in and lifecycle control
Status: ✅
Files: `package.json`, `package.nls*.json`, `src/extension.ts`, `src/panIntegration.ts`, `src/panLifecycle.ts`, `src/panQuestionBridge.ts`, `test/panIntegration.test.js`.
Completion: disabled/default configuration never constructs adapters, runtime switches dispose/start them, existing PAN round trips pass.

### T2 — Document client-side configuration and protocol
Status: ✅
Files: `README.md`, `README.zh.md`, `doc/pan-protocol.md`, `CHANGELOG*.md`.
Completion: all emitted/consumed messages, authentication, encoding, fallback and retry boundaries described; no PAN-side setup guide.

### T3 — Verify and record result
Status: ✅
Files: this plan and `verification.md`.
Completion: V1–V4 recorded, gaps explicit.

Order: T1 -> T2 -> T3

*Related documents: discussion.md | req.md | solution.md*
