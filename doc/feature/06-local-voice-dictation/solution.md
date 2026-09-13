# 06-local-voice-dictation — Solution

**Date**: 2026-09-13

**Status**: APPROVED (Whisper revision) — 2026-09-13

**Sources**: [discussion.md](discussion.md), [req.md](req.md)

## 1. Goal

Replace the prototype's VS Code Nemotron/Foundry backend with the official
generic multilingual OpenAI Whisper `large-v3-turbo` model while retaining the
already-working microphone button, lifecycle controller, and final insertion
into the editable DSH composer.

The KISS backend is a locally installed `whisper-cli` executable plus an
explicit local GGML model path. Recording is written to one worker-owned WAV
file; pressing Stop closes the recording, runs batch transcription, inserts the
final text, and deletes the temporary directory. There is no streaming,
provider framework, model manager, automatic download, or bundled native code.

## 2. Facts

### 2.1 Prototype facts established on macOS

- The current feature worktree contains an experimental, disabled-by-default
  vertical slice. Its microphone control reaches `DshChatView`, starts one
  crash-isolated child worker, and inserts final text into the existing DSH
  composer without invoking Send.
- The user exercised the built extension on macOS: English text was inserted
  and was not automatically sent. Estonian output did not preserve the spoken
  meaning and sometimes joined words.
- `src/localDictation.ts:374-554` already owns the one-session controller,
  generation fencing, Start/Stop/Cancel, timeouts, child-process isolation, and
  sanitized IPC.
- `src/dshChatView.ts:420-536` already gates and routes the feature, while
  `src/chatChrome.ts`, `media/chat-chrome.js`, and `media/chat-chrome.css`
  already provide the user-reachable control, states, and composer insertion.
- Targeted compile/UI/lifecycle tests pass 38/38. The full pre-feature baseline
  is 220 passed, 7 failed, 1 skipped; the seven unrelated failures are already
  documented in the approved plan.

### 2.2 Current backend facts

| File:line | Verified current behavior |
|---|---|
| `src/localDictation.ts:5-10` | The backend is hard-coded to Nemotron and its VS Code cache directory. |
| `src/localDictation.ts:44-70` | Settings/options contain FFmpeg and private Foundry paths, but no Whisper executable/model path. |
| `src/localDictation.ts:113-161,230-296` | Preflight discovers stable Code user data, its private SDK/runtime, and VS Code-owned model files. |
| `src/localDictation.ts:206-228` | FFmpeg currently emits raw PCM16LE to stdout; Windows requires an explicit DirectShow device. |
| `src/localDictation.ts:398-554` | The controller is backend-agnostic except for injecting a Foundry-native environment variable and using a 15-second Stop timeout. |
| `src/localDictationWorker.ts:36-58,156-346` | The worker imports the private Foundry SDK, streams FFmpeg PCM into a live session, accumulates interim segments, then emits one final transcript. |
| `src/localDictationWorker.ts:321-331` | Cleanup already owns and recursively removes only its `dshmux-dictation-*` temporary directory. |
| `src/configuration.ts:74-100` and `package.json:121-152` | Four machine-scoped experimental settings exist: enabled, language, FFmpeg path, and audio device. |

### 2.3 Generic model and runtime facts

- The official [OpenAI model card](https://huggingface.co/openai/whisper-large-v3-turbo)
  describes `whisper-large-v3-turbo` as a multilingual 809M-parameter model,
  pruned from large-v3 for substantially faster decoding, under the MIT
  license.
- The official [whisper.cpp model list](https://github.com/ggml-org/whisper.cpp/blob/master/models/README.md)
  publishes the full `large-v3-turbo` GGML file at about 1.5 GiB with SHA-1
  `4af2b29d7ec73d781377bfd1758ca957a807e941`. The smaller q5 variant is not part
  of this quality-first checkpoint.
- This Mac already has Homebrew `whisper-cpp` 1.9.2 and
  `/opt/homebrew/bin/whisper-cli`. Its local help confirms support for WAV input,
  an explicit model path, `--language`, `--no-timestamps`, and
  `--no-prints`. Running help initializes the Metal backend on this M4 Max.
- No usable full Whisper model is currently installed locally; only
  Homebrew's tiny test model exists. The approved requirement therefore permits
  one explicit setup download, outside the repository and VSIX.
- `whisper-cli` accepts language codes such as `en` and `et`, whereas the UI
  configuration currently stores `en-US` and `et-EE`; the worker must map those
  two fixed values.

### 2.4 Capture and process facts

- `whisper-cli` is a file-oriented batch CLI, so the current raw-PCM streaming
  contract cannot be reused unchanged.
- FFmpeg can write mono, 16 kHz, PCM16 WAV directly. Keeping FFmpeg stdin open
  and writing `q\n` on Stop lets FFmpeg finalize the WAV header before inference
  on both target platforms. Cancel/failure may kill it and delete the file.
- Node's `spawn(executable, args, { shell: false })` preserves the existing
  command-injection boundary. Transcript stdout can remain private to the
  worker and be sent only through the existing IPC event.
- Model loading plus full-file inference can exceed the current 15-second Stop
  timeout. The prototype needs a bounded but realistic batch timeout; 120
  seconds is the smallest static setting adequate for the first Mac/Windows
  quality spike.

### 2.5 Unchanged integration and privacy facts

- The DSH DOM insertion seam and its exact DSH version gate are independent of
  the ASR backend and already passed the user's Mac test.
- `DshChatView` has exactly one `preflightLocalDictation()` call at
  `src/dshChatView.ts:449` and constructs the same controller at line 463.
- The existing child has ignored stdout/stderr at the controller boundary, so
  native diagnostics and transcript content are not copied into extension
  logs. The new worker must likewise never log captured output.
- The model and runtime are external local dependencies. They are not imported
  by TypeScript and therefore need not enter the extension package unless
  someone explicitly adds them; package inspection remains required.

## 3. Gap

| Goal | Current state | Smallest change |
|---|---|---|
| Generic Whisper model | Preflight and worker require private Foundry/Nemotron assets. | Validate explicit `whisper-cli` and GGML paths; remove Foundry/cache discovery. |
| Batch inference | Worker streams PCM to a live SDK session. | Record one WAV, then spawn `whisper-cli` after Stop. |
| Useful Estonian | Nemotron Mac test failed the semantic criterion. | Pass `--language et` to full `large-v3-turbo` and repeat the same real test. |
| KISS setup | No Whisper paths exist in configuration. | Add exactly two machine-scoped string settings; no auto-discovery beyond executable PATH fallback and no downloader UI. |
| Lifecycle | Controller Stop timeout assumes streaming finalization. | Use a 120-second inference timeout and ensure both FFmpeg and Whisper are killed on cancel/disposal. |
| Windows | Existing code assumes VS Code's Foundry cache/runtime. | Use the same CLI/model contract; retain only the existing DirectShow capture branch. |

## 4. Call-site audit

| Changed contract | All call sites | Classification |
|---|---|---|
| `LocalDictationSettings` gains `whisperPath` and `modelPath`; `ValidatedDictationOptions` drops Foundry fields and gains resolved Whisper/model/audio-file inputs. | `src/configuration.ts:74-89`; `src/dshChatView.ts:421,448-469`; `test/configuration.test.js:105-125`; `test/localDictation.test.js:90-135`; worker Start IPC. | **compatible after coordinated update** — all callers are feature-local and are changed in one task. |
| `preflightLocalDictation()` stops reading VS Code caches and validates two explicit local dependencies. | Production: `src/dshChatView.ts:449`; tests: `test/localDictation.test.js:90-134`; mock: `test/dshChatView.test.js:140`. | **compatible** — signature remains `(environment, settings)` and failures remain typed/bounded. |
| `ffmpegCaptureArgs()` changes output from stdout PCM to a supplied WAV path and enables stdin control. | Worker: `src/localDictationWorker.ts:255-280`; tests: `test/localDictation.test.js:134-141`. | **compatible after coordinated update** — no non-feature caller exists. |
| Worker stops emitting interim transcripts and runs a second child process after Stop. | Controller: `src/localDictation.ts:485-510`; UI: `src/dshChatView.ts:511-530`; `media/chat-chrome.js` transcript handler; `test/localDictationWorker.test.js`. | **compatible** — the existing protocol permits a complete-only session, and revised R4 explicitly does not require interim output. |
| Configuration contributes two additive settings and localization strings. | `package.json`, `package.nls*.json`, `src/configuration.ts`, configuration/i18n tests. | **compatible** — existing keys and defaults remain; the feature stays disabled by default. |
| Chat chrome, DSH insertion, Send, HTTP/WS bridge, secondary panel, and server contracts do not change. | Existing production and test callers found by repository-wide search. | **compatible by isolation**. |

No conflicting call site is known. If `whisper-cli` cannot produce a clean
machine-readable transcript without parsing unstable diagnostic output, the
implementation must return to solution approval rather than adding a server or
embedded runtime silently.

## 5. Target design

### 5.1 Configuration and preflight

Keep the four current settings and add two machine-scoped experimental strings:

```ts
interface LocalDictationSettings {
  enabled: boolean;
  language: "en-US" | "et-EE";
  ffmpegPath: string;
  whisperPath: string;
  modelPath: string;
  audioDevice: string;
}
```

`whisperPath` and `modelPath` must resolve to readable absolute files. An empty
Whisper path may search `PATH` plus `/opt/homebrew/bin/whisper-cli` and
`/usr/local/bin/whisper-cli` on macOS; the model path is always explicit because
the extension does not own a model cache. Preflight does not hash 1.5 GiB on
every recording; verification hashes it once and records the expected SHA-1.

### 5.2 Worker flow

```text
Start
  create private temp dir + recording.wav
  spawn FFmpeg with stdin pipe and WAV output
  emit listening

Stop
  write "q\n" to FFmpeg → await clean exit/final WAV
  spawn whisper-cli --model ... --file recording.wav
                    --language en|et --no-timestamps --no-prints
  capture bounded stdout in memory
  require exit 0 and non-empty normalized transcript
  delete temp dir
  emit metrics + one complete transcript

Cancel / failure / disposal
  kill active FFmpeg and/or whisper-cli
  delete temp dir
  emit no transcript
```

Both subprocesses use argument arrays and `shell: false`. The worker caps
captured transcript output, ignores stderr, removes terminal ANSI/blank lines if
present, and never writes either stream to a log. The controller retains its
generation fence and crash isolation. Its Stop timeout becomes 120 seconds.

### 5.3 Files changed

- `package.json:121-152`, `package.nls.json:12-15`,
  `package.nls.zh-cn.json:12-15` — replace Nemotron wording and add Whisper/model
  path settings.
- `src/configuration.ts:74-100` — return the two new path values.
- `src/localDictation.ts:5-296,398-449` — replace Foundry discovery/options
  with executable/model validation, WAV capture arguments, and batch timeout.
- `src/localDictationWorker.ts:1-376` — replace the private SDK/live session
  with WAV capture and one `whisper-cli` subprocess; keep IPC and cleanup.
- `src/dshChatView.ts:448-469` — pass the revised settings/options only; no UI
  or composer contract change.
- `test/configuration.test.js:105-125`, `test/localDictation.test.js`,
  `test/localDictationWorker.test.js`, and relevant view mocks — update the
  deterministic contracts and prove cleanup/process arguments.
- `doc/feature/06-local-voice-dictation/plan.md` — replace obsolete Foundry
  tasks/RTTM details after this solution is approved.

## 6. Verification approach

1. Deterministic tests use fake executable/model files, fake process spawns,
   and a fake transcript; they assert exact argument arrays, no shell, complete-
   only output, timeout behavior, and cleanup on every terminal path.
2. Download the official full GGML model explicitly outside the repository,
   verify SHA-1, and configure its absolute path.
3. Run `whisper-cli` first against a known WAV, then through the production
   worker, then through the live VS Code composer on macOS.
4. Repeat fixed English and Estonian phrases and record raw outputs plus Stop-to-
   final time. The user decides whether Estonian preserves the intended meaning.
5. Run feature/touched-boundary tests, compare the full suite with the recorded
   baseline, and inspect the VSIX for model/runtime/audio leakage.
6. After the user pushes/pulls the branch, repeat dependency setup and the same
   evidence matrix on Windows x64 before issuing the final verdict.
