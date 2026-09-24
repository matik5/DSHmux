# DSH 0.1.7-rc.1 support — Solution

## Goal

Run the patched 0.1.7-rc.1 Harness in DSHmux and load its Web UI and image requests correctly.

## Facts

- `src/documentAssembly.ts:81-94,146-181,260-262` owns favicon, plugin preload, and boot URL rewriting for both the side chat and editor panel. The 0.1.7 URLs are base-relative; current source handles all three reference forms after the change.
- `src/dshInstallService.ts:7-49,215-252` pins source repositories and builds a versioned checkout path. `src/installService.ts:490-559` presents the Doctor choice; `src/versionCheck.ts:10` owns the tested version.
- Harness `packages/attachment/attachment-local/src/request-image.ts` owns request-image pass-through, transform, and cache identity. Upstream 0.1.7-rc.1 still routes alpha transforms to WebP; the patch uses JPEG over white and changes the variant identity. Durable normalization stays unchanged.
- Callers of `rewriteBootPluginUrls` and `rewriteBootPluginPreloads`: `assembleDocument` and their tests. Their string-in/string-out contracts stay the same. `chooseManagedInstall` is called by `runManagedInstall`; its return type is unchanged. `readRequestImageFile` is called by `LocalAttachmentStore`; its result type is unchanged.

## Gap

DSHmux misses relative plugin URLs, and the official Harness can send provider-incompatible WebP. Doctor still defaults to the official package.

## Tasks

1. Normalize plugin references and favicon URLs in `src/documentAssembly.ts:81-181`; test both URL forms in `test/documentAssembly.test.js`.
2. Patch Harness request projection and its cache identity in `packages/attachment/attachment-local/src/request-image.ts`; test real image encoders.
3. Pin DSH 0.1.7-rc.1 and the patched branch in `src/dshInstallService.ts:7-49`, use a versioned checkout, and make `src/installService.ts:490-559` select it by default.
4. Update version strings, English/Chinese guides, focused tests, and integration verification.
