# 06-local-voice-dictation — Verification

**Date**: 2026-09-13

**Status**: IN PROGRESS — macOS checkpoint PASS; Windows checkpoint remains

**Sources**: [req.md](req.md), [solution.md](solution.md), [plan.md](plan.md)

## Current checkpoint

The generic Whisper implementation is built, automatically verified, and open
in a fresh Extension Development Host for the user-facing macOS test. This is
not the close-out verdict: raw live English/Estonian results and all Windows
evidence are still required.

## macOS environment

| Item | Evidence |
|---|---|
| OS | macOS 26.6.2 (25G83), Arm64 |
| VS Code | 1.137.0, commit `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`, Arm64 |
| FFmpeg | 9.0.1 at `/opt/homebrew/bin/ffmpeg` |
| Runtime | whisper.cpp / `whisper-cli` 1.9.2 at `/opt/homebrew/bin/whisper-cli` |
| Model | official full GGML `ggml-large-v3-turbo.bin`, 1,624,555,275 bytes |
| Model SHA-1 | `4af2b29d7ec73d781377bfd1758ca957a807e941` (matches the published whisper.cpp value) |
| Model path | `~/Library/Application Support/DSHmux/models/ggml-large-v3-turbo.bin` |

## Automated evidence

- TypeScript compilation passes.
- The focused configuration, preflight, worker, chrome, and view run passes
  46/46 tests.
- Production source/package manifests contain no `Nemotron`, `Foundry`,
  `chatDictationModels`, `chatDictationRuntime`, or Foundry-native reference.
- `npx vsce ls` includes `out/localDictationWorker.js` and contains no model,
  runtime, FFmpeg, WAV, temp directory, transcript, or absolute machine path.
- `npm test` has no dictation/touched-boundary failure and reproduces the same
  seven unrelated baseline failures: six macOS-vs-Windows path expectations in
  `test/installService.test.js` and one Homebrew Node expectation in
  `test/serverManager.test.js`.
- An audit-only `tmp/deepseek-harness` checkout initially caused Node's default
  test discovery to include that other repository. It was moved out of the
  worktree to Trash and the suite was rerun against DSHmux only.

## Model and worker smoke

Known input: synthesized WAV saying “Quick brown fox jumps over the lazy dog”.

| Path | Raw final output | Stop/file-to-final | Memory evidence |
|---|---|---:|---:|
| Direct `whisper-cli` | `Quick brown fox jumps over the lazy dog.` | 1.57 s wall clock | 1,982,955,520-byte max RSS; 2,103,494,840-byte peak footprint |
| Production DSHmux worker with deterministic WAV capture | `Quick brown fox jumps over the lazy dog.` | 1,341 ms | 44,531,712-byte worker RSS; child memory measured separately above |

The production worker emitted `ready`, one metrics event, and exactly one
`complete` transcript. It emitted no interim text. No `dshmux-dictation-*`
temporary directory remained after exit.

## Live macOS result

| Language | Fixed phrase | Raw final output | Result |
|---|---|---|---|
| Estonian (`et-EE` → `et`) | `Palun vaata üle selle projekti testid ja paranda katkised testid.` | `Palun vaata üle selle projekti testid ja paranda katkised testid.` | PASS — user confirmed the sentence appeared completely correctly despite deliberately less-clear speech. |
| English (`en-US` → `en`) | `Please review the project tests and fix the failing tests.` | `Please review the project tests and fix the failing tests.` | PASS — user confirmed the result was again perfect. |

The transcript remained editable in the existing DSH composer and was not sent
automatically. The Whisper live result confirms the replacement backend reaches
that unchanged integration boundary.

The user explicitly accepted the Mac checkpoint as fully good for the current
full `large-v3-turbo` model.

## Network-blocked repeat

The production worker was run under macOS `sandbox-exec` with
`(deny network*)`, using deterministic WAV capture and the same external model
and runtime. It completed in 1,812 ms with the exact final transcript:

```text
Please review the project tests and fix the failing tests.
```

No worker temporary directory remained. This demonstrates offline inference
after explicit setup without relying only on proxy configuration.

## Privacy and prior-backend note

- The current worker uses only local FFmpeg and `whisper-cli` child processes,
  ignores both child stderr streams, bounds transcript stdout, and sends only
  the final transcript plus numeric metrics over private child IPC.
- Recording is one worker-owned WAV and is removed before the final transcript
  event. Cancel/failure/disconnect cleanup is covered by code and fake-process
  tests.
- During the earlier Nemotron investigation, one initial online private-SDK
  diagnostic refreshed VS Code's `foundry.modelinfo.json` at 19:26:42. Later
  Nemotron runs were proxy-blocked and left its exact fingerprint/mtime
  unchanged. The Whisper revision neither reads nor writes that cache.
- The earlier user test proved the common UI/composer boundary: English text
  was inserted and was not automatically sent; Nemotron Estonian quality did
  not preserve meaning. This is comparison evidence, not Whisper acceptance.

## Requirement coverage at this checkpoint

| Requirement | State | Evidence / remaining gap |
|---|---|---|
| R1 | partial | Mac accuracy/runtime/capture/composer/package/licensing evidence passes; final verdict waits for Windows. |
| R2 | partial | Mac checkpoint passes; Windows is intentionally pending. |
| R3 | verified on Mac | Exact generic model/checksum, explicit external paths, network-blocked inference, no package/cache dependency, local process boundary and temp cleanup. |
| R4 | verified on Mac | Both live languages, composer insertion and no auto-Send pass; lifecycle/cancel edges also pass deterministic tests. |
| R5 | verified in code/package | Disabled default, explicit settings, two-child CLI adapter, no downloader/provider/private VS Code API. |
| R6 | partial | Automated/smoke/package and both Mac live-language results are recorded; Windows remains. |

## Outstanding evidence

1. Entire Windows x64 checkpoint.
2. Final RTTM/code-called audit, verdict, plan review, summary, and mechanical
   TODO extraction after the platform evidence is complete.
