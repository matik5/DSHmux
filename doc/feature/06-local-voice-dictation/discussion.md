# 06-local-voice-dictation — Discussion

**Date**: 2026-09-13

**Status**: FROZEN — [req.md](req.md) has been created; record new
requirements there.

## User request

Create a feasibility prototype for voice dictation in the DSHmux chat input.
The prototype should determine whether DSHmux can reuse VS Code's already
downloaded local Nemotron speech-to-text model instead of downloading another
model or sending microphone audio to a cloud service.

The supplied lead identified these default macOS locations:

```text
~/Library/Application Support/Code/chatDictationModels/
~/Library/Application Support/Code/chatDictationRuntime/
```

For VS Code Insiders, the corresponding user-data root is expected to be
`~/Library/Application Support/Code - Insiders/`.

Sources supplied with the request:

- [VS Code voice support](https://code.visualstudio.com/docs/configure/accessibility/voice)
- [microsoft/vscode#332537](https://github.com/microsoft/vscode/issues/332537)

## Verified upstream facts

- VS Code documents built-in dictation as experimental. Its current default
  model is `nemotron-3.5-asr-streaming-0.6b`; the first use downloads the model,
  after which on-device recognition works offline.
- Built-in on-device dictation is documented for Windows x64/Arm64, macOS Apple
  silicon, and Linux x64/Arm64 with glibc 2.34+. It is not available in VS Code
  for the Web or on Intel Macs.
- In a remote workspace, VS Code runs speech recognition on the local UI
  client. Only one built-in dictation session can be active at a time.
- VS Code inserts dictated text without submitting it. Its optional LLM cleanup
  can send transcript text, but not audio, to a Copilot model; disabling cleanup
  is required for a strictly local transcript path.
- VS Code's internal
  [`ILocalTranscriptionService`](https://github.com/microsoft/vscode/blob/main/src/vs/platform/localTranscription/common/localTranscription.ts)
  accepts little-endian PCM16 mono audio at 16 kHz, runs Foundry Local in a
  utility process, emits interim/final transcripts, and treats transcription as
  a singleton.
- The internal implementation stores the Foundry runtime beside the model
  cache under `chatDictationRuntime` and loads the selected model through the
  Foundry Local SDK. These are internal workbench/platform services, not the
  public Extension API.
- A search of the current stable `vscode.d.ts` found no dictation or
  transcription consumer API. The proposed
  [`speech`](https://github.com/microsoft/vscode/blob/main/src/vscode-dts/vscode.proposed.speech.d.ts)
  API lets an extension **register** a speech provider; it does not expose the
  built-in local transcription service to extension consumers. Proposed APIs
  are also Insiders-only and are not suitable for a Marketplace release.

## Verified local-machine facts

The audit was read-only and found the following on the current test machine:

- macOS 26.6.2, Apple silicon (`arm64`), VS Code 1.137.0;
- `chatDictationModels` exists under the stable Code user-data root and is
  approximately 757 MB;
- the concrete model is
  `Microsoft/nemotron-3.5-asr-streaming-0.6b-generic-cpu-3/v3`;
- its payload contains the encoder, decoder, joiner and Silero VAD ONNX files,
  external weight files, tokenizer/vocabulary, and model/audio configuration;
- the model configuration expects 16 kHz audio, and the vocabulary contains an
  `et-EE` language token;
- `chatDictationRuntime/1.2.3` is approximately 146 MB and contains the
  `darwin-arm64` Foundry Local N-API addon plus Foundry Local Core,
  ONNX Runtime, and ONNX Runtime GenAI libraries;
- the model's bundled notice points to the NVIDIA Open Model License, while the
  Foundry catalog provides additional license metadata. Reuse and redistribution
  are separate questions and need an explicit licensing conclusion before any
  production proposal;
- the Insiders user-data root exists, but no Insiders dictation model/runtime
  cache was found.

## Current DSHmux facts

- DSHmux is declared as a workspace extension in `package.json`. In Remote SSH,
  WSL, or Dev Containers its extension host therefore differs from the local UI
  client where VS Code documents microphone capture and local transcription as
  running.
- The primary chat surface is `DshChatView`, a script-enabled `WebviewView` that
  embeds the DSH frontend.
- `documentAssembly.ts` already injects DSHmux-owned bridge JavaScript and
  additional chrome into the assembled DSH document.
- `BridgeHost` currently accepts HTTP, WebSocket, and clipboard messages. It has
  no microphone, PCM-audio, or speech-transcription contract.
- DSHmux currently has no dictation command, setting, microphone UI, audio
  dependency, model discovery, or transcription lifecycle.

## Central uncertainty

The files demonstrably exist and the internal VS Code engine demonstrably uses
them, but that does **not** yet prove that a normal published extension can
safely consume the engine or load those files in its own process. The prototype
must distinguish:

1. a supported, publishable integration;
2. a technically working but undocumented/version-fragile experiment; and
3. a hard blocker such as API isolation, native-runtime loading, licensing,
   microphone permissions, or UI-host/workspace-host separation.

The feature should therefore be treated as a spike with an evidence-backed
GO / CONDITIONAL GO / NO-GO result, not as a commitment to ship dictation.

## Product direction for the spike

- Start with the current local Apple-silicon test environment and reuse the
  installed stable-VS-Code assets read-only.
- Prove the smallest end-to-end path: explicit user gesture → microphone audio
  → local Nemotron inference → visible transcript → insertion into the existing
  DSH composer without submission.
- Keep the experiment disabled by default and isolated from normal DSHmux
  startup and chat behavior.
- Do not download, copy, patch, delete, or redistribute VS Code's model/runtime
  as part of the spike.
- Treat remote windows, cross-platform packaging, model installation, voice
  mode, text-to-speech, and production UX as later decisions.
