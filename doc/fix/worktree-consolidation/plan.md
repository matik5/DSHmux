# Worktree consolidation — Implementation Plan

**Date**: 2026-10-13

## Requirements
R1: Commit pending DSHmux worktrees and merge work absent from main without regressing current PAN, patched DSH or release settings.
R2: Remove redundant worktrees only after their tracked/untracked work is preserved; retain any independent temporary repository outside deleted worktrees.
R3: Verify the combined implementation and push main. Preserve unrelated primary-worktree AGENTS.md and untracked chat-history/install drafts.

## Facts and approach
Main b63d282 includes pan-delivery and persistent-questions commits. Voice (66f1722) and Arcade (6e0a29d) have unique history. Web-search has staged design documents. PAN excerpts and turn-reply have uncommitted overlapping implementation; turn-reply includes excerpt files. Pibox-install has uncommitted installation records. Voice tmp/deepseek-harness is an independent clean 1.7GB repository, not a DSHmux source file. Preserve it by moving it to an archive location before ordinary worktree removal.

Commit each pending task in its original worktree with exact staging paths. Merge branches into this integration worktree, resolving settings to retain current PAN and add optional dictation settings; preserve version 0.4.14 and package dependencies. Existing declaration consumers expecting a single configuration object must be updated to handle grouped configuration from voice. PAN bridge changes are additive: keep main's persistent human-question support, insert excerpt and command receiver hooks, retain constructor compatibility for existing four-argument callers. Audit source references and exercise integrated tests. Do not rebuild Whisper or DSH on pibox or deploy new code in this consolidation task.

## Traceability
| Requirement | Task | Verification |
|---|---|---|
| R1 | T1 commit/merge | Branch ancestry, conflict audit, full scoped tests |
| R2 | T2 preserve/remove | Clean statuses, archived auxiliary repo, remaining worktree inventory |
| R3 | T3 close/push | Tests, main remote equality, unrelated-file hashes |

### T1 — Preserve commits and integrate
Status: ✅
Commit web-search docs, excerpts, turn-reply and pibox records; merge with voice and Arcade. Completion: all task branch tips are ancestors of integration; compile/tests preserve all integrated call paths.

### T2 — Remove redundant worktrees
Status: ✅
Move voice tmp repo to a non-worktree archive; remove only clean merged worktrees without force. Completion: no unique work discarded, primary worktree remains.

### T3 — Verify and publish main
Status: ✅
Full scoped test suite, package-content checks and final ancestry/status audit, record verification, merge integration to main and push. Completion: origin/main matches local main and original unrelated files preserved.

## Integration audit

All eight branch tips are ancestors of main. PAN excerpts and turn-reply implementation was already present in later main commits; their merges preserve current code and now retain branch history too. Voice and Arcade add their previously missing implementation. Conflict resolution retains target-view/panel race guards, patched-upgrade labels, singleton VS Code API reuse, current release0.4.14 and all PAN settings. The grouped-configuration contract has one conflicting test consumer (`test/panIntegration.test.js:20`), adapted to find the setting across groups; `test/chatViewLayout.test.js` already handles groups. Runtime readers use VS Code configuration APIs and remain compatible.

Full suite:335 passed,2 skipped,0 failed; compile and package pass. All eight original worktrees removed after clean-status/ancestry checks. Auxiliary checkout and generated VSIX files archived outside the repository. Primary AGENTS.md and existing untracked chat-history/install drafts have identical before/after hashes. Main was pushed and matched origin/main at b28d908; final close-out documentation is committed and pushed afterward.
