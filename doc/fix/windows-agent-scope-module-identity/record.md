# Windows agent-scope module identity

**Date:** 2026-09-13
**Branch:** `fix/patched-source-option`

## Symptom

Submitting a prompt through DSHmux could return `session/agent-busy` with the
hidden reason `file-upload: operation requires the Agent's own scope`, including
for a new session and a text-only prompt.

## Root cause

The relay delivered the request to DSH; DSH rejected it in
`dsh-client-file-upload`. The running source checkout and its profile fallback
junctions contained both `C:\proj\...` and `c:\proj\...` module paths. Node on
Windows assigned different ESM cache identities to those URLs. Consequently,
`@deepseek-ai/dsh-scope` was evaluated twice and each evaluation owned a
different private `Symbol('dsh.scope')`. A context tagged by one copy was
unscoped when inspected by the other.

This explains why DSHmux 0.4.6 with the published npm DSH package could work at
the same nominal `0.1.5-rc.2` version: the package installation did not use the
source workspace's mixed-case pnpm junction graph.

## Changes

- Canonicalize source checkout drive letters before install and launch.
- On Windows source repair, run `pnpm install --frozen-lockfile --force` so stale
  mixed-case workspace links are recreated. macOS and Linux retain the existing
  `pnpm install --frozen-lockfile` command.
- Restore `matik5/deepseek-harness` branch
  `matik/dsh-patches-0.1.5-rc.2` as a separately selectable, revision-pinned
  source build without removing the official upstream and global choices.
- Detect the exact hidden RPC reason, log it, and show one recommendation that
  opens DSHmux Doctor where the patched build can be selected.

## Verification

- `npm test`: 221/221 passed.
- Targeted changed-area suite: 89/89 passed.
- The module-identity probe confirmed that importing the same scope module via
  lower- and upper-case drive URLs produces distinct exported function
  identities on Windows.
- The fork branch head was verified as
  `5f54644c4fcc83e18bc6cbf8055997390cc21969` before pinning.
