# DSH 0.1.7-rc.1 support — Implementation Plan

**Date**: 2026-09-24

**Sources**: [discussion.md](discussion.md), [req.md](req.md), [solution.md](solution.md)

| Requirement | Task | Verification |
|---|---|---|
| R1 | T1 | Document assembly tests and real 0.1.7 index probe |
| R2 | T2 | Attachment encoder tests and build |
| R3 | T3 | Install service tests and pinned revision check |
| R4 | T4 | Version tests, docs, close-out audit |

### T1 — Rewrite the 0.1.7 boot document

Status: ✅ done

Files: `src/documentAssembly.ts:81-181`, `test/documentAssembly.test.js:87`.

- [x] Normalize `/plugins/`, `./plugins/`, and `plugins/` in preloads, entries, and batches.
- [x] Rewrite `favicon-dark.svg` and preserve absolute URL behavior.

```ts
item.url = serverPluginUrl(item.url, serverBase) ?? item.url;
```

**Completion criteria**: No relative plugin reference survives document assembly.

### T2 — Patch Harness request images

Status: ✅ done

Files: `packages/attachment/attachment-local/src/request-image.ts:26-209`, `packages/attachment/attachment-local/tests/request-image.spec.ts:240-294` in the Harness worktree.

- [x] Use JPEG over white for WebP and transformed request images.
- [x] Bump request variant identity and verify real encoded bytes.

```ts
pipeline(attachment, target).flatten({ background: '#ffffff' }).jpeg({ quality });
```

**Completion criteria**: Model-request bytes are JPEG when the durable image is WebP.

### T3 — Pin and select the patched build

Status: ✅ done

Files: `src/dshInstallService.ts:7-49,215-252`, `src/installService.ts:490-559`, `src/versionCheck.ts:10`, associated tests.

- [x] Pin tag, branch, and exact patched commit.
- [x] Default Doctor to the patched checkout and keep the official npm choice.

```ts
let sourceKind: "official" | "patched" = "patched";
```

**Completion criteria**: Doctor selects the patched source in a versioned directory; exact revision is checked before building.

### T4 — Verify and document

Status: ✅ done

Files: `README.md`, `README.zh.md`, `CHANGELOG.md`, `doc/feature/12-dsh-017-support/verification.md`.

- [x] Update user guidance and tested version strings.
- [x] Run focused tests and a built Harness smoke.

```text
npm test
pnpm exec vitest run packages/attachment/attachment-local/tests
```

**Completion criteria**: All acceptance paths have evidence and the close-out audit identifies any remaining gap.

## Order

```text
T1 ─┐
T2 ─┼─> T4
T3 ─┘
```

*Related documents: discussion.md | req.md | solution.md*
