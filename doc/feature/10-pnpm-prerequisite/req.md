# pnpm Prerequisite — Requirements

**Date**: 2026-09-15
**Status**: Approved by user on 2026-09-15
**Source**: [discussion.md](discussion.md)

## Requirements

### R1 — Explicit pnpm health check

The DSHmux Doctor must report pnpm as a separate check entry, including its
detected version when runnable and a clear not-found result otherwise.

### R2 — Version compatibility

The pnpm check must require the DSHmux-tested pnpm version declared by the
application. A missing, unrunnable, or incompatible pnpm version must not pass
the prerequisite check.

### R3 — Installation gate

DSH managed repair/install must not start unless Node, npm, and the compatible
pnpm prerequisite checks all pass.

### R4 — pnpm install option

When Node and npm pass but pnpm does not, Doctor must offer a pnpm installation
action. The action must install the DSHmux-tested pnpm version using the
already-resolved Node/npm toolchain, report failure without continuing to DSH
installation, and rerun Doctor after success.

### R5 — Platform-safe execution

Detection, installation, and subsequent managed DSH source commands must not
depend on PowerShell script execution policy or on npm's temporary `npm exec`
binary discovery. Windows command shims and paths containing spaces must be
handled safely without shell-flattened arguments.

### R6 — Existing prerequisite ordering

Doctor actions must remain ordered: repair Node first, then npm, then pnpm, then
DSH. A runnable compatible DSH remains usable according to the existing Doctor
policy even if setup-only tooling is absent.

### R7 — Localized UI

The pnpm row, pnpm state, install action, progress, and failure messages must be
available through the existing localization system for every currently
supported locale.

### R8 — Regression coverage

Automated tests must cover pnpm detection, compatible and incompatible
versions, action selection, installation success/failure, DSH-install gating,
Windows-safe invocation, and preservation of existing ready/Node/npm/DSH
behavior.

## Acceptance criteria

1. Doctor visibly lists Host, Node, npm, pnpm, and DSH.
2. With pnpm missing or incompatible, Doctor offers pnpm installation and does
   not offer or begin DSH repair.
3. The install action provisions exactly the declared tested pnpm version.
4. A successful pnpm install automatically refreshes Doctor and makes DSH
   repair available when all other prerequisites pass.
5. A failed or cancelled pnpm install leaves DSH untouched and presents an
   actionable failure result/log.
6. Managed DSH installation invokes the verified pnpm installation directly,
   rather than obtaining pnpm independently through `npm exec`.
7. The compile and complete automated test suite pass.

## Out of scope

- Changing the tested pnpm version from 11.7.0.
- Installing or upgrading Node.js/npm automatically.
- Modifying an already working external DSH installation solely because pnpm
  is absent.
- Changing DSH's post-install runtime behavior.
