# Local Voice Dictation — Implementation Plan

**Date**: 2026-09-13
**Sources**: [discussion.md](discussion.md), [req.md](req.md), [solution.md](solution.md)
**Status**: APPROVED (managed-model revision) — 2026-09-14

## RTTM

| Requirement | Task | Verification |
|---|---|---|
| R1, R2 | T1, T4, T9, T10 | Separate Mac and Windows results; final verdict waits for both. |
| R3 | T1, T2, T5, T6, T8 | Pinned runtime; canonical external cache; atomic verified download; package exclusion. |
| R4 | T2, T3, T7, T9 | Setup plus Start/partial/Stop/final/cancel through the existing composer path. |
| R5 | T1, T3, T5, T7 | Opt-in single-flight model setup; bounded native process; disabled path has no work. |
| R6 | T4, T8, T9, T10 | Deterministic, live, offline, package, performance, and close-out evidence. |
| R7 | T11 | Manifest test verifies ordered blocks, membership, titles, and preserved keys. |

### T1 — Build the DSH native streaming host

**Status**: ✅ done (macOS and Windows artifacts)

**Files**:

- `native/dictation-host/CMakeLists.txt:1`
- `native/dictation-host/src/main.cpp:1`
- `native/dictation-host/build-macos.sh:1`
- `native/dictation-host/build-windows.ps1:1`
- `runtime/THIRD_PARTY_NOTICES.md:1`

- [x] Link a pinned whisper.cpp v1.9.2 checkout through CMake without vendoring it.
- [x] Capture mono 16 kHz float audio through SDL2 callbacks.
- [x] Retain no more than 30 seconds of audio and create no recording file.
- [x] Keep one Whisper context loaded for the recording lifetime.
- [x] Separate continuous capture from configurable partial inference cadence.
- [x] Emit only bounded JSONL `ready`, `partial`, `final`, `cancelled`, and
  `error` events; accept only Stop and Cancel commands.
- [x] Add Mac and Windows build/copy scripts plus redistribution notices.
- [x] Build the Mac Arm64 executable with statically linked Whisper/GGML and a
  relative adjacent SDL2 dylib.

```cpp
emit("{\"event\":\"ready\"}");
// Capture continues in SDL while inference runs on snapshots.
transcribe(context, options, capture.snapshot(), partial);
```

**Completion criteria**: Mac artifact is executable and has no Homebrew
Whisper/GGML load dependency; the same source has an explicit Windows x64 build
path; protocol and memory bounds are visible in called code.

### T2 — Resolve and spawn the bundled platform host

**Status**: ✅ done

**Files**:

- `src/configuration.ts:73`
- `src/dshChatView.ts:485`
- `src/localDictation.ts:35`
- `package.json:28,120`
- `package.nls.json:12`
- `package.nls.zh-cn.json:12`

- [x] Replace external FFmpeg/whisper-cli settings with optional `hostPath`.
- [x] Default to `runtime/darwin-arm64/dsh-dictation-host` or
  `runtime/win32-x64/dsh-dictation-host.exe` under the extension root.
- [x] Validate the managed canonical model and target host before spawn.
- [x] Convert optional microphone configuration to an SDL capture id.
- [x] Include runtime files in the local extension package while excluding the
  model.

```ts
path.join(environment.extensionPath, "runtime", target, executable)
```

**Completion criteria**: deterministic preflight tests cover both platforms,
override validation, model validation, device validation, and disabled/remote
gates.

### T3 — Adapt the worker to the native JSONL API

**Status**: ✅ done

**Files**:

- `src/localDictationWorker.ts:1`
- `src/localDictation.ts:174`
- `test/localDictationWorker.test.js:1`
- `test/localDictation.test.js:1`

- [x] Spawn the host with argument arrays and `shell: false`.
- [x] Bound stdout buffering to 1 MiB and reject malformed events.
- [x] Map host partial/final output to the existing interim/complete IPC union.
- [x] Send Stop/Cancel over stdin and kill the host on cancellation, failure,
  timeout, disposal, or parent disconnect.
- [x] Keep native stderr private and emit only sanitized errors and metrics.
- [x] Preserve the existing generation fence and one-session controller.

```ts
spawn(options.hostPath, ["--model", options.modelPath, "--language", language], {
  shell: false,
  stdio: ["pipe", "pipe", "ignore"],
});
```

**Completion criteria**: fake-host tests prove exact safe arguments,
ready/partial/final mapping, metrics, malformed-event rejection, and clean exit.

### T4 — Verify the Mac implementation and package

**Status**: ✅ done

**Files**:

- `runtime/darwin-arm64/dsh-dictation-host`
- `runtime/darwin-arm64/libSDL2-2.0.0.dylib`
- `runtime/darwin-arm64/libSDL3.dylib`
- `doc/feature/06-local-voice-dictation/verification.md`

- [x] Compile the native host and TypeScript.
- [x] Run focused lifecycle/protocol/configuration/view tests.
- [x] Run the DSHmux-scoped full test suite and inspect package
  contents/dependencies.
- [x] Exercise live Mac partial and final transcript insertion with the cached
  full `large-v3-turbo` model.
- [x] Verify Stop, Cancel, no auto-Send, and no temporary audio file.

```sh
native/dictation-host/build-macos.sh
npm test
npx vsce ls
```

**Completion criteria**: automated/package checks pass and the user confirms
the native host retains the earlier Mac quality and composer behavior.

### T5 — Implement the managed model cache and downloader

**Status**: ✅ done

**Files**:

- `src/localDictationModel.ts:1` (new)
- `test/localDictationModel.test.js:1` (new in T8)

- [x] Define the canonical filename, byte length `1624555275`, published SHA-1
  `4af2b29d7ec73d781377bfd1758ca957a807e941`, and HTTPS source URL.
- [x] Resolve both macOS and Windows to
  `path.join(homePath, ".dshmux", "models", "ggml-large-v3-turbo.bin")`.
- [x] Validate an existing canonical file by exact size and streamed SHA-1;
  reuse it without invoking network I/O.
- [x] Stream the response to a sibling partial file while hashing and counting
  bytes; reject non-HTTPS redirects, excessive redirects, non-2xx status,
  overflow, short content, and checksum mismatch.
- [x] Publish only verified bytes with a same-directory rename. Remove partial
  data on failure, cancellation, and disposal without deleting a previously
  verified canonical file.
- [x] Share one in-flight ensure operation so activation, settings changes, and
  Start cannot race duplicate downloads.
- [x] Keep filesystem, HTTP, progress, and cancellation boundaries injectable
  for deterministic tests; add no production dependency.

```ts
export const MODEL_FILE = "ggml-large-v3-turbo.bin";
export function managedModelPath(homePath: string): string {
  return path.join(homePath, ".dshmux", "models", MODEL_FILE);
}
// stream -> sibling .part -> exact size/SHA-1 -> same-directory rename
```

**Completion criteria**: called code guarantees canonical cross-platform path,
no network for a valid cache, bounded streaming memory, verified atomic publish,
single-flight behavior, and cleanup on every terminal path.

### T6 — Replace explicit model configuration with canonical preflight

**Status**: ✅ done

**Files**:

- `src/configuration.ts:74-91`
- `src/localDictation.ts:35-171`
- `package.json:120-158`
- `package.nls.json:12-16`
- `package.nls.zh-cn.json:12-16`
- `test/configuration.test.js:104-130`
- `test/localDictation.test.js:22-116`

- [x] Remove `modelPath` from `LocalDictationConfiguration`, configuration
  reads, the contributed setting, and both localized setting descriptions.
- [x] Add `homePath` to the preflight environment and derive the canonical
  model path with `managedModelPath()` rather than accepting user input.
- [x] Preserve `ValidatedDictationOptions.modelPath` so the worker/native host
  contract and safe argument-array spawn remain unchanged.
- [x] Keep the disabled, remote, unsupported-platform, host, model, and capture
  gates ordered before native process creation.
- [x] Update configuration and preflight fixtures for both `darwin-arm64` and
  `win32-x64` canonical paths.

```ts
const modelPath = await requireFile(
  io,
  "model-unavailable",
  "The managed Whisper model is unavailable.",
  managedModelPath(environment.homePath),
  fs.constants.R_OK
);
```

**Completion criteria**: users cannot configure an alternate model path;
preflight passes the verified canonical path on Mac and Windows and all prior
fail-closed gates remain covered.

### T7 — Wire opt-in setup into activation, settings, and Start lifecycle

**Status**: ✅ done

**Files**:

- `src/dshChatView.ts:95-156,231-237,460-512`
- `package.nls.json:12-16`
- `package.nls.zh-cn.json:12-16`
- `test/dshChatView.test.js:120-160,780-850`

- [x] Own one managed-model installer in `DshChatView` and start it during
  construction only when dictation is enabled, local, and on a supported
  platform.
- [x] On an `enabled=true` configuration change, start the same ensure;
  disabling cancels setup and starts no replacement work.
- [x] Show cancellable VS Code notification progress without logging model
  bytes, transcript text, user-home paths, or download URLs containing tokens.
- [x] Await the same in-flight ensure before preflight/microphone start; surface
  cancellation or failure as bounded `model-unavailable` state while ordinary
  chat remains usable.
- [x] Dispose cancels model setup and removes partial content; language/device
  changes retain existing dictation cancellation semantics.

```ts
await vscode.window.withProgress(
  { location: vscode.ProgressLocation.Notification, cancellable: true, title },
  (progress, token) => this.dictationModel.ensure(progress, token)
);
```

**Completion criteria**: enabling is the sole automatic-download authorization,
enabled-at-startup and newly-enabled flows work, Start reuses/awaits setup, and
disabled/remote/unsupported flows prove zero filesystem and network work.

### T8 — Verify managed setup and move the current Windows model

**Status**: ✅ done

**Files**:

- `test/localDictationModel.test.js:1` (new)
- `test/configuration.test.js:104-130`
- `test/localDictation.test.js:22-116`
- `test/dshChatView.test.js:780-850`
- `doc/feature/06-local-voice-dictation/verification.md`
- external `%USERPROFILE%/.dshmux/models/ggml-large-v3-turbo.bin`

- [x] Test Mac and Windows canonical path resolution, disabled zero-I/O,
  valid-cache reuse, redirects, streaming success, progress, single-flight,
  overflow, short data, checksum mismatch, cancellation, cleanup, and atomic
  publish with deterministic small fixtures.
- [x] Re-verify the current Windows model at
  `%LOCALAPPDATA%/DSHmux/models/ggml-large-v3-turbo.bin`, move it to the
  canonical `%USERPROFILE%/.dshmux/models` path, and verify identical size and
  SHA-1 after the move.
- [x] Compile TypeScript, run focused tests and `npm test`, and inspect
  `npx vsce ls` to prove the model and partial files are excluded.
- [x] Exercise enabled cached-model setup with networking unavailable on
  Windows; record the home-redacted canonical path.

```text
old verified path -> verify -> canonical same-volume move -> verify again
```

**Completion criteria**: deterministic tests cover every managed-model terminal
path, the current Windows model exists only at the canonical location, cached
setup is offline-safe, and packaging excludes all model content.

### T9 — Complete the Windows x64 live checkpoint

**Status**: ❌ blocked — build/package/model-load checks pass, but repeated SDL,
WASAPI, and DirectShow probes expose zero capture endpoints on this machine.

**Files**:

- `native/dictation-host/build-windows.ps1:1`
- `runtime/win32-x64/dsh-dictation-host.exe`
- `runtime/win32-x64/SDL2.dll`
- `doc/feature/06-local-voice-dictation/verification.md`

- [x] Pull the same branch and pinned whisper.cpp v1.9.2 checkout on Windows.
- [x] Build x64 host and record compiler, SDL source/version, dependency list,
  artifact sizes, checksums, full-model load, and bounded missing-microphone
  failure.
- [x] Commit the verified Windows runtime files on the same branch
  (`b7a3288`).
- [ ] With a present capture endpoint, run live English and Estonian
  partial/final dictation through the Extension Development Host.
- [ ] Verify offline behavior, default/explicit SDL device, cancellation,
  canonical model cache, no auto-Send, no temporary audio files, transcript
  latency, and observable peak memory.

```powershell
native\dictation-host\build-windows.ps1
npm test
npx vsce ls
```

**Completion criteria**: the bundled Windows host passes the same semantic,
privacy, lifecycle, and composer criteria as Mac, or the exact environmental
blocker remains reproduced and recorded.

### T10 — Close verification, summary, and TODO

**Status**: ✅ done

**Files**:

- `doc/feature/06-local-voice-dictation/verification.md`
- `doc/feature/06-local-voice-dictation/plan.md`
- `doc/feature/06-local-voice-dictation/summary.md`
- `doc/feature/06-local-voice-dictation/TODO.md`

- [x] Recheck every RTTM row and every ✅ item against called code/evidence.
- [x] Issue one GO, CONDITIONAL GO, or NO-GO only after Windows evidence.
- [x] Write summary and mechanically extract every ❌/⏭️ item into TODO.md; if
  none exist, state `No outstanding tasks.`

```text
verified code + Mac evidence + Windows evidence -> verdict -> summary + TODO
```

**Completion criteria**: all close-out documents agree and no pending item is
misrepresented as complete.

### T11 — Group feedback and experimental settings

**Status**: ✅ done

**Files**:

- `package.json:79`
- `package.nls.json:1`
- `package.nls.zh-cn.json:1`
- `test/chatViewLayout.test.js:1`

- [x] Retain general settings under `DSHmux`.
- [x] Move the four unchanged feedback-sound keys into
  `DSHmux: Feedback Sounds`.
- [x] Move all unchanged local-dictation keys into `DSHmux: Experimental`
  immediately below feedback sounds.
- [x] Add localized titles, the 1.6 GB model-size notice on the opt-in setting,
  and deterministic manifest coverage.

```json
"configuration": [
  { "title": "DSHmux", "order": 10 },
  { "title": "DSHmux: Feedback Sounds", "order": 20 },
  { "title": "DSHmux: Experimental", "order": 30 }
]
```

**Completion criteria**: VS Code receives three ordered settings blocks,
feedback sounds directly precede experimental dictation, and no setting key or
runtime behavior changes.

## Dependency order

```text
T1 ──► T2 ──► T3 ──► T4 (Mac native checkpoint)
              │
              ▼
             T5 (model manager) ──► T6 (config/preflight)
                                           │
                                           ▼
                                      T7 (lifecycle)
                                           │
                                           ▼
                                      T8 (tests + move)
                                           │
                                           ▼
                                      T9 (Windows live)
                                           │
                                           ▼
                                      T10 (close-out)
```

*Related documents: discussion.md | req.md | solution.md*
