# PAN delivery and readiness — Implementation Plan

2026-10-02. Parent plan: /Users/mati/proj/apps/task_pan_1/.worktrees/task_pan_1/workstream-status/doc/feature/07-workstream-status/plan.md. Read that self-contained shared-contract audit/requirements/traceability before changes.

R1 durable ACK and harness-delivery receipt recovery; R2 explicit per-session observed readiness without declaring model progress; R3 versioned0.4.10 VSIX and local installed copy. Existing encrypted question/body/key/context contract stays unchanged. panQuestionBridge deliverAnswer/reconcileSpool need receipt spool; panLifecycle poll/follow need contact, same normalized identity as questionPayload. Unknown installed work/remote copies remain compatible with server, but do not supply new evidence.

T1 ✅ — bridge receipt journal/context registration, replay on tick/reconnect/restart; tests for lost ACK, lost receipt, exact retry, no duplicate harness call. V1 adapter test suite and PAN controller fixture.
T2 ✅ — lifecycle context/contact batching, server-received freshness, no transcript/cwd/title; monotonic observed contact and snapshot-only readiness. V2 observer tests, disabled integration tests.
T3 ✅ — package/version/install local extension and controller dependency, verification.md. V3 compile/test/VSIX/install hash; Reload Window required for existing VS Code process. Tokens/config/queues preserved; no main merge.


Implementation audit: full extension suite272 passed/1 skipped (273 total); final prepared-receipt refinement compiled and focused question/lifecycle10 tests passed, including uncertain checkpoint retention. PAN real-bridge controller fixture passes with0.4.10 modules. Existing installed0.4.9 has no panEnabled setting; local user has token/key configured and no explicit flag. Preserve the authorized running PAN integration by adding explicit panEnabled=true only if absent; do not override an explicit false. Server deploy precedes installed activation. Actual loaded extension-host/native phone test still requires Reload Window.

T4 ⏳ — Native existing extension-host reload + real question/phone reply/continuation and monitor contact/harness evidence. Depends on T3; V4 Developer: Reload Window and device flow. The installed-module controller fixture cannot prove activation in an already-open extension host. User action, not marked done/deferred.

Close-out: final npm test273 total,272 passed/1 Windows-only junction test skipped,0 failed. Source afa8495, version0.4.10 installed; prepared/accepted receipt and60s snapshot readiness connected to real paths. Stable artifact ~/.local/share/pan/client-releases/dshmux-0.4.10.vsix; PAN Pi prerequisite0017/0018 image pan:workstream-status-5b5939926287. Installed Mac controller1.2.0 imports0.4.10 and is restarted/ready. Local PAN flag migration preserved all existing values; identities and receipt/spool paths retained. T4 remains pending; no main merge. [Verification](verification.md).
