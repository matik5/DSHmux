# CLAUDE.md

## Vibe Coding: Eight Honors and Eight Shames

Treat guessing interfaces as a disgrace; treat consulting documentation as an honor.
Treat starting with vague requirements as a disgrace; treat aligning on requirements as an honor.
Treat inventing business rules as a disgrace; treat asking for clarification as an honor.
Treat adding redundant code as a disgrace; treat reusing existing code as an honor.
Treat skipping validation as a disgrace; treat thorough testing as an honor.
Treat careless architectural changes as a disgrace; treat following established conventions as an honor.
Treat pretending to understand as a disgrace; treat admitting uncertainty as an honor.
Treat sweeping, indiscriminate changes as a disgrace; treat incremental iteration as an honor.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Project overview** (2026-08-17):
> - Product: **DSHmux**, a VS Code extension that starts DeepSeek Harness (DSH) and embeds its Web UI in the IDE. It also supports Antigravity, a VS Code fork distributed through Open VSX.
> - Stack: **Node.js + TypeScript** using the VS Code Extension API, npm for dependency management, vsce for packaging, and git for version control. Repository: `matik5/DSHmux`; publisher: `matik5`.
> - Architecture: a transport bridge loads the DSH frontend directly into a webview document and forwards fetch, WebSocket, and clipboard operations through `postMessage` to the Node extension host. See `doc/feature/00-dsh-vscode/solution.md`.
> - Current phase: MVP implementation following T1–T12 in `doc/feature/00-dsh-vscode/plan.md`.

## 0. Thinking Discipline (MUST READ FIRST)

> "The models make wrong assumptions on your behalf and just run along with them without checking. They don't manage their confusion, don't seek clarifications, don't surface inconsistencies, don't present tradeoffs, don't push back when they should." — Andrej Karpathy

**Before answering any question about the codebase, ask yourself: "Did I read the code, or am I guessing?"** If you have not read the relevant source file, DO NOT ANSWER. Run a search and read the code first. Naming conventions, prior experience, and "this is how it usually works" are NOT valid sources.

- **Manage confusion**: When something looks inconsistent or unclear, STOP. Name what is confusing and ask. Do not silently choose an interpretation and proceed.
- **Push back**: If a simpler approach exists, say so. If the user's request contains scope creep, flag it. If a proposed change has hidden risks, surface them. Do not be a passive executor.
- **Present tradeoffs**: When multiple valid approaches exist, lay out the options before choosing one. Let the user decide.

## 1. Communication and Language

- **User correspondence**: ALWAYS respond to the user in **English**.
- **Documentation**: Project-wide documentation must be written in **English**. Intentionally localized user-facing variants such as `README.zh.md` are the only exception.
- **Technical content**: Code identifiers, comments, and git commit messages must be in **English**.
- **Transparency**: For complex refactoring or destructive actions, describe the plan in `Thought` and obtain approval first.

## 2. Risk, Production Safety, and Code Quality

- **Quality first**: Do not rush. If unsure about the quality of the code, ask for clarification.
- **Simplicity first**: Write the minimum code that solves the problem. Add no features beyond what was requested, no abstractions for single-use code, and no unrequested "flexibility" or "configurability." If 200 lines could be 50, rewrite them. Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.
- **Surgical changes**: Touch only what you must. Do not "improve" adjacent code, comments, or formatting. Do not refactor things that are not broken. Match the existing style. If you notice unrelated dead code, mention it rather than deleting it. Every changed line should trace directly to the user's request. Remove only imports or variables that YOUR changes made unused.
- **Code review**: After any code change, always check bracket balance and syntax. If TypeScript changed, run `npm run compile` with strict tsc and fix **ALL** issues, including informational issues. If plain JavaScript changed, run `node --check <file>`. The target is zero issues.
- **Deferral requires proof**: Every deferred issue MUST cite a concrete blocker, such as an unavailable API, a required cross-module migration plan, or a Phase 2 feature gate that is not yet open. Severity (P1/P2), frequency ("low risk"), and effort ("too large") are NOT valid reasons to defer; do not allow small issues to accumulate into technical debt.
- **Partial formatting**: ONLY format new or modified code. Global reformatting is FORBIDDEN.
- **Environment isolation**: Do not run `make`, real-device tests, or deployment scripts without permission. The user approved this repository's `Makefile` targets (`compile`, `test`, `package`, `publish`, and related targets) on 2026-08-17. Publishing targets read tokens from environment variables (`OVSX_TOKEN` and `VSCE_PAT`); tokens must never enter the repository. Publishing to the VS Code Marketplace or Open VSX requires explicit user confirmation.
- **Side effects**: Before operations with external side effects, such as API calls, spawning `dsh` servers, or running npm install, notify the user of the risk in `Thought`.
- **DSH runtime constraints**: The extension may proxy requests only to `127.0.0.1` or `localhost`. It must not weaken DSH's `/api` trust fence. Never run `dsh web` with `--host 0.0.0.0`. See S2/F2 in `doc/feature/00-dsh-vscode/spike-notes.md`.

## 3. Pre-edit Check (Adaptive Gate)

**Before invoking ANY write or modify tool, conduct a scope assessment:**

- **Micro-edit** (typo fix or single-line CSS/comment): Output a brief `[Pre-edit OK] Scope trivial.`
- **Standard edit** (logic change, refactoring, or multiline change): **MUST** output the full checklist. Show only the plan/checklist; do not output proposed code in the chat.
  1. **Bracket balance**: Are all `{}` `[]` `()` pairs symmetric for this edit?
  2. **Symbol dependencies**: Will any deleted or renamed symbols break other files?
  3. **Validation plan**: Which analysis or test command will run immediately after the edit? (`npm run compile`, `node --check`, or `npm test`)
  4. **Path safety**: Is the operation restricted to the target directory?
  5. **Contract change**: Does the edit change a function's contract, including thrown exceptions, return semantics, preconditions, or side effects? If yes, search all call sites and verify that every caller is compatible with the new behavior **before** editing.
  6. **Language switch**: If switching to a different language, verify every construct against the new language (TypeScript versus JavaScript versus webview-injected JavaScript). Do not carry assumptions over from the previous language.

## 4. Task Splitting and Flow Control

- **Splitting threshold**: If a task involves **three or more files** OR **more than 50 lines of code changes**, generate a `Subtasks` list first.
- **Single responsibility**: Each subtask must focus on one file or one cohesive logic group.
- **Zero-defect gate**: If `npm run compile`, `node --check`, or lint reports errors, the task is "Blocked" until every error is fixed.
- **MVP cadence**: Follow T1–T12 in `doc/feature/00-dsh-vscode/plan.md` strictly. After every two or three tasks, audit progress against `req.md`. Do not implement features that are absent from the plan as incidental work.

## 5. Version Control — Git (Zero Global Commit Policy)

**This repository uses git. To avoid contaminating the working tree, use an explicit-path commit workflow:**

1. **Status review**: When asked to commit, first run `git status` and list every change.
2. **Batch plan (explicit only)**: Before committing, provide a **Batch Plan** for review containing:
   - The explicit full path of every file to commit. Wildcards such as `git add .` and `git add *` are forbidden.
   - The proposed **Commit Message**, written in English and following Conventional Commits. It may include a plan task number, for example: `feat(server): spawn dsh web with OS-assigned port (T2)`.
3. **Execution lock**: Wait for explicit user confirmation such as "Go" before running `git commit`. Committing without confirmation is FORBIDDEN.
4. **Push policy**: `git push` also requires explicit confirmation because pushing to a public repository is publication.
5. **No automatic footer**: Do not append `Co-Authored-By` or any generated footer to a commit message. Use only the message approved by the user.
6. **Required `.gitignore` coverage**: `node_modules/`, `out/`, `*.vsix`, `.spike-dsh-home/`, `spike/` (one-time verification code removed after the MVP), `.DS_Store`, and similar generated files.

## 6. Documentation SOP

### Directory Convention

- **Feature pipeline**: Follow `discussion → req → solution → plan → verification → summary + TODO` in `doc/feature/{NN-name}/`. Feature directories use a two-digit numeric prefix as an index, such as `00-dsh-vscode` or `01-xxx`; each new feature takes the next number.
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

Both `❌` and `⏭️` flow into `TODO.md`. Items marked `❌` are likely to be queued directly for the next round; items marked `⏭️` are re-evaluated.

#### TODO.md

- A non-empty `TODO.md` means the feature is NOT complete. This is a factual signal.
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

## 7. Execution Environment and Tooling

- **Runtime**: Node.js 20 or later (development environment: v24); npm 11.
- **Language and compilation**: TypeScript with strict `tsc` and `outDir: out`. Webview injection uses plain JavaScript in `media/bridge-client.js`, which does not pass through tsc and must be checked with `node --check` after changes.
- **Build**: `npm run compile` for tsc, `npm run watch` for development, and `npm run package` for `vsce package`, which produces a VSIX.
- **Tests**: Built-in `node:test` and `node:assert` with zero test-only dependencies. Test files live in `test/`; `npm test` runs the complete suite.
- **Packaging and publishing**: Use `@vscode/vsce`. Publish to both Microsoft Marketplace and Open VSX for Antigravity compatibility. Publishing requires explicit user confirmation under Sections 2 and 5.
- **Dependency discipline**: Minimize dependencies. Prefer built-in Node functionality such as `node:http`, `fetch`, `WebSocket` in Node 22 or later, and `node:test`. Explain the reason before adding any dependency.
- **DSH facts** (see `doc/feature/00-dsh-vscode/spike-notes.md`):
  - `dsh web --port 0` prints `dsh web: http://127.0.0.1:<port>`. `~/.dsh` is the default state directory and `DSH_HOME` can override it.
  - The `/api` trust fence allows Node requests without browser headers, rejects direct cross-origin webview requests with HTTP 403, and does not guard static `/plugins/` assets.
  - Clipboard operations do not work inside a webview iframe through either button APIs or native Cmd+C/Cmd+V. This project fixes that limitation with the transport bridge.
  - The dist shell bundle uses relative imports such as `./vendor-*.js`; assets must load from the same `vscode-resource` origin.
- **Project layout**:
  - `src/` — TypeScript extension-host sources, including extension, server manager, document assembly, bridge host, panel provider, commands, and theme sync
  - `media/` — webview injection scripts, icons, and other static assets
  - `test/` — unit tests
  - `doc/` — documentation; see the Feature Pipeline in Section 6
  - `spike/` — one-time Phase 0 verification code, removed after the MVP
  - `.spike-dsh-home/` — isolated `DSH_HOME` output from spikes, ignored by git

## Appendix A: Localization (i18n)

- Follow VS Code extension-localization conventions: define extension names, commands, and setting descriptions in matching `package.nls.json` (English) and `package.nls.zh-cn.json` (Simplified Chinese) files. Use `vscode.l10n.t()` or an equivalent mechanism for user-visible strings in code; VS Code 1.73 or later is required.
- Keep English and Chinese resources synchronized when adding user-visible text. Do not use English text as the Chinese translation. Command identifiers and similar technical identifiers remain in English.
- Repository-wide documentation follows the English policy in Section 1. Intentionally localized user-facing documents such as `README.zh.md` remain translated.

## Appendix B: VS Code Webview UI Rules

- **No hardcoded colors**: Always use VS Code theme variables such as `var(--vscode-editorWidget-background)` and `var(--vscode-button-background)`. Let the VS Code theme control light and dark appearance.
- **CSP is mandatory**: Every webview must include a minimal Content Security Policy such as `default-src 'none'`. See Section 5.6 of `doc/feature/00-dsh-vscode/solution.md`. The transport bridge enforces `connect-src 'none'` as a final safeguard.
- **External resources must be same-origin or use `data:`**: Do not reference raw cross-origin fonts, scripts, or styles. See the CORS findings F10/F11 in the spike notes.
- **Follow the VS Code design language**: Typography, spacing, controls, and status-bar text must follow VS Code conventions. Panel and sidebar heights must be responsive.
- **Error and loading states**: Webviews must include overlays for starting, error, and stopped states, aligned with plan tasks T8/T9. Never leave a blank screen without feedback.
- **Accessibility**: Buttons must have an `aria-label` or visible text, focus order must be natural, and every control must be keyboard-operable.

---

**[Boot Instruction]**:
These rules serve as the "initialization firmware." If a violation is observed, the user may trigger a reset with the keyword **"Check Rules"**.
