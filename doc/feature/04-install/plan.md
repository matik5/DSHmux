# 04-install — Implementation Plan

**Date**: 2026-09-01
**Sources**: [discussion.md](discussion.md), [req.md](req.md), [solution.md](solution.md)

## RTTM (requirement → task traceability)

| Requirement | Task | Verification |
|---|---|---|
| R1: Doctor report model + classification (node/dsh/npm/npx/git/pnpm, install type, redacted paths) | T1, T2 | `test/dshDoctor.test.js` matrix with injected probe |
| R1: Node candidate probed via `--version` (not trusted) | T1, T2 | `dsh-unrunnable` / bare-name test cases |
| R1: untested version = warning, never a blocker | T1, T2 | classification tests (older/newer/unknown → `ready` + warning) |
| R1: remote-window host label = workspace host | T6, T8 | `hostLabel` from `vscode.env.remoteName` in extension.ts; probe seam test |
| R1: launcher no-blind-auto-start + setup panel + Check again | T7 | `test/dshLauncher.test.js` (auto-start gate) + manual smoke |
| R1: `dshmux.doctor` command available at all times | T6, T8 | command registered before any start; manual smoke on ready machine |
| R2: npm/npx plans pin `TESTED_DSH_VERSION` (no latest/next) | T3, T4 | `test/dshInstallService.test.js` command assertions |
| R2: labeled alternative (mainline lacks the two patches) | T6 | flow labels via i18n (T5); manual smoke |
| R2: no auto-execution; terminal prefill only after selection | T6 | `prefillTerminal` uses `sendText(cmd, false)`; code review + manual |
| R2: node-missing → official Node link, no auto-install | T6, T7 | `install-node` action → `openExternal`; test on missing-node report |
| R3: primary clone plan (matik5 fork, patched branch, revision constant) | T3, T4 | plan assertions incl. quoted parent dir with spaces, Windows cmd |
| R3: existing-checkout validation (bin.js + `--version` + dirty + branch) | T3, T4, T6 | checkout tests (stale build, missing artifact, dirty, wrong branch) |
| R3: confirmed machine-scoped `dshmux.dshPath` write | T6 | code review (`ConfigurationTarget.Machine`) + manual smoke |
| R3: never modify a dirty/unrelated checkout; never auto-install tools | T3, T6 | validation is read-only; flow offers guidance links only |
| R5: visible DSHmux setup terminal + echo-then-prefill order (R2 prefill stays never-auto-executed; the primary flow is superseded by R7) | T10, T12 | `test/installService.test.js` (vscode mock) + grep invariant |
| R6: "Source on GitHub →" row on the setup panel opens the exact tested branch (URL derived from frozen constants) | T11 | `test/dshLauncher.test.js` (row in panel HTML + `openExternal` routing) |
| R7: primary new-clone flow auto-runs in the setup terminal — one final modal (all commands listed), `&&`-chained single send, end toast | T12 | `test/installService.test.js` (one modal, 4 echoes + 1 chained send) + updated grep invariant |
| R8: doctor command reachable from the DSHmux panel header / "…" menu | T13 | manual smoke on a fresh instance (menu entry opens the doctor QuickPick) |
| Cross-cutting: 9-locale strings, EN+ZH synced | T5 | `npm test` (i18n parity test) + compile |

## Order

```
T1 (doctor core) ──> T2 (doctor tests)
T3 (install plans) ─> T4 (install tests)
T5 (i18n)  ──────────> T6 (VS install service + doctor command) ──> T7 (launcher setup panel)
T6 ───────────────────> T8 (command/extension/package wiring)
T8 ───────────────────> T10 (setup terminal feedback, R5) ──> T9 (verification)
T7 ───────────────────> T11 (GitHub source link, R6) ───────> T9 (verification)
T10 ──────────────────> T12 (auto-run primary flow, R7) ────> T9 (verification)
T8 ───────────────────> T13 (doctor panel menu, R8) ─────────> T9 (verification)
```

T1–T5 are independent and can interleave; T6 needs T1+T3+T5; T7 needs T6; T8 needs T6+T7; T10 needs T6 (edit of the existing install service) plus T8 (wiring smoke); T11 needs T7 (setup panel HTML/JS in launcherView); T12 needs T10 (reuses the shared setup terminal + echo lines) and replaces T6's per-step confirm loop in the new-clone branch; T9 last.

---

### T1 — Doctor pure model — ⏳

**Files**: `src/dshDoctor.ts` (new)

Reuse (no edits): `resolveNodeExecutable`, `resolveDshVersion`, `resolveDshPath`,
`resolveStartBin`, `spawnSpec`, `spawnEnvironment` from `src/serverManager.ts`;
`dshCompatibility`, `DshCompatibility` from `src/versionCheck.ts`.

- [ ] `DoctorState`, `DoctorInstallType`, `ToolInfo`, `DoctorReport`, `DoctorProbe` types per solution contract.
- [ ] `realDoctorProbe(): DoctorProbe` — `exists` = `fs.existsSync`; `run` = `spawnSync(cmd, args, { encoding: "utf8", env, timeout, shell })` with `env` = `spawnEnvironment(spawnSpec(node), process.env)` style PATH fix; all timeouts ≤ 5000 ms.
- [ ] `runDoctor(probe): DoctorReport` — sequential bounded probes:
  - node: `resolveNodeExecutable(probe.platform, probe.execPath, probe.home, probe.env)`; if result is a bare name (`path.dirname(p) === ""`) and no PATH entry resolves, still probe `probe.run(name, ["--version"])`; `runnable = version !== null`; `available = exists(absPath) || runnable`.
  - npm/npx: only when node runnable — run `npm --version` / `npx --version` (Windows: shell: true for `.cmd` shims).
  - git/pnpm: `probe.run("git", ["--version"])`, `probe.run("pnpm", ["--version"])` (shell: true on win32).
  - dsh: `resolveStartBin({}, probe.configuredDshPath, probe.home, probe.platform)` → `resolvedPath`, `tried`; `configuredValid` = configured path exists; version = `resolveDshVersion(bin)` (guard: bin null → null); `compatibility = dshCompatibility(version)`; `installType = classifyInstallType(resolvedPath, probe)`.
- [ ] `classifyInstallType(bin, probe): DoctorInstallType` — pure string rules: `/_npx/` → `npx-cache`; `node_modules/@deepseek-ai/` → `npm-global`; ends with `/apps/cli/lib/bin.js` (or `/apps/cli/lib/bin.js.cmd`) → `source`; fallback: `probe.exists(join(dirname(realpath(bin)), "..", "..", "pnpm-workspace.yaml"))` → `source` else `custom`; no bin → `none`.
- [ ] State classification per solution rules (node-missing > dsh-missing / source-prerequisites-missing > dsh-unrunnable > ready; warnings: untested compat, stale configured path, git/pnpm missing when dsh missing).
- [ ] `redact(p, home)` helper: home → `~` (mirror `resolveDshPath`'s `tried` redaction).

**Completion criteria**: `npm run compile` zero issues; no `vscode` import; no writes; only bounded `spawnSync` probes.

### T2 — Doctor tests — ⏳

**Files**: `test/dshDoctor.test.js` (new)

- [ ] Injected `DoctorProbe` stub (map-backed `exists`, scripted `run`) — no real spawns.
- [ ] Cases: missing Node; Node not runnable (bare name, probe fails); missing DSH with Node; `source-prerequisites-missing` (git missing; pnpm missing); stale configured path (config set, file absent, discovery finds npm-global); npm-global install type; npx-cache install type; Windows `.cmd` shim path + win32 platform; source via `/apps/cli/lib/bin.js`; source via realpath + `pnpm-workspace.yaml`; untested version (`0.2.0` → `ready` + warning, not blocked); `dsh-unrunnable` (bin exists, `--version` fails); redaction of `tried`/paths; `none` install type.
- [ ] Assert `runDoctor` never mutates the probe and report shape is stable (snapshot-style deep equals on a fixture).

**Completion criteria**: `npm test` green; all R1 acceptance criteria 1–4 covered.

### T3 — Install command plans — ⏳

**Files**: `src/dshInstallService.ts` (new)

- [ ] Constants: `TESTED_SOURCE_REPO = "https://github.com/matik5/deepseek-harness.git"`, `TESTED_SOURCE_BRANCH = "matik/dsh-patches-0.1.2-rc.1"`, `TESTED_SOURCE_REVISION = "07bca197e2"` (with comment linking `doc/dsh-patches/README.md` + tag `dsh-v0.1.2-rc.1` = `a66e470204`).
- [ ] `buildSourceClonePlan(parentDir, platform): InstallCommand[]` — 4 steps (clone with `--branch` → `cd` → `pnpm install` → `pnpm build`); target dir `deepseek-harness` under `parentDir`; quote every path argument (Windows cmd quoting: double quotes, no backslash-escaping of the path itself); labels/purposes as i18n keys.
- [ ] `buildNpmPlan()` / `buildNpxPlan()` — pin `TESTED_DSH_VERSION` from `src/versionCheck.js`; single commands per solution.
- [ ] `CHECKOUT_BIN_REL = "apps/cli/lib/bin.js"`; `checkExistingCheckout(checkoutDir, probe): CheckoutCheck` — pure given `probe`: `valid` = bin exists AND `probe.run(node, [bin, "--version"])` ok (node path passed in, resolved by caller via `resolveNodeExecutable`); `dirty` = `git status --porcelain` stdout non-empty; `onPatchedBranch` = `git rev-parse --abbrev-ref HEAD` stdout trim === `TESTED_SOURCE_BRANCH`, `null` when git fails (not a repo).
- [ ] Export `NODE_DOWNLOAD_URL = "https://nodejs.org/en/download"`, `GIT_DOWNLOAD_URL = "https://git-scm.com/downloads"`, `PNPM_INSTALL_URL = "https://pnpm.io/installation"`.

**Completion criteria**: `npm run compile` zero issues; no `vscode` import; no execution of any command (probe only).

### T4 — Install-plan tests — ⏳

**Files**: `test/dshInstallService.test.js` (new)

- [ ] Clone plan: exact strings on darwin and win32; parent dir with spaces is quoted (`/Users/me/My Projects`); branch + repo constants present; 4 steps in order; `pnpm build` last.
- [ ] npm/npx plans contain `@deepseek-ai/dsh@${TESTED_DSH_VERSION}` and never `latest`/`next`.
- [ ] `checkExistingCheckout`: valid build; missing `apps/cli/lib/bin.js` (stale/unbuilt); `--version` fails (broken build); dirty repo flagged but still validated if build works; wrong branch → `onPatchedBranch === false`; non-git dir → `null`.
- [ ] No test spawns a real process (probe stubs).

**Completion criteria**: `npm test` green; R2/R3 command-construction and checkout-validation criteria covered.

### T5 — i18n strings — ⏳

**Files**: `src/i18nStrings.ts` (edit)

- [ ] `doctor.*` keys: title, state labels (5 states), check rows (platform/node/npm/npx/git/pnpm/dsh/version/compat/path), `checkAgain`, `untestedWarning`, `staleConfigWarning`, `missingPrimaryPath` (git/pnpm), action labels.
- [ ] `install.*` keys: `primaryTitle` (patched source — with-patches framing), `alternativeTitle` (mainline — no-patches framing), `newClone`, `existingCheckout`, `cloneStep1..4` labels+purposes, `setDshPath` prompt + detail + confirm, `dshPathUpdated`, `nodeMissing` (+ link label), `gitMissing`, `pnpmMissing`, `copied`, `prefilled` (reuse `upgrade.prefilled` if shape matches — check first), `checkoutDirty` warning, `checkoutNotPatchedBranch` warning.
- [ ] All 9 locales (en, zh, ja, ko, ru, es, pt, fr, de); EN + ZH carefully authored, remaining locales translated following the existing table style (never EN-as-ZH).

**Completion criteria**: `npm test` green (existing i18n parity test enforces key sets across locales); compile clean.

### T6 — VS Code install service + doctor command — ⏳

**Files**: `src/installService.ts` (new)

- [ ] `prefillTerminal(command, label): void` — mirror `versionCheckService.ts` L163–166: `createTerminal(label)` → `show()` → `sendText(command, false)` + info message. **Never** `sendText(cmd, true)`.
- [ ] `runDoctorCommand(context): Promise<void>` — `runDoctor(realDoctorProbe())` with `hostLabel = vscode.env.remoteName ? \`remote-${vscode.env.remoteName}\` : "local"`; QuickPick: one item per check (`✓/⚠/✗` in `label`, detail = value, redacted paths), trailing action item by state: not-ready → `Set up DSH…` (→ primary flow) + `Alternative (npm)…`; any state → `Check again`.
- [ ] `runPrimaryInstallFlow(report, context)`:
  - git or pnpm missing → guidance QuickPick (official links via `vscode.env.openExternal`, `Copy command`-style none) — then return (no clone plan while prerequisites missing).
  - QuickPick: `New clone…` → `showSaveDialog`-style folder pick (`vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false })`) → `buildSourceClonePlan` → step-by-step: for each step show the exact command in a modal (`showInformationMessage(cmd, "Run in terminal", "Copy", "Cancel")`) → chosen → `prefillTerminal`; user finishes → `Check again` re-runs doctor and pushes to launcher. `Use existing checkout…` → folder pick → `checkExistingCheckout` via real probe → report warnings (dirty, wrong branch) → if `valid`: confirm `dshPath` write (message shows exact `<dir>/apps/cli/lib/bin.js`, `ConfigurationTarget.Machine`) → success message + re-run doctor.
- [ ] `runAlternativeInstallFlow(report, context)` — QuickPick (npm global / npx cache / copy), each clearly labeled mainline-without-patches (i18n); chosen → `prefillTerminal` / clipboard; then `Check again`.
- [ ] `runDoctorForLauncher()` exported hook used by T7 (returns fresh `DoctorReport` + pushes nothing — launcher pushes).
- [ ] Node-missing branch: message + `Open Node download page` action → `openExternal(NODE_DOWNLOAD_URL)`.

**Completion criteria**: compile clean; no auto-executed commands anywhere (grep `sendText(` — every occurrence ends in `, false)`); cancellation at every dialog leaves machine unchanged; `dshPath` write only behind explicit confirm.

### T7 — Launcher setup panel + auto-start gate — ⏳

**Files**: `src/launcherView.ts` (edit), `test/dshLauncher.test.js` (new or extend existing launcher coverage)

- [ ] `LauncherInit` += optional `doctor?: DoctorReport`; constructor += `doctorActions?: { checkAgain(): void; primary(): void; alternative(): void; node(): void; git(): void; pnpm(): void }` (optional param, default no-op — single call site updated in T8).
- [ ] `resolveWebviewView`: replace blind auto-start (L577–581) with: run `runDoctor(realDoctorProbe())` (bounded) → cache in field → push `doctor` message → auto-start **only** when `report.state === "ready" || report.state === "dsh-unrunnable"` (binary resolved; let the manager produce the precise error); missing states → no spawn. On `view-ready`: re-push cached doctor + status.
- [ ] New `doctor` message (in + out) per solution contract; webview JS: when state is missing, render setup panel: status dot `error`-style, plain-language summary (`install.summaryNode`, `install.summaryDsh`, `install.summaryPrereq`), primary action button (patched source), alternative button (npm), tool-link rows only for missing tools (node/git/pnpm), `Check again` secondary button. Existing `error` state (start failed) keeps current rendering.
- [ ] `Check again` → host re-runs doctor → pushes `doctor` + `server-status` (no webview reload — same pattern as `upgrade-info`).
- [ ] Theme/accessibility rules: `var(--vscode-*)` only, `aria-label`s, keyboard-operable, CSP unchanged.
- [ ] Tests: with a stubbed manager + stubbed doctor hook, missing report → `start` never called; ready report → `start` called; doctor message round-trip; `dsh-unrunnable` → start attempted.

**Completion criteria**: compile + `npm test` green; ready-machine behavior byte-identical (auto-start still happens); no first-run prompt for ready machines (R1 AC3).

### T8 — Command + extension + package wiring — ⏳

**Files**: `src/commands.ts` (edit), `src/extension.ts` (edit), `package.json` (edit), `package.nls.json` (edit), `package.nls.zh-cn.json` (edit)

- [ ] `package.json` `contributes.commands` += `{ "command": "dshmux.doctor", "title": "%command.doctor.title%", "category": "DSHmux" }`; both nls files += `command.doctor.title` (EN "DSHmux: Run DSH Doctor" / ZH authored).
- [ ] `commands.ts`: `registerCommands` gains optional 5th param `onDoctor?: () => void`; registers `dshmux.doctor` when provided.
- [ ] `extension.ts`: construct the install-service `doctorActions` (checkAgain/primary/alternative/node/git/pnpm → `installService` functions; checkAgain also calls `launcher?.refresh()`), pass to launcher + `registerCommands`; `hostLabel` via `vscode.env.remoteName`.
- [ ] `revealChat()` / activation order unchanged; doctor command works pre-start (no manager dependency).

**Completion criteria**: compile clean; `dshmux.doctor` invocable from the command palette on a machine with DSH ready (manual) and with DSH absent (manual, via `dshmux.dshPath` pointed at a dead path in a scratch workspace).

### T10 — Setup terminal feedback (R5) — ⏳

**Files**: `src/installService.ts` (edit), `test/installService.test.js` (new)

- [ ] `getSetupTerminal()`: one session-scoped `vscode.window.createTerminal({ name: "DSHmux setup" })`, module-level cache, `show()` on every call — opened on the FIRST setup action, reused thereafter.
- [ ] `echoLine(terminal, text)`: `terminal.sendText(`printf '%s\\n' '<sanitized>'`, true)` — the ONLY auto-executed text in the flow; sanitize `'` `\` `$` backtick out of the message (i18n-controlled strings).
- [ ] `prefillTerminal(command, label?, purpose?, step?, total?)`: routes through the shared terminal; echo line first (step number + purpose + exact command), then `terminal.sendText(command, false)` — prefill only; keep the existing prefill notification.
- [ ] Open the terminal at the start of `runPrimaryInstallFlow`, `runAlternativeInstallFlow`, and `runNodeInstallGuidance`/`runGitInstallGuidance`/`runPnpmInstallGuidance`; guidance paths echo the missing-tool text (same as their message) before any dialog.
- [ ] `test/installService.test.js` (vscode `Module._load` mock, pattern of `test/dshChatView.test.js`): terminal created once and reused across two flows; per step the order is echo(`true`) then prefill(`false`); guidance path announces in the terminal before its message; echo sanitization.
- [ ] Grep invariant (manual, recorded in verification.md): every plan/step command is sent with `sendText(<command>, false)`; only the fixed `printf` echo uses `true`.

**Completion criteria**: `npm run compile` + `npm test` green; clicking any setup action in any missing state opens the DSHmux setup terminal before any other dialog (manual re-smoke).

### T11 — GitHub source link on the setup panel (R6) — ⏳

**Files**: `src/dshInstallService.ts` (edit — one derived constant), `src/launcherView.ts` (edit — panel row + handler), `src/i18nStrings.ts` (edit — one key, 9 locales), `test/dshLauncher.test.js` (edit)

- [ ] `dshInstallService.ts`: export `TESTED_SOURCE_TREE_URL = TESTED_SOURCE_REPO.replace(/\.git$/, "") + "/tree/" + TESTED_SOURCE_BRANCH` (= `https://github.com/matik5/deepseek-harness/tree/matik/dsh-patches-0.1.2-rc.1`) — no new magic strings.
- [ ] `launcherView.ts`: static setup-panel row `<button class="tool-link" id="setupSource">… →</button>` after the Check-again button (present whenever the panel is; hidden with it); `install-source` webview message → `vscode.env.openExternal(vscode.Uri.parse(TESTED_SOURCE_TREE_URL))` — no local execution, no `doctorActions` wiring.
- [ ] `i18nStrings.ts`: `install.sourceOnGitHub` in all 9 locales (no single quotes).
- [ ] `test/dshLauncher.test.js`: missing-state HTML includes the row; handler routes `install-source` to `openExternal` with the branch URL (extend the fake vscode with `env.openExternal` + `Uri.parse`).

**Completion criteria**: `npm run compile` + `npm test` green; row visible in every missing-state smoke screenshot; click opens the branch URL in the browser.

### T12 — Auto-run primary install in the setup terminal (R7) — ⏳

**Files**: `src/installService.ts` (edit), `src/i18nStrings.ts` (edit — 2 keys × 9 locales), `test/installService.test.js` (edit)

- [ ] `src/installService.ts`: in the new-clone branch, replace the per-step `confirmStep` loop with ONE `confirmAutoRun(plan)` modal — numbered, verbatim commands; **Run in terminal / Copy / Cancel** (Copy writes all commands, one per line). On Run: echo every numbered step via the R5 `echoSetupLine`, then a single `terminal.sendText(plan.map((s) => s.command).join(" && "), true)`; then one non-modal toast (running in the DSHmux setup terminal, a failing step stops the rest, use Check again when done). Update the file-header safety contract (R7 supersedes no-auto-execute for this flow only; R2 + guidance stay prefill-only). The existing-checkout branch and guidance paths are untouched.
- [ ] `i18nStrings.ts`: `install.autoRunPrompt` (carries `{steps}`) + `install.autoRunStarted`, all 9 locales.
- [ ] `test/installService.test.js`: primary-flow test becomes one scripted modal answer, 4 echo sends (auto-executed) + exactly ONE chained auto-executed send (`" && "`-joined, all four commands in order, clone verbatim against the chosen parent dir); R2 alternative flow stays prefill-only (`sendText(command, false)`); grep invariant updated: the auto-executed `sendText(…, true)` lines in `src/installService.ts` are the fixed printf echo and the single `join(" && ")` chain send — nothing else.

**Completion criteria**: `npm run compile` + `npm test` green; manual smoke: new-clone flow runs all four steps visibly in the terminal from one modal, a cancelled modal leaves the machine unchanged.

### T13 — DSH Doctor in the panel header menu (R8) — ⏳

**Files**: `package.json` (edit — one `view/title` menu entry)

- [ ] `contributes.menus["view/title"]` += `{ "command": "dshmux.doctor", "when": "view == dshmux.view", "group": "navigation" }` — reuses the existing `dshmux.doctor` command and its nls title (`%command.doctor.title%`); no code change, no new strings.
- [ ] Manual smoke: on a fresh instance the entry is visible in the DSHmux panel header (or the "…" overflow) and clicking it opens the doctor QuickPick — also before DSH has started.

**Completion criteria**: `npm test` green; entry visible and functional in the restarted smoke instance.

### T9 — Verification + packaging — ⏳

- [ ] `npm run compile` — zero issues.
- [ ] `npm test` — full suite green (old + new).
- [ ] Manual smoke (local machine, DSH present): command palette → Run DSH Doctor → report shows `ready`, install type `source`/`npm-global`, no start disruption; launcher shows normal ready UI (no setup panel, no prompt).
- [ ] Manual smoke (missing DSH simulation): scratch workspace + `dshmux.dshPath` set to a nonexistent path + temporary rename of the global dsh link **only with explicit user go-ahead at that moment** (never without) → launcher shows setup panel, no spawn; doctor QuickPick shows the missing rows; clone plan strings correct.
- [ ] Manual smoke (guided install, R5+R7, 2026-09-05 with user): click primary install in missing state → DSHmux setup terminal opens immediately; clone to `/tmp/dshmux-test` via ONE confirmation modal, then all four steps run automatically in the terminal (visible output, `&&`-chained); then "Use existing checkout…" validates the built CLI and writes `dshmux.dshPath` behind confirmation; Check again → ready + auto-start.
- [ ] `npm run package` → new `.vsix` (no publish — requires separate explicit confirmation).

**Completion criteria**: all gates pass; results recorded in `verification.md`.

---

*Related documents: discussion.md | req.md | solution.md*
