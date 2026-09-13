# 06-local-voice-dictation — Solution

**Date**: 2026-09-13

**Status**: APPROVED (native streaming-host revision) — 2026-09-13

**Sources**: [discussion.md](discussion.md), [req.md](req.md)

## 1. Goal

Keep the proven DSH composer integration and full generic Whisper
`large-v3-turbo` quality, but replace external FFmpeg plus batch
`whisper-cli` with a DSH-owned native process. The extension spawns that process
and exchanges bounded JSON Lines. The process captures microphone audio,
retains at most 30 seconds in memory, keeps one whisper.cpp context loaded,
emits partial hypotheses, and emits one final transcript after Stop.

Build the same source for macOS Arm64 and Windows x64. Package the executable
and its required native library beside the extension; keep model weights in the
user-configured local cache.

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
  path. Its output cannot be verified until the branch is run on Windows.
- The current Mac executable is an Arm64 Mach-O of about 2.5 MiB; bundled SDL2
  is about 512 KiB and its adjacent SDL3 implementation about 2.5 MiB. `otool
  -L` shows no Homebrew Whisper/GGML dependency.
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
| Self-contained Windows runtime | Shared source and PowerShell build exist. | Build on Windows x64, copy any SDL DLL, and run the full checkpoint. |
| Controlled streaming | Host captures continuously and schedules partial inference at 750 ms. | Measure whether full-model latency coalesces updates acceptably; cadence is tunable without protocol change. |
| No temporary audio | Native host retains a bounded in-memory sample vector. | Verify cancellation/exit releases it; no filesystem cleanup remains. |
| Reproducible redistribution | Version, scripts, and notices exist. | Record Windows compiler/SDL artifact and checksums after Windows build. |

## 4. Call-site audit

| Changed contract | Call sites | Classification |
|---|---|---|
| Settings drop `ffmpegPath`/`whisperPath`, add `hostPath`. | `src/configuration.ts`, `src/dshChatView.ts`, package manifests, configuration/view tests. | **compatible after coordinated update** — experiment-only settings; default remains disabled. |
| Preflight environment gains `extensionPath`; validated options use `hostPath` and numeric `captureId`. | One production call in `DshChatView`, local dictation tests, worker Start IPC. | **compatible after coordinated update** — no public or bridge contract changes. |
| Worker switches from WAV/batch CLI to host JSONL. | `LocalDictationController` consumes the same ready/interim/complete/error IPC union. | **compatible** — controller and chrome already support interim and complete phases. |
| Runtime artifacts enter the package. | `package.json` files list and local development extension root. | **compatible** — feature remains opt-in; model remains external. |

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
6. On Windows, build the same source, package its runtime files, and complete
   the pending Windows evidence before the final verdict.
