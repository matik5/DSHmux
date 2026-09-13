# 05-managed-dependencies — Requirements

**Date**: 2026-09-13

**Status**: APPROVED (2026-09-13)

**Source**: [discussion.md](discussion.md)

## Intent

Release DSHmux 0.4.7 with a quiet first-run experience and a deterministic,
Doctor-owned installation of official DeepSeek Harness 0.1.5-rc.2. Ordinary
users must not depend on the `matik5` fork, Git, pnpm, or a source build.

## R1 — Official upstream only

- The tested DSH version remains `0.1.5-rc.2`.
- The default install source is the pinned official package
  `@deepseek-ai/dsh@0.1.5-rc.2`.
- Any retained source-checkout option uses official repository
  `https://github.com/deepseek-ai/deepseek-harness.git`, tag
  `dsh-v0.1.5-rc.2`, commit
  `fb2c4b9e698e30edb738bca4cf0618587db7d203`.
- Runtime code, UI, tests, and release docs contain no dependency on
  `matik/dsh-patches-*` or fork-only compatibility claims.

## R2 — Managed DSH repair in Doctor

- `DSHmux: Run DSH Doctor` offers one primary **Install/Repair DSH** action
  when the tested DSH is absent or unusable.
- After an explicit confirmation showing package, version, and destination,
  Doctor installs the pinned package into extension-managed global storage on
  the workspace host. It does not require administrator rights or modify the
  user's global npm prefix.
- The install has visible progress/log output, a bounded failure result, and
  can be cancelled where the underlying process permits safe cancellation.
- Doctor verifies the resulting CLI with `--version` before accepting it,
  persists/selects only the verified managed path, refreshes its report, and
  lets the normal launcher start flow resume.
- Re-running repair is idempotent. A partial/failed managed install is not
  reported as ready and can be repaired by running the same action again.
- Existing valid global, npx-cache, source, and custom DSH installations remain
  supported and are not overwritten automatically.

## R3 — Accurate prerequisite handling

- Node remains a Doctor check because official DSH is a Node program.
- For DSH 0.1.5-rc.2, Doctor accepts Node `^22.19.0 || >=24.0.0`; Node 20 is
  never described as sufficient.
- A missing or unsupported Node is shown inside Doctor as the prerequisite
  blocking DSH repair, with one official guidance action. DSHmux does not
  silently invoke `winget`, Chocolatey, an OS installer, elevation, or another
  system package manager.
- Git and pnpm are checked only for the optional source-checkout path. They do
  not affect ordinary readiness and do not generate launcher warnings.
- Doctor prioritizes the actionable DSH result: the launcher never expands
  missing Node/Git/pnpm into separate notices.

## R4 — Compact launcher dependency UX

- When Doctor says the runnable DSH dependency is absent or broken, the
  launcher shows exactly one compact control: **Missing deps · Fix** (localized
  in all supported locales).
- Activating **Fix** opens the full DSH Doctor. It does not install anything
  directly from the launcher.
- The old large setup panel, source link, separate prerequisite links,
  primary/alternative install buttons, and repeated warning rows are removed
  from the launcher.
- There is never more than one missing-dependency control after any number of
  Doctor refreshes or `view-ready` handshakes.
- A stale configured path and version compatibility information remain visible
  in Doctor, not as launcher banners.
- A runnable older/newer DSH stays usable. The launcher shows normal ready
  state without the old multi-line compatibility notice.

## R5 — Release and compatibility

- Bump extension version to `0.4.7` and add release notes describing the
  official managed install and simplified dependency UX.
- Preserve workspace-host semantics for Remote SSH, WSL, and Dev Containers:
  detection and managed install happen on the extension host, not the UI host.
- Preserve startup, session management, bridge/auth, update-channel, and
  custom `dshmux.dshPath` behavior outside the dependency flow.

## Acceptance criteria

1. Clean Windows host with supported Node/npm but no DSH: launcher renders one
   **Missing deps · Fix** control; Fix opens Doctor; confirmed repair installs
   and verifies official `0.1.5-rc.2`; refresh reaches ready.
2. Missing/old Node: launcher still renders only that one control; Doctor gives
   one accurate Node prerequisite result and does not attempt DSH installation.
3. Valid non-managed DSH: no repair or compatibility banner appears and DSH
   starts as before.
4. Stale `dshmux.dshPath`: discovery/managed repair remains available without
   duplicating launcher notices.
5. Repeated Doctor messages never duplicate controls.
6. Repository search finds no runtime/test reference to the fork patch branch
   or “patched source recommended” flow.
7. Compile, unit tests, smoke test, and VSIX packaging pass for 0.4.7.

## R2 amendment — visible install choices

**Status**: APPROVED (2026-09-13, user clarification)

This amendment supersedes R2's single hidden-globalStorage destination, while
retaining its confirmation, logging, cancellation, pinning, and verification
requirements.

- Doctor offers two install choices: global npm installation, or a
  project-specific installation.
- Project-specific installation defaults to
  `<workspace>/.dshmux/managed-dsh/0.1.5-rc.2`.
- The dialog displays that exact path and has a **Change…** action.
- **Change…** selects a parent directory for a normal official checkout at
  `<selected>/deepseek-harness`; it does not create `.dshmux` there.
- The checkout uses official tag `dsh-v0.1.5-rc.2`, installs with the upstream
  pinned pnpm version, builds, verifies `apps/cli/lib/bin.js`, and becomes the
  remembered workspace-host DSH candidate.
- The modal supplies no explicit Cancel action because VS Code provides the
  native Cancel button.
- Existing extension-globalStorage installs remain discoverable as a legacy
  fallback, but are no longer the default destination.
