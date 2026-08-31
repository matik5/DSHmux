# Provider-Compatible JPEG Request Images Patch

**Date**: 2026-08-31  
**Status**: Implemented and verified in the local Harness working tree  
**Target**: `deepseek-ai/deepseek-harness`  
**Base**: `0a53fb55bea101816fa226bb964ae2bed71c343b`
(`dsh-v0.1.2-alpha.2`)  
**Artifact**: [request-image-jpeg-compatibility.patch](request-image-jpeg-compatibility.patch)

## Problem

A source PNG can be valid while the provider still rejects the later model
request. Harness's durable normalization preserves transparency as WebP. Its
request transform previously also selected WebP for alpha images, so a PNG
loaded by `read_image` could reach an OpenAI-compatible endpoint as:

```text
data:image/webp;base64,...
```

llama.cpp-derived endpoints that do not decode WebP can then return a generic
HTTP 400 such as:

```text
Failed to load image or audio file
```

The DSHmux bridge cannot repair this payload because internal tool attachments
travel directly from Harness to the provider adapter.

## Change

The request-image transform now uses JPEG whenever it must create a
provider-facing variant:

- every stored WebP is projected to JPEG, even when already inside route pixel
  and byte budgets;
- resized or recompressed PNG/JPEG images are projected to JPEG;
- transparent pixels are composited over white before JPEG encoding;
- generated request variants are verified as 8-bit sRGB JPEG without alpha;
- the request-image cache identity is bumped to `request-image-v6`.

Durable attachments remain provider-independent and retain WebP transparency.
An in-budget stored PNG or JPEG still passes through unchanged.

## Scope and tradeoff

This is a pragmatic compatibility patch for the endpoint used by DSHmux. It
sacrifices transparency in the provider-facing copy and may make screenshot
payloads larger than WebP. It does not modify the original file or the durable
Harness attachment.

The more general upstream design is route-level media-type negotiation: a route
declares whether its endpoint accepts PNG, JPEG, and WebP, and Harness chooses a
compatible representation. See upstream
[Discussion #4420](https://github.com/deepseek-ai/deepseek-harness/discussions/4420).
If that design lands upstream, prefer it and retire this broad JPEG fallback.

## Apply

This artifact is a raw Git diff, intentionally separate from the local
compaction commit. From a clean Harness checkout at the documented base:

```sh
git apply --check /path/to/DSHmux/doc/dsh-patches/request-image-jpeg-compatibility.patch
git apply /path/to/DSHmux/doc/dsh-patches/request-image-jpeg-compatibility.patch
```

## Verify

```sh
pnpm exec vitest run packages/attachment/attachment-local/tests
pnpm exec tsc -b packages/attachment/attachment-local/tsconfig.json
pnpm run test:snapshot -- -t read-image-reencode
pnpm run build
```

The implementation was verified with 69 passing attachment tests, 110 passing
snapshot tests (two skipped), a successful package TypeScript build, and a
successful full Harness build.

The original Blender reproduction produced a 1280×960 request JPEG of 53,754
bytes with no alpha instead of the provider-incompatible WebP.

## Activate in DSHmux

After applying the patch:

1. Build Harness.
2. Set `dshmux.dshPath` to that checkout's built
   `apps/cli/lib/bin.js`.
3. Stop the currently running DSH process from DSHmux.
4. Start DSH again so Node loads the rebuilt modules.

Existing durable WebP attachments are converted when their next provider request
is assembled, so an existing session can be retried after restart.
