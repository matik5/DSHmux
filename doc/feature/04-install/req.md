# 04-install — Requirements

**Date**: 2026-09-01

**Status**: APPROVED (2026-09-01)

**Sources**: [discussion.md](discussion.md), [implementation-plan.md](../../install/implementation-plan.md)

## Intent

A beginner who installs DSHmux should be told, in plain language, what is ready
on their machine, what is missing, and exactly which command to run — without
DSHmux ever running an installation for them or touching anything it is not
explicitly asked to. The **primary recommendation** is the patched DSH source
branch under the `matik5` fork, because it carries compatibility fixes that
mainline (npm registry) DSH does not have (user decision, 2026-09-01); the
mainline npm package remains the faster alternative for users who do not need
those fixes.

The work covers roadmap phases **I1 → I2 → I3 → I4** (all NOT DEFERRED, in that
order). D1 (Blender recipe) and D2 (managed patched DSH) remain DEFERRED;
X1/X2/X3 remain REJECTED.

## Safety rules (binding, from the roadmap — verbatim)

- Run every probe against the workspace extension host.
- Keep environment detection read-only and bounded by short timeouts.
- Never invoke an OS package manager or administrator/elevation flow.
- Never execute an installation command automatically. Show the complete command
  and prefill a terminal only after explicit user selection.
  *(Superseded for the primary new-clone flow only, by explicit user decision
  2026-09-05 — see [R7](#r7--auto-run-the-primary-install-in-the-setup-terminal-2026-09-05-user):
  one final modal listing every command, then the whole plan runs in the
  visible setup terminal. R2 and the guidance paths remain prefill-only.)*
- Never export credential values, `.credentials.yaml`, `.env` files, sessions,
  workspace content, or telemetry data.
- Preview configuration changes and trusted executable commands before applying
  them. Preserve a rollback path.
- Never modify an arbitrary source checkout or npm installation in place.
- Make all detection and import operations safe to repeat.

## R1 — DSH Doctor and environment detection (roadmap I1)

The extension provides a `DSHmux: Run DSH Doctor` command, available at all
times (including when DSH is not running), that produces a read-only report of
the workspace-host environment:

- workspace-host platform and architecture (the remote/WSL/dev-container host
  in remote windows, never the local UI machine);
- Node and npm/npx availability, with the resolved Node **probed via
  `--version`** (a discovered candidate that cannot run is reported as
  missing/unrunnable, not trusted);
- configured `dshmux.dshPath` (if set) and the discovered DSH path;
- DSH version and its compatibility with `TESTED_DSH_VERSION`
  (`tested / older / newer / unknown`);
- inferred installation type: `npm-global`, `npx-cache`, `source`, or `custom`;
- Git and pnpm availability — required for the **primary recommended install
  path** (R3, patched source clone), reported with official guidance links when
  missing; never a start blocker for a user who already has a runnable DSH;
- the checked paths in redacted form (home → `~`).

The report classifies one actionable state: `ready`, `node-missing`,
`dsh-missing`, `dsh-unrunnable`, or `source-prerequisites-missing`. An untested
DSH version is a **warning, never a start blocker**.

Launcher integration:

- When the launcher is shown and no runnable DSH exists, the launcher surfaces
  the Doctor result and installation actions (R2/R3 entry points) instead of
  repeatedly attempting an inevitable start.
- A machine with a runnable DSH keeps the current direct-start/auto-start
  behavior unchanged, with no first-run prompt.
- The report offers an explicit **Check again** action. DSHmux does not observe
  or wait for terminal command completion.

Non-negotiables:

- Doctor performs no filesystem writes (beyond no side effects at all) and never
  launches a DSH server.
- Detection reuses the existing discovery helpers (`resolveDshPath`,
  `resolveDshVersion`, `resolveNodeExecutable`); there is exactly one
  path-discovery algorithm.
- All probes are bounded by short timeouts and cross-platform (Windows npm
  shims, nvm, source CLI `.js` entries).

Acceptance criteria (each covered by a deterministic test):

1. Missing Node, missing DSH, stale configured path, npm-global DSH, npx-cache
   DSH, source CLI path, Windows npm shim, and untested DSH version each
   classify to the correct state with the correct warning.
2. A remote-window report names the workspace host, not the UI OS.
3. A ready installation follows the current launcher behavior with no extra
   prompt.
4. Doctor is read-only and spawns no `dsh` server process.
5. `Check again` re-runs the report and updates the launcher.

## R2 — Guided npm/npx installation (roadmap I2)

**Alternative install path** (not the primary recommendation — R3 is, since
mainline lacks the two compatibility patches). When Node and npm/npx are
available, the extension offers two explicit choices:

1. **npm global**: `npm i -g @deepseek-ai/dsh@<TESTED_DSH_VERSION>`
2. **npx cache — no global package**: `npx -y @deepseek-ai/dsh@<TESTED_DSH_VERSION> --version`

The choice UI must clearly label the tradeoff: mainline npm DSH does not
include the JPEG/compaction compatibility patches carried by the patched
source branch (R3).

Requirements:

- The package spec is built from `TESTED_DSH_VERSION`. Mutable `latest`/`next`
  dist-tags are never used for initial setup.
- The interaction reuses the established upgrade pattern: show the exact
  command, create a workspace-host terminal, prefill via
  `sendText(command, false)` — the user presses Enter. Nothing executes
  automatically.
- When Node is absent (`node-missing`), the UI explains that npm normally ships
  with Node and links to the official Node installation instructions
  (https://nodejs.org/en/download). DSHmux never offers to install Node, npm,
  Git, or pnpm itself (X1 rejection stands).
- Registry/network problems are reported distinctly from missing local tools.
- After the user finishes in the terminal, **Check again** re-runs Doctor and
  updates the launcher; a successful scan resumes the existing start flow.
- Re-running the flow on an already-ready installation does not offer to
  reinstall.

Acceptance criteria:

1. Every initial-install command pins `TESTED_DSH_VERSION`.
2. No command executes until the user presses Enter; cancellation leaves the
   machine unchanged.
3. Both choices are found by the existing DSH resolver after completion
   (npm-global prefix bin; npx cache path).
4. The node-missing path links official guidance and offers no auto-install.
5. Unit tests cover command construction, version pinning, Windows shell
   selection, cancellation, and the no-auto-execution contract.

## R3 — Guided source-checkout installation (roadmap I3)

The **primary recommended install path** (user decision, 2026-09-01 — it
carries the compatibility patches mainline lacks). It also serves developers
and custom-build users; the npm mainline path (R2) is the alternative.

Requirements:

- An explicit tested source repository, branch, and revision are recorded
  alongside `TESTED_DSH_VERSION` as constants. No runtime inference of a Git
  ref from the npm version.
- **The tested source is the patched fork, not mainline** (user decision,
  2026-09-01): repository `https://github.com/matik5/deepseek-harness.git`,
  branch `matik/dsh-patches-0.1.2-rc.1`, revision `07bca197e2` (= the
  `dsh-v0.1.2-rc.1` tag plus the two compatibility patches from
  [doc/dsh-patches/README.md](../../dsh-patches/README.md): JPEG attachment
  projection for WebP-incompatible providers, and the pi-ai compaction wire
  marker). Mainline `deepseek-ai/deepseek-harness` lacks these fixes, so the
  guided clone must target the fork branch.
- Because this route is the primary recommendation, the missing-DSH screen
  shows Git and pnpm availability (with official installation guidance links)
  immediately; DSHmux never installs them itself (X1 rejection stands). When
  either is missing, the state is `source-prerequisites-missing` and the npm
  alternative (R2) is offered as the unblocked path.
- Two supported cases:
  1. **Select an existing checkout**: validate the built
     `apps/cli/lib/bin.js` exists and that `dsh --version` from it succeeds.
     A dirty or unrelated repository is reported, never modified.
  2. **New checkout in a user-selected parent directory**: prefill, one at a
     time and each user-confirmed, the visible `git clone`, `git checkout <tested
     revision>`, dependency-install (pnpm), and build commands. No
     multi-command script is hidden behind one button.
- After validation, the extension offers to set `dshmux.dshPath` (machine
  scope, overridable) to the validated built CLI. The exact path is shown and
  the change requires explicit confirmation.
- Doctor re-runs after selection and after each user-driven build attempt.
- DSHmux never edits or patches an existing checkout (X3 rejection stands).

Acceptance criteria:

1. Source setup never installs Git, Node, npm, or pnpm automatically.
2. Only a validated built CLI (artifact present + `--version` succeeds) can be
   written to `dshmux.dshPath`, and only after confirmation.
3. Paths and commands are correct on Windows, macOS, and Linux workspace hosts,
   including paths containing spaces.
4. Tests cover spaces in paths, cancellation, stale builds, missing build
   artifacts, and dirty existing repositories.

## R5 — Visible setup terminal for every install action (2026-09-05, user)

Every guided setup action (the panel's primary/alternative buttons, the
missing-tool guidance rows, the doctor QuickPick actions) must open a
visible terminal immediately, so a click never silently does nothing.

Requirements:

- A single session-scoped terminal (label **DSHmux setup**) is created on
  the first setup action and reused for all subsequent steps and flows; it
  is shown as soon as a setup action starts — including the
  prerequisite-missing guidance paths (node/git/pnpm).
- Each user-confirmed step is announced in the terminal by one auto-echoed
  line (step number, purpose, exact command) and the command itself is
  prefilled for the user's Enter. The echo line is the only auto-executed
  text in the install flow and must be a fixed `printf '%s\n' '…'` of
  DSHmux-controlled text — install commands are NEVER auto-executed (the
  R2/R3 no-auto-execute contract is unchanged).
- The missing-tool guidance paths announce in the terminal which tool is
  missing and where to get it (same text as the message they show).
- The existing prefill notification is kept.

Acceptance criteria:

1. Clicking any setup action in any missing state opens the DSHmux setup
   terminal before any other dialog appears.
2. Grep invariant: every plan/step command is sent with
   `sendText(<command>, false)`; only the fixed echo prefix may use
   `sendText(..., true)`.
3. Unit tests pin terminal reuse, echo-then-prefill order, and the
   guidance-path announcements.

## R6 — GitHub source link on the setup panel (2026-09-05, user)

The setup panel needs a visible link to the exact source DSHmux installs
from, so a user can browse the repository (fork, patches, branch) before or
after a guided install.

Requirements:

- While the setup panel is visible it shows a "Source on GitHub →" row that
  opens the exact tested branch in the external browser
  (`https://github.com/matik5/deepseek-harness/tree/matik/dsh-patches-0.1.2-rc.1`).
- The URL is derived from the frozen `TESTED_SOURCE_REPO` and
  `TESTED_SOURCE_BRANCH` constants — no new magic strings.
- The label is localized (all nine locales).

Acceptance criteria:

1. The row is present whenever the setup panel is visible, and hidden with
   the panel (it is part of the panel, like the other rows).
2. Clicking it opens the branch URL in the external browser; nothing is
   executed locally.
3. Unit tests assert the row in the panel HTML and the `openExternal`
   routing.

## R7 — Auto-run the primary install in the setup terminal (2026-09-05, user)

During the joint guided-install walkthrough the user found the per-step
modal + prefill + manual-Enter flow unusable: the first prefill (the clone)
was lost, and the subsequent steps cascaded into failures in the wrong
directory. User decision (2026-09-05): instead of asking for every step,
DSHmux should fire up the terminal itself and run the commands there.

Requirements:

- This **supersedes, for the primary (patched-source, new-clone) flow only**,
  the R2/R3/R5 no-auto-execute contract and the safety rule "Never execute an
  installation command automatically" (explicit user decision, recorded here;
  see the supersession note in the safety rules). The npm/npx alternative
  flow (R2) stays prefill-only, as does the missing-tool guidance.
- After the user picks "New clone…" and a parent directory, exactly **one**
  confirmation modal gates execution. It lists every plan command
  (numbered, verbatim) and offers **Run in terminal / Copy / Cancel**; Copy
  puts all commands on the clipboard (one per line).
- On Run, the shared DSHmux setup terminal first echoes all numbered steps
  (the R5 echo lines, unchanged), then executes the whole plan as a **single**
  auto-sent command line with the steps chained by `&&` — the terminal
  visibly runs each step in order, and a failing step stops the rest.
- DSHmux does not read terminal output (no VS Code API for it) and does not
  wait: after starting the run it shows one notification that the install is
  running in the DSHmux setup terminal, that a failing step stops the rest,
  and that **Check again** re-verifies once it looks done.
- The existing-checkout path (read-only validation + dshPath confirmation)
  and the missing-tool guidance paths are unchanged.

Acceptance criteria:

1. One modal (not one per step) gates the new-clone flow; Cancel or Copy
   leaves the machine unchanged.
2. The terminal receives the R5 echo lines for all steps followed by exactly
   one auto-executed send containing all plan commands in order, chained by
   `&&` — no per-step sends.
3. The R2 flow keeps `sendText(command, false)` prefill (nothing auto-executed
   there); the grep invariant in the test suite is updated to reflect R7.

## R8 — DSH Doctor in the panel header menu (2026-09-05, user)

The `DSHmux: Run DSH Doctor` command is discoverable only through the command
palette. User request (2026-09-05): expose it in the DSHmux panel's header
("…") menu so the doctor can be re-run manually at any time without knowing
the command id.

Requirements:

- A `view/title` menu entry shows **Run DSH Doctor** in the DSHmux launcher
  panel header (theme icon; it overflows into the panel's "…" menu when the
  header is narrow). It is scoped to `dshmux.view` (not the chat view).
- Reuses the existing `dshmux.doctor` command — no new command, no new code
  path, no new user-visible strings (the nls title already exists).

Acceptance criteria:

1. `package.json` carries the `view/title` menu entry for `dshmux.doctor`
   with `when: view == dshmux.view`.
2. Manual smoke: the entry is visible in the panel header / "…" menu and
   clicking it opens the doctor QuickPick, also before DSH has started.

## R4 — Portable user setup bundles (roadmap I4) — DEFERRED (⏭️)

**Decision (2026-09-01, user)**: R4 is explicitly deferred out of this round;
I1–I3 are implemented now. R4 moves to `TODO.md` unchanged and is re-evaluated
before implementation (its manifest contract still requires the DSH-side audit
of the settings Remote API and MCP schema of the tested DSH version).

The requirements below are preserved verbatim as the future source.

### R4 requirements (carried forward)

A user can export a **versioned, single-file, inspectable** setup bundle
(`.dshmux-setup.json`) containing explicitly selected reusable DSH
configuration, and import it on another machine (or remote host) without
copying `~/.dsh` and without leaking credentials or workspace data.

Export (allowlist-based):

- Redacted DSH settings namespaces (via DSH's authenticated settings Remote
  API where the installed DSH contract supports it; never scraping the webview
  or blindly overwriting `settings.yaml`).
- Profile/bundle requirements; validated profile patch data; structured MCP
  server definitions.
- Platform conditions and minimum compatible DSH/DSHmux versions.
- Credential **reference names or placeholders, never values**.

Import (three stages, all writes strictly after full validation):

1. **Validate** — reject unknown schema versions, unsupported DSH versions,
   malformed commands, secret-shaped values, and unsafe filesystem locations
   before writing anything.
2. **Preview** — show every changed setting, profile layer, package, and
   executable MCP command (executable, arguments, working directory,
   environment-reference names). MCP commands are trusted host code and
   require explicit import confirmation.
3. **Apply** — with the previous settings/profile state preserved and rollback
   exposed when any apply step fails. Re-importing the same bundle is
   idempotent.

Out of scope by contract and enforced by validation: `.credentials.yaml`,
`.env`, sessions, attachments, logs, telemetry, and arbitrary executable
files.

Requirements:

- The manifest schema, MCP patch schema, and settings endpoints are audited
  against the tested DSH version **before the contract is frozen** (the audit
  started for this round was cancelled on user request; it must be redone as
  the first step of a future R4 round).
- Import works on the workspace host in remote windows.

Acceptance criteria:

1. Export is allowlist-based and contains no credential values or excluded
   files (tests with secret-shaped fields).
2. Import shows every change before confirmation; validation completes before
   the first write.
3. A failed multi-part apply restores the previous state (rollback test).
4. Import is idempotent (repeated-import test) and schema-mismatch,
   DSH-version-mismatch, and conflict cases are rejected (tests).

## Out of scope (explicit)

- R4 portable setup bundles — DEFERRED this round (user decision, 2026-09-01);
  flows to TODO.md.
- D1 Blender/Blender-MCP recipe — DEFERRED (blocked on I4 + user selection).
- D2 managed patched DSH distribution — DEFERRED (blocked on I3 + model choice).
- Automatic installation of Node/npm/Git/pnpm (X1), host ripgrep (X2), silent
  in-place patching (X3) — REJECTED.
- No new extension dependencies: pure `node:*` built-ins and the VS Code API.

## Open items carried into solution.md

- Doctor result surface design (launcher integration + command output).

Resolved during this round (no longer open):

- Recommendation order: **patched fork clone (R3) is primary**; npm mainline
  (R2) is the labeled alternative (user decision, 2026-09-01). This deviates
  from roadmap I3's "npm path remains the first and recommended choice" by
  explicit user instruction; D2 (patched distribution over npm) remains the
  proper long-term fix and is DEFERRED.
