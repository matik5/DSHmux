# Local Voice Dictation — Implementation Plan

**Date**: 2026-09-13
**Sources**: [discussion.md](discussion.md), [req.md](req.md), [solution.md](solution.md)

## RTTM

| Requirement | Task | Verification |
|---|---|---|
| R1, R2 | T1, T5 | Separate Mac and Windows results; final verdict waits for both. |
| R3 | T1, T2, T4 | Pinned local whisper.cpp build; model remains external; package/notices audit. |
| R4 | T2, T3, T5 | Start/partial/Stop/final/cancel through existing composer path. |
| R5 | T1, T2, T3 | Spawned process and bounded JSONL; no Node addon/FFI or private VS Code API. |
| R6 | T4, T5, T6 | Automated, live, offline, package, performance, and close-out evidence. |

### T1 — Build the DSH native streaming host

**Status**: ✅ done (macOS artifact); Windows build execution remains in T5

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
- [x] Validate the external cached model and target host before spawn.
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

### T5 — Build and verify Windows x64 runtime

**Status**: ⏳ pending (Windows build/package checks complete; live microphone,
model, offline, and lifecycle evidence remains)

**Files**:

- `native/dictation-host/build-windows.ps1:1`
- `runtime/win32-x64/dsh-dictation-host.exe` (generated on Windows)
- optional `runtime/win32-x64/SDL2.dll` (only if dynamically linked)
- `doc/feature/06-local-voice-dictation/verification.md`

- [x] Pull the same branch and pinned whisper.cpp v1.9.2 checkout on Windows.
- [x] Build x64 host and record compiler, SDL source/version, dependency list,
  artifact sizes, and checksums.
- [ ] Run automated tests and live English/Estonian partial/final dictation
  (automated suite complete; live phrases remain).
- [ ] Verify offline behavior, default/explicit SDL device, cancellation, model
  cache, no auto-Send, and no temporary audio files.
- [ ] Commit the verified Windows runtime files on the same branch.

```powershell
native\dictation-host\build-windows.ps1
```

**Completion criteria**: the bundled Windows host passes the same semantic,
privacy, lifecycle, and composer criteria as Mac, or the exact blocker is
recorded.

### T6 — Close verification, summary, and TODO

**Status**: ⏳ pending

**Files**:

- `doc/feature/06-local-voice-dictation/verification.md`
- `doc/feature/06-local-voice-dictation/plan.md`
- `doc/feature/06-local-voice-dictation/summary.md`
- `doc/feature/06-local-voice-dictation/TODO.md`

- [ ] Recheck every RTTM row and every ✅ item against called code/evidence.
- [ ] Issue one GO, CONDITIONAL GO, or NO-GO only after Windows evidence.
- [ ] Write summary and mechanically extract every ❌/⏭️ item into TODO.md; if
  none exist, state `No outstanding tasks.`

```text
verified code + Mac evidence + Windows evidence -> verdict -> summary + TODO
```

**Completion criteria**: all close-out documents agree and no pending item is
misrepresented as complete.

## Dependency order

```text
T1 ──► T2 ──► T3 ──► T4 (Mac live)
                         │
                         ▼
                    T5 (Windows)
                         │
                         ▼
                         T6
```

*Related documents: discussion.md | req.md | solution.md*
