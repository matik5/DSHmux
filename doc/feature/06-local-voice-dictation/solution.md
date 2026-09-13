# 06-local-voice-dictation — Solution

**Date**: 2026-09-13

**Status**: DRAFT (managed-model revision; awaiting approval) — 2026-09-13

**Sources**: [discussion.md](discussion.md), [req.md](req.md)

## 1. Goal

Keep the proven DSH composer integration and full generic Whisper
`large-v3-turbo` quality with the DSH-owned native process. Add one managed
model location shared by the macOS and Windows implementations:
`~/.dshmux/models/ggml-large-v3-turbo.bin`. Enabling the experiment ensures the
model exists there through an HTTPS, streaming, checksum-verified, atomic
download. Disabled dictation performs no model or network work.

Build the same source for macOS Arm64 and Windows x64. Package the executable
and its required native library beside the extension; keep model weights in the
managed user cache outside the extension.

## 2. Facts

### Existing integration

- `src/dshChatView.ts:460-576` gates the experiment, runs preflight, owns one
  controller, and forwards transcript events to the webview.
- `src/localDictation.ts:248-425` fences Start/Stop/Cancel by generation in a
  crash-isolated Node worker.
- `media/chat-chrome.js:385-415` renders interim text only as status and inserts
  only the complete transcript into the existing editable composer. It does not
  invoke Send.
- The earlier external CLI backend passed live macOS English and Estonian tests
  with the full model. Windows evidence remains pending.

### Current model configuration and lifecycle

- `src/configuration.ts:74-91` exposes `modelPath` as part of
  `LocalDictationConfiguration` and reads the machine-scoped explicit path.
- `package.json:143-153` contributes the `modelPath` setting; the English and
  Chinese package strings say DSHmux never downloads or copies the model.
- `src/localDictation.ts:141-171` performs read-only preflight. It requires an
  absolute readable `settings.modelPath` and has no download, checksum, cache,
  partial-file, or atomic-rename behavior.
- `src/dshChatView.ts:477-512` calls preflight only after the user presses the
  dictation control. `src/dshChatView.ts:146-154` currently reacts to a setting
  change only by cancelling dictation and refreshing the view.
- `src/extension.ts:115-155` constructs `DshChatView` during extension
  activation even before the webview is resolved. Its constructor is therefore
  an available owner for enabled-at-startup model setup without activating the
  microphone or DSH bridge.
- No current source file implements a Whisper model downloader or resolves
  `~/.dshmux/models`.
- The Windows checkpoint downloaded and verified the full model at
  `%LOCALAPPDATA%/DSHmux/models/ggml-large-v3-turbo.bin`; its size is
  1,624,555,275 bytes and SHA-1 is
  `4af2b29d7ec73d781377bfd1758ca957a807e941`. It is outside the repository but
  not yet at the approved canonical path.

### Native runtime and API

- whisper.cpp v1.9.2 exposes `whisper_init_from_file_with_params()` and
  `whisper_full()` through its C API. Its official stream example uses SDL2
  microphone capture but owns a fixed example loop rather than a stable process
  protocol.
- `native/dictation-host/src/main.cpp` now owns SDL2 callback capture and calls
  the Whisper C API directly. Audio callback cadence and inference cadence are
  separate.
- The host accepts the model, language, SDL capture id, and partial interval as
  argument-array values and accepts only `stop`/`cancel` JSONL commands on
  stdin. Stdout contains only protocol events; native diagnostics remain on
  ignored stderr.
- `src/localDictationWorker.ts` is the protocol adapter. It validates JSONL,
  caps buffered stdout at 1 MiB, maps partial/final events to the existing IPC
  contract, and terminates the host on cancellation or protocol failure.

### Build and packaging

- The user-approved external source checkout is pinned to whisper.cpp v1.9.2
  (`306c88f4`). Its machine-local path is not stored or copied into DSHmux.
- `native/dictation-host/CMakeLists.txt` builds whisper/GGML statically and
  disables machine-native CPU assumptions. Homebrew `sdl2-compat` and the SDL3
  library it dynamically loads are the only non-system Mac runtime libraries.
- `native/dictation-host/build-macos.sh` produces
  `runtime/darwin-arm64/dsh-dictation-host`, copies SDL2 beside it, and rewrites
  the load path to `@executable_path`.
- `native/dictation-host/build-windows.ps1` defines the same x64 build and copy
  path. It has been run with Visual Studio Community 2026/MSVC 19.51 against
  official SDL 2.32.10 and copies both the host and SDL2 DLL into the runtime.
- The current Mac executable is an Arm64 Mach-O of about 2.5 MiB; bundled SDL2
  is about 512 KiB and its adjacent SDL3 implementation about 2.5 MiB. `otool
  -L` shows no Homebrew Whisper/GGML dependency.
- The current Windows executable is an x64 Windows CUI PE of about 2.0 MiB.
  Whisper/GGML and the MSVC runtime are static; its only non-system import is
  the adjacent official SDL2 DLL. Deterministic MSVC path mapping removes local
  checkout/build paths from both packaged artifacts.
- `package.json` includes `runtime/**`; `runtime/THIRD_PARTY_NOTICES.md` records
  whisper.cpp/OpenAI MIT and SDL2 zlib notices. The model is excluded.

### Licenses

- whisper.cpp and OpenAI Whisper are MIT licensed; SDL2 is zlib licensed.
  Modification, linking, and binary redistribution are allowed when the
  relevant license/copyright notices accompany the runtime.

## 3. Gap

| Goal | Current fact | Gap/action |
|---|---|---|
| Self-contained Mac runtime | Mac host and adjacent SDL dylib build successfully. | Run live microphone partial/final test through the extension. |
| Self-contained Windows runtime | The x64 host and adjacent SDL2 DLL build, package, and pass startup/model-load checks. | Run the live microphone/composer checkpoint when Windows exposes a capture endpoint. |
| Controlled streaming | Host captures continuously and schedules partial inference at 750 ms. | Measure whether full-model latency coalesces updates acceptably; cadence is tunable without protocol change. |
| No temporary audio | Native host retains a bounded in-memory sample vector. | Verify cancellation/exit releases it; no filesystem cleanup remains. |
| Reproducible redistribution | Mac and Windows toolchains, artifacts, dependencies, sizes, and checksums are recorded. | Retain the evidence while managed-model changes are verified. |
| Managed model cache | Preflight requires a user-entered `modelPath`; there is no downloader. | Add one streaming model manager for `~/.dshmux/models`, remove `modelPath`, and invoke it on enable/startup and before recording. |
| Safe installation | No partial-file, size/hash, cancellation, or atomic publish behavior exists. | Download to a sibling partial file, bound bytes, verify the published size/SHA-1, then rename; clean partial data on every failure/cancel path. |
| Existing Windows model | Verified model is under `%LOCALAPPDATA%/DSHmux/models`. | Move it to `~/.dshmux/models` after re-verifying identity; do not place it in the repo or package. |

## 4. Call-site audit

| Changed contract | Call sites | Classification |
|---|---|---|
| Settings drop `ffmpegPath`/`whisperPath`, add `hostPath`. | `src/configuration.ts`, `src/dshChatView.ts`, package manifests, configuration/view tests. | **compatible after coordinated update** — experiment-only settings; default remains disabled. |
| Preflight environment gains `extensionPath`; validated options use `hostPath` and numeric `captureId`. | One production call in `DshChatView`, local dictation tests, worker Start IPC. | **compatible after coordinated update** — no public or bridge contract changes. |
| Worker switches from WAV/batch CLI to host JSONL. | `LocalDictationController` consumes the same ready/interim/complete/error IPC union. | **compatible** — controller and chrome already support interim and complete phases. |
| Runtime artifacts enter the package. | `package.json` files list and local development extension root. | **compatible** — feature remains opt-in; model remains external. |
| Settings drop `modelPath` and use a canonical managed cache. | `localDictationSettings()` callers in `src/dshChatView.ts:461,488`; production `preflightLocalDictation()` call at `src/dshChatView.ts:489`; configuration, preflight, and view tests. | **compatible after coordinated update** — the setting is experimental and machine-scoped; the worker continues to receive an absolute validated `modelPath`. |
| Enabling dictation starts model setup. | `DshChatView` constructor and configuration listener at `src/dshChatView.ts:118-156`; dictation start at `src/dshChatView.ts:477-512`. | **compatible after coordinated update** — setup is gated by enabled/local/supported checks, does not touch the microphone, and start awaits the same shared in-flight operation. |

No caller requires the removed external FFmpeg/CLI semantics. The normal DSH
bridge, composer Send action, session management, and disabled path are
unchanged.

## 5. Tasks

1. Add the portable CMake host, JSONL protocol, bounded SDL capture, direct
   Whisper inference, platform build scripts, and notices.
2. Resolve the bundled target host during preflight and retain an explicit
   override for development.
3. Replace WAV/batch worker behavior with the bounded host-protocol adapter.
4. Update settings, tests, packaging, and feature documentation.
5. Build and verify Mac runtime plus live extension behavior.
6. Add `src/localDictationModel.ts` with injectable filesystem/download I/O.
   Resolve `~/.dshmux/models/ggml-large-v3-turbo.bin`, stream HTTPS bytes to a
   sibling partial file, reject overflow, verify exact size and SHA-1, and
   atomically rename only verified content. Share one in-flight ensure, support
   cancellation/disposal, and never start while disabled, remote, or on an
   unsupported platform.
7. Remove the experimental `modelPath` setting and localized descriptions.
   Have preflight derive and validate only the canonical path while preserving
   the worker's existing absolute `ValidatedDictationOptions.modelPath`
   contract.
8. Make `DshChatView` start managed setup when enabled at activation or by a
   configuration change, expose cancellable VS Code notification progress, and
   await the same setup before microphone start. Cancellation and download
   failure remain bounded and do not affect ordinary chat.
9. Add deterministic tests for disabled/no-network behavior, macOS and Windows
   canonical paths, valid-cache reuse, redirect/stream success, overflow,
   checksum mismatch, cancellation, partial cleanup, atomic publish,
   single-flight behavior, configuration removal, and view lifecycle wiring.
10. Move the currently verified Windows model to the canonical cache, rerun
    compile/tests/package audits, and continue the pending Windows live
    microphone checkpoint when a capture endpoint is available.
