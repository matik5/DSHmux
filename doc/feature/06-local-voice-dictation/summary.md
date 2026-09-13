# Local Voice Dictation — Summary

**Date**: 2026-09-14

**Verdict**: **CONDITIONAL GO**

## Result

DSHmux now owns a cross-platform managed Whisper model cache at
`~/.dshmux/models/ggml-large-v3-turbo.bin`. Enabling experimental local
dictation on local macOS Arm64 or Windows x64 starts cancellable setup; disabled,
remote, and unsupported targets perform no model filesystem or network work.
Start waits for that same setup before preflight and microphone creation.

The downloader streams over HTTPS to a sibling `.part`, bounds the byte count,
verifies the fixed 1,624,555,275-byte SHA-1 identity, completes partial file
writes, and publishes with a same-directory rename. Failure, cancellation, and
disposal remove partial data without replacing an existing canonical file. A
verified cache is reused without network access, and concurrent callers share
one operation.

The explicit `modelPath` setting was removed. Preflight derives the canonical
path while preserving the validated worker/native-host argument contract.
Existing Windows model bytes were moved from `%LOCALAPPDATA%\DSHmux\models` to
`%USERPROFILE%\.dshmux\models` and reverified at SHA-1
`4af2b29d7ec73d781377bfd1758ca957a807e941`.

## Verification

- TypeScript compilation: PASS.
- Full test suite: **270 PASS, 0 FAIL, 1 platform-specific SKIP**.
- Windows-specific integration: compiles and runs a real temporary PE host with
  production `shell: false`, exact safe arguments, and JSONL mapping.
- Package inspection: both platform runtimes included; model and `.part` files
  excluded.
- Real Windows runtime: canonical full model loads successfully.
- Mac Arm64 native live dictation: previously verified through the Extension
  Development Host for English and Estonian, editable composer insertion, Stop,
  Cancel, and no auto-Send.
- Windows x64 live microphone: blocked because SDL sees zero capture devices and
  WASAPI reports `Element not found`; DirectShow independently exposes no audio
  input. The host returns bounded `microphone-unavailable`.

The spike closes with CONDITIONAL GO because the managed cache, packaging,
runtime load, and integration contracts pass, while the required Windows live
audio/transcript/performance evidence cannot be collected on this machine.

*Related documents: discussion.md | req.md | solution.md | plan.md | verification.md | TODO.md*
