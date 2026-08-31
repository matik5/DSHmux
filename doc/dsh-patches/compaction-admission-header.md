# Compaction Admission Header Patch

**Date**: 2026-08-31  
**Status**: Applied locally  
**Target**: `deepseek-ai/deepseek-harness`  
**Base**: `0a53fb55bea101816fa226bb964ae2bed71c343b`
(`dsh-v0.1.2-alpha.2`)  
**Local commit**: `59de2bcde480ef2d6d36ec85a1708b14a36ab39d`  
**Artifact**: [compaction-admission-header.patch](compaction-admission-header.patch)

## Problem

Harness marks the internal summarizer with
`GenerateOptions.purpose = "compaction"`, but the pi-ai adapter did not carry
that purpose to the provider request. A gateway could therefore apply its
ordinary input limit to the recovery request itself. Near the limit, the
original turn entered overflow recovery but the summarizer could be rejected by
the same admission boundary.

## Change

The pi-ai adapter now:

- sends `x-deepseek-harness-compact: 1` only for compaction-purpose requests;
- keeps the marker out of model-visible content;
- removes case-insensitive collisions from configured route headers so a route
  cannot mark every ordinary request as compaction;
- leaves ordinary provider requests unchanged apart from removing a conflicting
  reserved header.

The patch also adds focused adapter coverage and the matching Harness
documentation/Agent Notes.

## Gateway contract

A compatible gateway may use the exact header to select a recovery-specific
admission reserve. The header describes request purpose; it does not authorize
requests beyond the model's physical context window. The gateway must still
reserve output headroom and enforce the real model limit.

Gateways that ignore the header retain their previous behavior.

## Apply

The artifact is a mail-formatted Git patch. From a clean Harness checkout at the
documented base:

```sh
git apply --check /path/to/DSHmux/doc/dsh-patches/compaction-admission-header.patch
git am --3way /path/to/DSHmux/doc/dsh-patches/compaction-admission-header.patch
```

If `git am` reports a conflict, abort it and rebase the patch deliberately:

```sh
git am --abort
```

## Verify

```sh
pnpm exec vitest run packages/llm/llm-pi-ai/tests/adapter.spec.ts
pnpm run build
```

At the gateway, compare one ordinary request and one compaction request.
Only the latter should carry `x-deepseek-harness-compact: 1`.

## Upstream direction

This patch is useful only when the gateway understands the header. It should
remain an explicit Harness-to-gateway contract rather than being inferred from
prompt text or request size.
