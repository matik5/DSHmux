# DSH 0.1.7-rc.1 support — Verification

**Date**: 2026-09-24

| Requirement | Plan coverage | Implemented call path | Evidence |
|---|---|---|---|
| R1 | T1 | `assembleDocument` calls both plugin rewriters and the static matcher; side chat and editor panel call `assembleDocument`. | `npm test`: 255 passed, one skipped; live patched server assembly: 3 plugin preload references and 65 boot URLs, zero relative plugin URLs, dark favicon rewritten. |
| R2 | T2 | `LocalAttachmentStore.readImageRequest` calls `readRequestImageFile`; both user and tool-result images use prepared request versions in the DeepSeek serializer. | 93 attachment tests passed, one skipped; focused 16 request-image tests passed; read-image snapshot passed; Harness build and package TypeScript build passed. |
| R3 | T3 | `runManagedInstall` calls `chooseManagedInstall`, then clones and verifies `PATCHED_SOURCE_REVISION` before `pnpm install` and build. `activate` prefers the remembered exact-version source bin. | 79 focused DSHmux tests passed; published fork ref equals `67ddcb32a7cf8ec2e8f028979d3bebe7588b5bc0`. |
| R4 | T4 | Version constant drives Doctor, path discovery, and compatibility display; README and changelogs describe installation. | `npm test` and Harness `doc-sync` (42 gates passed). |

No unmet requirement was found. The real server check covers startup, authenticated index retrieval, asset caching, and URL assembly. It does not operate a VS Code Extension Development Host or an external image provider; the request-image encoder and serialized snapshot tests cover those code paths without provider credentials.
