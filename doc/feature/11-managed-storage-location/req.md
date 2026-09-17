# Managed Storage Location — Requirements

**Date**: 2026-09-17
**Status**: APPROVED (2026-09-17)
**Sources**: [discussion.md](discussion.md)

## Requirements

### R1 — User-level default storage root

Doctor-managed installs of DSH and pnpm default to the user-level directory
`<homedir>/.dshmux` on the workspace host:

- managed DSH: `<homedir>/.dshmux/managed-dsh/<tested-version>/...`
- managed pnpm: `<homedir>/.dshmux/managed-pnpm/<tested-version>/...`

The homedir is that of the machine running the workspace extension host
(local machine today; the remote machine under Remote SSH/WSL). The inner
directory names `managed-dsh` / `managed-pnpm` and the versioned layout stay
unchanged.

### R2 — Explicit location keeps precedence

A location explicitly chosen through the install dialog (remembered per
workspace) still takes precedence over the `~/.dshmux` default, and applies
to both DSH and pnpm, which share one storage root.

### R3 — Legacy locations remain discoverable fallbacks

Existing managed installs in older default locations must keep working
without a re-download:

- project-local `<workspace>/.dshmux/...` (0.4.8 default),
- VS Code `globalStorageUri` managed install (0.4.7 default).

Discovery is read-only: Doctor and the launcher accept a legacy install that
verifies as the tested version, but no install action ever writes to a
legacy location.

### R4 — No migration, no cleanup

DSHmux must not migrate, move, or offer to delete stale copies in legacy
locations. They remain inert fallbacks; removing them is the user's
responsibility.

### R5 — Visible destination for the pnpm install

The pnpm install action must show the exact destination path before
installing (matching the existing DSH repair confirmation), so the user
always sees where managed files will be written.

### R6 — Candidate order

The effective resolution order for the managed DSH candidate is:

1. remembered explicit location (Change…)
2. `~/.dshmux` (new default)
3. legacy project `<workspace>/.dshmux`
4. legacy VS Code `globalStorageUri`
5. configured path / global discovery (unchanged)

The pnpm candidate is derived from the same storage root as the DSH
candidate.

## Acceptance criteria

- **A1 (R1)**: With no remembered location, a fresh install (DSH or pnpm)
  writes under `<homedir>/.dshmux/...` on the workspace host; the open
  project directory receives no new files.
- **A2 (R2)**: After choosing a custom location once, subsequent managed
  installs (DSH and pnpm) target that location, not `~/.dshmux`.
- **A3 (R3)**: A machine with an existing project-local or globalStorage
  managed install and no `~/.dshmux` launches and reports readiness using
  that existing install without re-downloading; a new confirmed install
  targets the default or explicit root, never the legacy location.
- **A4 (R4)**: No code path moves, deletes, or prompts about files in
  legacy locations.
- **A5 (R5)**: Clicking the pnpm install action first shows the exact
  destination; the install starts only after confirmation.
- **A6 (R6)**: Doctor and launcher agree on the candidate order above.
- **A7**: `npm run compile` and `npm test` pass; locale parity holds.

## Non-goals

- No change to the global npm install choice or the source checkout flow.
- No change to version pinning, install commands, or verification logic.
- No automatic cleanup or migration UI.
