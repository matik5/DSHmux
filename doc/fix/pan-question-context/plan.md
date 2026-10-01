# Readable question context — Implementation Plan

**Date**: 2026-10-01

## Requirements
R1: each new DSH question carries the exact originating chat title and project name when available; never guess another session's title. Show missing names explicitly.
R2: names remain inside encrypted question body; server/push do not receive plaintext chat titles, paths or prompt. Keep routing IDs stable.
R3: question UI prioritizes readable context, hides IDs in expandable technical details, and accepts old version1 questions without context.
R4: retain live refresh/drafts, answer routing, spool retry and existing keys. Deploy Pi and build/install DSH extension; reload VS Code belongs to user.

## Facts and gap
PAN `frontend/questions.js:renderQuestion` shows source_name/workstream_id/run_id; `mailbox_crypto.js:decryptQuestion` validates bound v1 envelope and choices but lacks display-context validation. DSH `src/panQuestionBridge.ts:questionPayload` knows agentId and question fields; both encryptedBody and deliverAnswer call it. Existing spool file takes precedence over new encryption. `serverManager.listWorkspaceSessions` projects session.list rows with cwd and projections.values.title, but is restricted to a workspace. Harness session-controller maps session IDs to agents (index api-session/status, agent resumeSessionId). Exact session.list matching is appropriate; unknown/subagent IDs must not pick the first chat or active editor.

## Approach and shared-contract audit
Optional encrypted v1 `context` object with optional nonempty <=200-character `project_name`/`chat_name`. No public API/schema change. DSH exact session lookup (existing bounded/read-only RPC) snapshots names before first encryption; lookup failure continues question without display context. Project basename only; no full filesystem path transmitted. UI uses textContent. Existing IDs/nonce/ciphertext/routing remain unchanged; existing ciphertext/spool not rewritten.
Compatible callers: DSH encryptedBody and deliverAnswer call questionPayload; optional third argument changes only first-encryption display data, not IDs. Existing DSH tests call 2 args. PAN questions.js consumes decryptQuestion; optional validator accepts old context-free messages. CLI/test producers retain v1 bodies without context. Answer encrypt/decrypt unaffected. Live refresh preserves existing cards and their snapshot.

| Requirement | Task | Verification |
|---|---|---|
| R1,R2,R4 | T1 | V1 DSH exact-session lookup, encrypted bridge tests, lookup failure/legacy/spool checks |
| R2,R3,R4 | T2 | V2 real encryption optional-context validation + UI readable/fallback tests + refresh tests |
| R4 | T3 | V3 build/install extension, Pi health and authenticated pages, no rotation |

### T1 — Producer context
Status: ✅. DSH worktree /Users/mati/.worktrees/DSHmux/pan-question-context, src/serverManager.ts, src/panQuestionBridge.ts and test files. Add read-only exact session description, optional encrypted context and handle wiring. Verify label snapshot is encrypted, not public metadata, and IDs unchanged.
### T2 — Viewer context
Status: ✅. frontend/mailbox_crypto.js, questions.js, question_context.js; tests; static bundle. Validate optional context and render labels above prompt; IDs in details. Verify old questions and escaped text handling.
### T3 — Deploy and verify
Status: ✅. Rebuild PAN image from this worktree (includes prior fix/question-live commit5c57927). Install updated DSH extension via existing packaging workflow. Preserve user keys and settings. Verify Pi response200 and static update; user reload/retry confirms real names.
