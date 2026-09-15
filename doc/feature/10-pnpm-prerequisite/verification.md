# pnpm Prerequisite — Verification

**Date**: 2026-09-15
**Sources**: [req.md](req.md), [solution.md](solution.md), [plan.md](plan.md)

## Result

PASS. The pnpm prerequisite is explicit, installable, version-checked, enforced
at the DSH installer boundary, and used directly by source installs. No
requirement gaps remain.

## Requirement-to-plan coverage

| Requirement | Planned tasks | Evidence | Result |
|---|---|---|---|
| R1 — Explicit pnpm health check | T2, T4 | `DoctorReport.pnpm`, bounded pnpm probe, and the pnpm Quick Pick row exist and are exercised by Doctor/UI tests. | PASS |
| R2 — Version compatibility | T1, T2 | `isSupportedPnpmVersion()` accepts only 11.7.0; missing, malformed, older, and newer results fail tests. | PASS |
| R3 — Installation gate | T3, T4 | `runManagedInstall()` resolves verified prerequisites before chooser/mkdir; the gate test observes no UI or runtime mutation on failure. | PASS |
| R4 — pnpm install option | T1, T3, T4 | Doctor dispatches `runManagedPnpmInstall()`; exact install argv, success, cancellation, and failed verification are tested. | PASS |
| R5 — Platform-safe execution | T1, T3 | Windows resolution returns Node plus `pnpm.cjs` or native `.exe`, always `shell: false`; source commands use that launch directly and prepend its verified runtime bin directory for nested scripts. | PASS |
| R6 — Existing prerequisite ordering | T2, T4 | State/action tests cover Node → npm → pnpm → DSH; runnable DSH remains ready and does not demand unavailable setup tooling. | PASS |
| R7 — Localized UI | T4 | Seven pnpm UI keys contain all ten locales; the complete i18n parity suite passes. | PASS |
| R8 — Regression coverage | T5, T6 | Focused tests, the full 251-test suite, and a real Windows ARM64 source build pass. | PASS |

The RTTM covers every requirement, and every requirement maps to implemented
and executed tests.

## Acceptance criteria

1. **PASS** — Doctor renders Host, Node, npm, pnpm, and DSH; the UI test inspects
   the pnpm item.
2. **PASS** — Missing/incompatible pnpm selects only the pnpm action; DSH repair
   is not exposed or entered.
3. **PASS** — The install spec contains exactly `pnpm@11.7.0` and a versioned
   DSHmux-managed prefix.
4. **PASS** — Successful pnpm installation calls the refresh callback and
   reopens Doctor.
5. **PASS** — Cancellation and verification failure return false without
   calling DSH installation; failures are logged/reported.
6. **PASS** — Source installation calls the verified pnpm launch directly and
   exposes its verified bin directory to nested package scripts;
   production contains no `buildPnpmExecArgs`, `--package=pnpm`, or npm-exec
   bootstrap.
7. **PASS** — TypeScript compilation and all tests pass.

## Completed-task code and live-call audit

| Task | Implementation exists | Production call exists | Result |
|---|---|---|---|
| T1 | pnpm paths/install spec at `src/dshInstallService.ts:134-168`; resolver at `:311-367`; version/validation at `:392-409`. | Doctor calls the resolver; install services call every managed path/spec/validation helper. | PASS |
| T2 | pnpm report/probe/state logic at `src/dshDoctor.ts:54-81, 294-321, 356-383`. | `runDoctorForLauncher()` creates the production probe; chat and Doctor commands consume its state/report. | PASS |
| T3 | boundary verification at `src/installService.ts:353-404, 507-516`; pnpm install at `:583-686`; direct source launch at `:326-336`. | Doctor dispatches pnpm install; Doctor repair dispatches gated DSH install; source branch calls the supplied launch. | PASS |
| T4 | action/row/dispatch at `src/installService.ts:106-158, 696-737`; localized rows in `src/i18nStrings.ts`. | `runDoctorCommand()` renders and dispatches them; registered extension command calls `runDoctorCommand()`. | PASS |
| T5 | Two focused audits recorded in plan; residual-pattern and call-site searches executed. | Audit found no dead helper or missing exhaustive state switch. | PASS |
| T6 | Compile, full tests, integration check, verification, plan review, summary, and TODO completed. | Close-out artifacts link back to approved sources. | PASS |

## Test evidence

- `npm.cmd run compile`: PASS.
- Focused Doctor/helper/install/i18n suite: PASS, 58/58 tests.
- `npm.cmd test`: PASS, 251/251 tests, 0 failed/skipped/todo.
- `git diff --check`: PASS (only Git's existing LF-to-CRLF checkout warnings).
- Real Windows ARM64 managed-prefix check: PASS. The exact npm install arguments
  installed pnpm 11.7.0, and direct `node.exe <prefix>\node_modules\pnpm\bin\pnpm.cjs --version`
  returned `11.7.0`. The verified disposable directory was removed afterward.
- Real Windows ARM64 DSH source build: PASS. Direct managed pnpm invocation
  completed `pnpm build` with exit code 0; nested bare `pnpm` commands resolved
  through the injected managed bin directory. The resulting CLI returned
  `0.1.5-rc.2`.

## Gap assessment

No functional, acceptance, traceability, or dead-code gaps were found.

Non-blocking pre-existing environment warnings observed during verification:

- Node reports typeless-module reparsing warnings for existing ESM-style test
  files in a package without `type: module`.
- Existing Windows tests emit Node DEP0190 for legacy shell-based DSH command
  paths outside this pnpm implementation.
- `npm ci` reported two dependency install scripts awaiting npm allow-list
  approval; compilation and all tests still passed.

Severity: informational. Suggested action: handle these independently if the
project chooses to clean up its test/module configuration or dependency install
policy; none affects this feature.
