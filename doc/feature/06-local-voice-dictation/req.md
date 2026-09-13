# 06-local-voice-dictation — Requirements

**Date**: 2026-09-13

**Status**: APPROVED (Whisper revision) — 2026-09-13

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
commitment.

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
- Missing, incompatible, or unreadable model/runtime assets produce a bounded
  diagnostic; they do not crash extension activation or affect ordinary chat.
- VS Code Insiders, Linux, Windows Arm64, Intel macOS, VS Code for the Web,
  Remote SSH, WSL, Dev Containers, and automatic runtime/model installation are
  not targets for this round.
- No DSH server or DSH protocol change is required.

## R3 — Model, runtime, and local-data boundary

- The target model is the official generic multilingual OpenAI Whisper
  `large-v3-turbo`, using the full published GGML model for the initial quality
  test. Quantized variants are deferred until the full model establishes the
  quality ceiling.
- The prototype may use an independently installed local runtime and a
  user-configured local model path. It must not depend on or modify VS Code's
  private Foundry Local runtime or `chatDictationModels` cache.
- A one-time explicit model download for prototype setup is allowed. The
  extension must not silently download it. The model and runtime must not be
  committed to the repository or included in the VSIX.
- Verification records the model identity and checksum plus the runtime name
  and version used on each platform.
- Microphone audio and raw transcript text remain on the local machine. They
  are not sent to Copilot, a cloud service, the DSH server, telemetry, logs, or
  crash diagnostics.
- A worker-owned temporary audio file is allowed when required by the local
  runtime. It is deleted after successful transcription, cancellation, failure,
  chat disposal, and extension deactivation.
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
- Stopping runs local transcription and leaves the final transcript in the
  existing editable DSH composer without sending it. Live interim text is not
  required for this KISS prototype.
- Existing user-entered composer text is preserved. The user can edit the
  result and invoke the unchanged normal send action.
- Cancelling discards only the current dictation session's output and preserves
  text that existed before recording.
- Microphone denial, missing configuration, model/runtime failure, chat
  disposal, session switching, and extension deactivation end recording
  cleanly, release resources, remove temporary audio, and show a bounded
  actionable error where the UI still exists.
- Normal keyboard input, message submission, session switching, HTTP/WS bridge,
  clipboard behavior, sounds, and theme sync continue to work while dictation
  is idle or disabled.

## R5 — Prototype isolation and KISS constraints

- The prototype is experimental and disabled by default. Normal users see no
  microphone control and pay no model-load or microphone-permission cost unless
  they opt in.
- Prefer a small adapter around a locally installed command-line runtime over
  embedding or repackaging a speech runtime in the extension.
- Runtime executable and model locations may be explicit settings. Automatic
  discovery, download management, microphone selection UI, and model selection
  UI are not required.
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
   or transcript is logged or sent off-machine, and all temporary audio is
   removed on every terminal path.
5. Start, stop, cancel, denial/failure, duplicate start, and disposal end in a
   stable state with microphone resources released and pre-existing composer
   text preserved.
6. Neither model nor runtime is committed or packaged. The extension performs
   no silent download and is disabled by default.
7. Feature tests pass and the full suite introduces no failures beyond the
   documented baseline.
8. Verification records licensing, supportability, and macOS/Windows results
   before a follow-up production feature is proposed.

## Non-goals

- Production release, Marketplace support, or an extension version bump.
- TalTech or another language-specific Whisper fine-tune.
- Bundling a speech model/runtime or building an automatic installer/downloader.
- Comparing quantized model variants during the initial quality checkpoint.
- Cloud transcription, LLM transcript cleanup, or automatic prompt submission.
- Voice Mode, hands-free conversation, wake words, or text-to-speech.
- Platforms beyond Apple-silicon macOS and Windows x64, and remote-workspace or
  VS Code for the Web support.
- Live interim transcription, production performance tuning, microphone
  selection UI, accessibility polish, or full localization.
- Replacing or modifying VS Code's own built-in dictation experience.
