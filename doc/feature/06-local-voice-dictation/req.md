# 06-local-voice-dictation — Requirements

**Date**: 2026-09-13

**Status**: APPROVED (managed-model revision) — 2026-09-13

**Prior scope**: The VS Code Nemotron reuse prototype was approved and exercised
on macOS. It proved the DSH composer integration and local inference path, but
its Estonian output did not preserve the spoken meaning. This revision replaces
Nemotron reuse as the target backend; the prior result remains prototype
evidence.

**Source**: [discussion.md](discussion.md)

## Intent

Determine whether DSHmux can provide useful local voice dictation in its
embedded chat composer with the official, generic multilingual OpenAI Whisper
`large-v3-turbo` model. Do not use a TalTech or other language-specific
fine-tune. This round remains a feasibility prototype, not a production feature
commitment. The runtime revision replaces the external batch CLI with a small
DSH-owned native streaming host built for macOS Arm64 and Windows x64.

The user speaks a DSH request, receives an editable transcript in the existing
DSH composer, and submits it only through the unchanged normal send action.

The work is sequential: first make and evaluate the macOS Arm64 prototype, then
use the same branch on Windows x64 and make the smallest required portability
fixes there.

## R1 — Evidence-based feasibility verdict

- The round ends with exactly one verdict:
  - **GO** — the prototype works through an integration suitable for a normal
    published VS Code extension;
  - **CONDITIONAL GO** — the prototype works, but production use is blocked by
    an explicitly named issue such as runtime installation, packaging,
    licensing, or platform coupling;
  - **NO-GO** — no end-to-end prototype can be completed within the constraints,
    with the failed boundary demonstrated.
- A NO-GO or CONDITIONAL GO is a valid completed spike result. The prototype
  must not hide a blocker by silently switching to a cloud service or another
  speech model.
- The verdict separately covers model accuracy, local runtime use, microphone
  capture, DSH-composer integration, licensing, packaging, and macOS/Windows
  portability.
- Claims cite inspected code, runtime evidence, or authoritative documentation.
  Assumptions and observations are labeled separately.

## R2 — Reference environments and bounded scope

- The required desktop reference targets are:
  1. stable VS Code 1.137.0 on Apple-silicon macOS; and
  2. stable VS Code 1.137.0 on Windows x64.
- Both targets may use a local, non-remote workspace. macOS evidence does not
  satisfy the Windows target, or vice versa.
- Complete the macOS checkpoint first. The user then pushes/pulls the same
  branch to Windows for platform verification and fixes. Passing macOS alone is
  not feature completion or a final GO verdict.
- A missing model starts managed setup only after the dictation experiment is
  enabled. An incompatible or unreadable model, failed download, or missing
  runtime produces a bounded diagnostic; none of these crash extension
  activation or affect ordinary chat.
- VS Code Insiders, Linux, Windows Arm64, Intel macOS, VS Code for the Web,
  Remote SSH, WSL, Dev Containers, and automatic runtime/model installation are
  not targets for this round.
- No DSH server or DSH protocol change is required.

## R3 — Model, runtime, and local-data boundary

- The target model is the official generic multilingual OpenAI Whisper
  `large-v3-turbo`, using the full published GGML model for the initial quality
  test. Quantized variants are deferred until the full model establishes the
  quality ceiling.
- The extension uses a bundled `dsh-dictation-host` executable built from the
  repository's host source against a pinned whisper.cpp release. It must not
  depend on or modify VS Code's private Foundry Local runtime or
  `chatDictationModels` cache.
- Setting `dshmux.experimental.localDictation.enabled` to `true` is explicit
  authorization for DSHmux to ensure the target model is installed. On macOS
  and Windows, DSHmux downloads the model when it is absent from the canonical
  user cache at `~/.dshmux/models/ggml-large-v3-turbo.bin`. It performs no
  model filesystem or network work while the experiment is disabled.
- The download uses HTTPS, writes to a sibling partial file, verifies the
  expected published model identity/checksum, and only then atomically exposes
  the canonical filename. Interrupted, invalid, or failed downloads never
  replace a previously verified model and surface bounded actionable progress
  or error state.
- A verified canonical model is reused without network access. The model must
  not be committed or packaged. Platform host binaries and their required
  dynamic libraries may be committed and packaged with matching notices and
  build instructions.
- Verification records the model identity and checksum plus the runtime name
  and version used on each platform.
- Microphone audio and raw transcript text remain on the local machine. They
  are not sent to Copilot, a cloud service, the DSH server, telemetry, logs, or
  crash diagnostics.
- Microphone audio is retained in bounded process memory and discarded after
  successful transcription, cancellation, failure, chat disposal, and
  extension deactivation. The native host does not create a temporary WAV.
- The prototype uses raw local ASR output. Cloud or LLM transcript cleanup is
  outside this round.
- Dictation never submits a DSH request automatically. Text reaches DSH only
  through the user's separate normal send action after review or editing.
- Verification states the relevant model and runtime licenses and whether
  local use differs from redistribution.

## R4 — Minimum dictated-DSH-input prototype

On each required target, when the experiment is explicitly enabled and its
configured local dependencies are available:

- The primary DSHmux chat surface provides an explicit start/stop dictation
  action associated with the existing DSH composer.
- Recording starts only after a direct user action and any operating-system or
  VS Code microphone permission flow. It never starts on activation, page load,
  session restore, or a DSH-originated message.
- The UI visibly distinguishes at least `preparing`, `listening`, `stopping`,
  and `error` states. At most one DSHmux dictation session exists at a time.
- While listening, the host may emit changing partial hypotheses for visible
  feedback. Stopping runs a final local transcription and leaves only that final
  transcript in the existing editable DSH composer without sending it.
- Existing user-entered composer text is preserved. The user can edit the
  result and invoke the unchanged normal send action.
- Cancelling discards only the current dictation session's output and preserves
  text that existed before recording.
- Microphone denial, missing configuration, model/runtime failure, chat
  disposal, session switching, and extension deactivation end recording
  cleanly, release resources, discard buffered audio, and show a bounded
  actionable error where the UI still exists.
- Normal keyboard input, message submission, session switching, HTTP/WS bridge,
  clipboard behavior, sounds, and theme sync continue to work while dictation
  is idle or disabled.

## R5 — Prototype isolation and KISS constraints

- The prototype is experimental and disabled by default. Normal users see no
  microphone control and pay no model-load or microphone-permission cost unless
  they opt in.
- Prefer one small spawnable native process over Node FFI or a Node native
  addon. It owns microphone capture, whisper.cpp context lifetime, buffering,
  and inference; TypeScript communicates through bounded JSON Lines on
  stdin/stdout.
- The bundled host is the default. An explicit host-path override is allowed;
  the model path is the canonical `~/.dshmux/models` location managed by
  DSHmux. Microphone selection UI and model selection UI are not required.
- Audio capture is continuous in small callbacks. Partial inference cadence is
  controlled by DSHmux (initially 750 ms and never faster than 250 ms), rather
  than inherited from the upstream example's sampling loop. Full inference is
  not run for every audio callback.
- The prototype may retain at most the latest 30 seconds of audio in memory.
- Experimental code remains behind a narrow interface so it can be replaced or
  removed without changing existing DSHmux bridge and chat contracts.
- Importing VS Code workbench modules, patching the installed application, or
  depending on undocumented private services is not acceptable for a GO
  verdict.

## R6 — Verification and recorded evidence

- Verification records separately for macOS Arm64 and Windows x64: exact VS
  Code version, OS/architecture, model identity/checksum, runtime
  identity/version, and home-redacted configured paths.
- On each target, exercise one fixed English phrase and one fixed Estonian
  (`et-EE`) phrase. Record expected and actual transcripts. Differences in
  punctuation or capitalization are acceptable; both results must preserve the
  spoken meaning.
- Demonstrate that the transcription path operates without network access on
  each target after explicit setup is complete.
- Windows verification explicitly covers executable/model configuration,
  microphone capture, local transcription, final insertion into the DSH
  composer, and temporary-file cleanup.
- Tests or deterministic harnesses cover state transitions, duplicate-start
  prevention, stop/cancel behavior, malformed bridge messages, missing
  configuration/assets, and cleanup on disposal.
- Feature tests pass. The full existing suite has no new failures compared with
  its recorded pre-change baseline, and disabling the experiment leaves
  existing DSHmux behavior unchanged.
- Record time to final transcript after Stop, peak memory attributable to the
  prototype where observable, and runtime errors. These are feasibility
  measurements, not production performance promises.
- For a CONDITIONAL GO or NO-GO, name the smallest viable next step without
  silently implementing a different backend.

## Acceptance criteria

1. The report produces one R1 verdict with evidence for all required boundaries
   on both macOS Arm64 and Windows x64. GO requires a successful dictated-DSH-
   input vertical slice on both targets.
2. The target is the official generic Whisper `large-v3-turbo`; no TalTech
   fine-tune, cloud transcription, or fallback model is used.
3. On each target, English and Estonian speech becomes meaningful, editable
   text in the current DSH composer, and only the unchanged normal send action
   can submit it to DSH; otherwise the first failed boundary is reproduced and
   documented for a CONDITIONAL GO or NO-GO.
4. After explicit setup, transcription works without network access. No audio
   or transcript is logged or sent off-machine, and all buffered audio is
   released on every terminal path.
5. Start, stop, cancel, denial/failure, duplicate start, and disposal end in a
   stable state with microphone resources released and pre-existing composer
   text preserved.
6. The model is not committed or packaged. The platform runtime may be bundled
   with required notices. Enabling dictation explicitly authorizes an atomic,
   checksum-verified download to `~/.dshmux/models`; disabling dictation causes
   no model or network work.
7. Feature tests pass and the full suite introduces no failures beyond the
   documented baseline.
8. Verification records licensing, supportability, and macOS/Windows results
   before a follow-up production feature is proposed.

## Non-goals

- Production release, Marketplace support, or an extension version bump.
- TalTech or another language-specific Whisper fine-tune.
- Bundling a speech model or supporting model selection and multiple managed
  model variants.
- Comparing quantized model variants during the initial quality checkpoint.
- Cloud transcription, LLM transcript cleanup, or automatic prompt submission.
- Voice Mode, hands-free conversation, wake words, or text-to-speech.
- Platforms beyond Apple-silicon macOS and Windows x64, and remote-workspace or
  VS Code for the Web support.
- Production performance tuning, microphone selection UI, accessibility
  polish, or full localization.
- Replacing or modifying VS Code's own built-in dictation experience.
