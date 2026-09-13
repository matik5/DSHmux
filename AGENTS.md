# AGENTS.md — Feature Pipeline (portable template)

> **How to use**: copy this file to the root of a new project as `AGENTS.md` (or `CLAUDE.md`, or a section of one). No other template files are needed: the per-feature directory `doc/feature/{NN-name}/` is created on demand, following the rules below.

## Documentation SOP

### Directory Convention

- **Feature pipeline**: Follow `discussion → req → solution → plan → verification → summary + TODO` in `doc/feature/{NN-name}/`. Feature directories use a two-digit numeric prefix as an index, such as `00-my-feature` or `01-xxx`; each new feature takes the next number.
- **Architecture documents**: Put cross-project architecture and proposal documents in `doc/architecture/`, not `doc/feature/`. The Feature Pipeline is reserved for requirements-driven feature work.
- **Bugfix pipeline**: Record complex fixes in `doc/fix/{name}/`; simple fixes go only in the Daily Summary.
- **Consistency**: At the user's request, update `doc/daily/YYYYMMDD.md` at the end of a task series.

### Feature Pipeline (MANDATORY)

```
discussion.md → req.md → solution.md → plan.md → (implementation) → verification.md → plan.md review → summary.md + TODO.md
```

| Stage | Gate | Purpose |
|---|---|---|
| `discussion.md` | — | Raw record of brainstorming, meetings, and code-audit facts. Once `req.md` exists, `discussion.md` is READ-ONLY as a requirement source. Put new requirements directly into `req.md`. |
| `req.md` | **User must approve** | Defines what to do: requirements and acceptance criteria, without implementation details. |
| `solution.md` | **User must approve** | Defines how to do it: architecture, file-change list, and data contracts. If new requirements emerge while writing the solution, add them to `req.md` first; do NOT expand scope silently. |
| `plan.md` | **User must approve** | Contains the RTTM (requirement-to-task traceability matrix) and task checklist. Mark each task `✅`, `❌`, or `⏭️`. |
| *(implementation)* | **Automatic** | Write code. After every two or three completed tasks, perform a lightweight audit against `req.md` and note any gaps. |
| `verification.md` | **Automatic** | Close-out audit. It must: (a) recheck requirement-to-plan coverage via the RTTM, (b) confirm for each `✅` item that code exists AND is called rather than dead, and (c) list every gap with severity and a suggested action. |
| `plan.md` review | **Automatic** | Update task states from the verification results. |
| `summary.md` | **Automatic** | Record the result: what was completed and what changed. |
| `TODO.md` | **Automatic** | Mechanically extract the `❌` and `⏭️` items from `plan.md`. Manual authoring is FORBIDDEN. |

#### Plan Item States

- `✅` done — implemented and verified
- `❌` not done — attempted but blocked, with the blocker recorded
- `⏭️` skipped — explicitly deferred for this round, with the decision recorded
- `⏳` pending — not started or in progress; describe partial progress when useful

Both `❌` and `⏭️` flow into `TODO.md`. Items marked `❌` are likely to be queued directly for the next round; items marked `⏭️` are re-evaluated.

#### TODO.md

- A non-empty `TODO.md` means the feature is NOT complete. This is a factual signal.
- With no `❌`/`⏭️` items, `TODO.md` states `No outstanding tasks.` — that state means the round is closed, not that the project is finished.
- A human reviews `TODO.md` and decides whether to close the feature, defer it to the next round, or abandon it.

#### plan.md Format (MANDATORY)

The plan must be self-contained; its executor should NOT need to reread `solution.md`.

| Section | Rule |
|---|---|
| Title | `# <Name> — Implementation Plan` |
| Header | `**Date**: YYYY-MM-DD` + `**Sources**: [discussion.md](...), [req.md](...), [solution.md](...)` |
| RTTM | `\| Requirement \| Task \| Verification \|` |
| Tasks | `### T# — Description`, including file paths, line numbers, `- [ ]` subtasks, a code snippet, and `**Completion criteria**: ...` |
| Status | `✅` done / `❌` blocked / `⏭️` skipped / `⏳` pending |
| Order | ASCII dependency graph |
| Footer | `*Related documents: discussion.md \| req.md \| solution.md*` |

### Solution Document Structure (MANDATORY)

Before writing any solution document (`doc/fix/{name}/solution.md` or `doc/feature/{name}/solution.md`), use this structure and base it on **code facts, not assumptions**:

1. **Goal** — target architecture or desired behavior from the proposal
2. **Facts** — audit the actual code to confirm the current state:
   - Read every relevant source file and list supported types, methods, and paths.
   - Never assume "the code should support X"; verify that it does.
   - **Impact breadth**: When the root cause is a shared-component failure, such as authentication expiry, an HTTP timeout, null credentials, or session invalidation, search EVERY page and flow that depends on that component. The fix must cover the full blast radius, not only the page that reported the bug. List affected callers explicitly under Facts.
3. **Gap** — the difference between Goal and Facts; this IS the problem to solve
4. **Call-site audit** — CONDITIONALLY REQUIRED when any task changes a shared function's contract, including new exceptions, changed return semantics, or new preconditions:
   - Search every reference to the function being modified and list each call site with its file path and line number.
   - Classify each call site as **compatible** (the new behavior is correct for this caller) or **conflict** (the caller depends on old behavior and will break).
   - If any call site is a conflict, redesign the solution before writing Tasks. Do not proceed with a design that breaks known callers.
5. **Tasks** — concrete code changes that close the gap, with exact file paths and line ranges

**Rule**: Every "change to xxx" statement in a solution MUST be supported by a code fact verified in step 2. No fact check means no solution.

## Git Worktrees

Use a dedicated Git worktree for non-trivial changes such as features, bug fixes, refactors, and experiments.

Create worktrees under:

```text
~/.worktrees/<repository-name>/<task-name>
```

Do not create worktrees inside the repository directory.

Example:

```bash
git worktree add ~/.worktrees/<repo>/<task> -b <branch-name>
cd ~/.worktrees/<repo>/<task>
```

Rules:

- Use one worktree per independent task.
- Keep the primary worktree clean when practical.
- Make task-related edits and commits inside the task worktree.
- Do not switch the primary worktree to another branch just to perform a task.
- Do not merge into `main` / `master` unless explicitly requested.
- Do not delete worktrees or branches containing uncommitted or unmerged work.
- Avoid destructive commands such as `git reset --hard`, `git branch -D`, or `git worktree remove --force` unless explicitly authorized.

A separate worktree is not required for read-only investigation or very small changes explicitly requested in the current working tree.
