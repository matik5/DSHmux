# Local Voice Dictation — Implementation Plan

**Date**: 2026-09-13

**Status**: APPROVED (Whisper revision) — 2026-09-13

**Sources**: [discussion.md](discussion.md), [req.md](req.md),
[solution.md](solution.md)

## Scope and fixed decisions

This revision replaces only the ASR backend of the existing experimental
prototype. The finished chat-chrome microphone, `DshChatView` routing,
generation fencing, composer insertion, lifecycle cancellation, exact DSH
version gate, and separate manual Send action remain in place.

The backend uses an externally installed `whisper-cli` and the official full
GGML OpenAI Whisper `large-v3-turbo` model. It records one temporary mono 16 kHz
PCM16 WAV, transcribes after Stop, returns one final transcript, and removes the
temporary directory. It does not stream interim text, download silently, bundle
native/model files, use TalTech, call a cloud service, or modify VS Code assets.

Mac Arm64 is implemented and validated first. Windows x64 follows from the same
branch after the user pushes/pulls it to that machine.

The recorded post-merge baseline is 220 passed, 7 failed, 1 skipped on this
Mac. Six failures are pre-existing Windows-path expectations in
`test/installService.test.js`; one is a pre-existing Homebrew Node-discovery
expectation in `test/serverManager.test.js`. The feature must introduce no new
failures.

## Requirement-to-task traceability matrix

| Requirement | Task | Verification |
|---|---|---|
| R1 — evidence-based model/runtime/capture/composer/licensing/platform verdict | T3, T4, T5, T6 | Automated evidence plus separate Mac/Windows live matrices and one final verdict. |
| R2 — Mac first, then Windows; bounded unsupported targets; no DSH protocol change | T1, T3, T4, T5 | Platform tests and separate live checkpoints; existing bridge/server contracts remain unchanged. |
| R3 — official full generic model, explicit setup, local-only data, temp cleanup, no bundle/cloud/auto-Send | T1, T2, T3, T4, T5 | Exact preflight/process tests, SHA-1, offline run, temp audit, VSIX listing, composer inspection. |
| R4 — user-triggered Start/Stop, visible states, final editable text, preservation and cleanup | T0, T2, T3, T4, T5 | Existing UI tests plus complete-only worker tests and real composer runs. |
| R5 — disabled default, CLI adapter, explicit paths, narrow removable interface | T0, T1, T2, T3 | Settings/default and no-spawn tests; no new provider/runtime layer. |
| R6 — two languages/platforms, tests, baseline comparison, metrics and checksums | T3, T4, T5, T6 | Test logs, raw transcripts, SHA-1/runtime versions, timings, package and close-out audits. |
| AC1–AC3 — two-platform result with generic model and useful English/Estonian DSH input | T4, T5, T6 | Both live checkpoints or a demonstrated bounded failure. |
| AC4–AC6 — offline/privacy/cleanup/lifecycle/no package payload/default disabled | T1, T2, T3, T4, T5 | Unit/integration tests, offline live runs, temp checks and VSIX inspection. |
| AC7–AC8 — no new test failures and documented license/supportability | T3, T6 | Baseline comparison and final evidence audit. |

## Implementation tasks

### T0 — Preserve the working DSH integration

**Status**: ✅ done

**Files**:

- `src/chatChrome.ts:38-110`
- `media/chat-chrome.js:84-228,530-672`
- `media/chat-chrome.css:430-496`
- `src/dshChatView.ts:98-100,367-536`
- `src/extension.ts:137-187`
- `test/chatChrome.test.js`
- `test/dshChatView.test.js`

- [x] Keep the disabled-by-default mic control and visible lifecycle states.
- [x] Keep one-session generation fencing and all cancellation edges.
- [x] Keep the tested composer insertion seam, existing text preservation, and
  unchanged separate Send action.
- [x] Keep the exact `0.1.5-rc.2` DSH version and local-host/platform gates.

The backend-facing boundary remains:

```ts
type LocalDictationEvent =
  | { type: "state"; state: LocalDictationState; generation: number | null }
  | { type: "transcript"; phase: "interim" | "complete"; text: string; generation: number }
  | { type: "metrics"; stopToFinalMs?: number; peakRssBytes?: number; generation: number };
```

The Whisper worker emits only `phase: "complete"`; keeping the additive union
avoids unnecessary UI/controller contract churn.

**Completion criteria**: the already-passing UI/lifecycle path remains callable
and neither inserts text outside the composer nor invokes Send.

### T1 — Replace Foundry discovery with explicit Whisper preflight

**Status**: ✅ done

**Files**:

- `package.json:121-152`
- `package.nls.json:12-15`
- `package.nls.zh-cn.json:12-15`
- `src/configuration.ts:74-100`
- `src/localDictation.ts:5-296`
- `src/dshChatView.ts:448-469`
- `test/configuration.test.js:105-135`
- `test/localDictation.test.js:1-170`
- `test/dshChatView.test.js:130-150`

- [x] Remove Nemotron, VS Code user-data, private SDK/runtime, model-cache, and
  Foundry-native environment assumptions from production preflight.
- [x] Add machine-scoped `whisperPath` and `modelPath` settings with no default
  model location and no download behavior.
- [x] Require an absolute readable model file. Resolve `whisper-cli` from an
  explicit absolute path, `PATH`, or the two conventional Homebrew paths.
- [x] Keep the existing FFmpeg executable resolution, supported-platform/local-
  host gates, and explicit Windows DirectShow device requirement.
- [x] Change FFmpeg arguments to write a worker-provided WAV path and reserve
  stdin for a clean `q\n` stop. Arguments remain arrays with `shell: false`.
- [x] Map `en-US → en` and `et-EE → et` only in validated worker options.
- [x] Add typed `whisper-unavailable` and `model-unavailable` failures while
  removing obsolete SDK/runtime/cache failures.

The revised narrow settings/options contract is:

```ts
interface LocalDictationSettings {
  enabled: boolean;
  language: "en-US" | "et-EE";
  ffmpegPath: string;
  whisperPath: string;
  modelPath: string;
  audioDevice: string;
}

interface ValidatedDictationOptions {
  platformKey: "darwin-arm64" | "win32-x64";
  whisperLanguage: "en" | "et";
  ffmpegPath: string;
  whisperPath: string;
  modelPath: string;
  audioDevice: string;
}
```

**Completion criteria**: deterministic tests prove both target platforms,
absolute/readable path validation, language mapping, injection-safe argument
construction, disabled/no-spawn behavior, and zero access to VS Code speech
caches.

### T2 — Replace the live Foundry worker with WAV plus `whisper-cli`

**Status**: ✅ done

**Files**:

- `src/localDictation.ts:298-554`
- `src/localDictationWorker.ts:1-376`
- `test/localDictation.test.js:170-end`
- `test/localDictationWorker.test.js:1-end`

- [x] Keep one crash-isolated worker, controller state machine, generation
  fence, IPC validation, and ignored controller stdout/stderr.
- [x] On Start, create one `dshmux-dictation-*` temp directory and spawn FFmpeg
  to write `recording.wav`; emit `ready` only after capture spawns.
- [x] On Stop, write `q\n`, await clean FFmpeg exit, then spawn `whisper-cli`
  with exact model/file/language and quiet/no-timestamp arguments.
- [x] Capture a bounded stdout transcript in memory; require exit code 0 and a
  non-empty normalized result. Never log stdout, stderr, paths, or raw audio.
- [x] Emit sanitized metrics and exactly one final transcript after successful
  cleanup. Do not emit interim transcript events.
- [x] On Cancel, timeout, malformed IPC, capture/inference failure, parent
  disconnect, or disposal, kill both possible children, emit no transcript,
  and remove only the worker-created temp directory.
- [x] Remove the Foundry SDK interfaces, live-session accumulator, model load,
  proxy variables, and `VSCODE_FOUNDRY_LOCAL_NATIVE_DIR` injection.
- [x] Raise the bounded Stop/inference timeout from 15 to 120 seconds.

The production process sequence is:

```ts
spawn(ffmpegPath, captureArgs(recordingPath), {
  shell: false,
  stdio: ["pipe", "ignore", "ignore"]
});

spawn(whisperPath, [
  "--model", modelPath,
  "--file", recordingPath,
  "--language", whisperLanguage,
  "--no-timestamps",
  "--no-prints"
], { shell: false, stdio: ["ignore", "pipe", "ignore"] });
```

**Completion criteria**: fake-process tests prove exact ordering/arguments,
complete-only output, clean and forced termination, output cap, all error
classifications, no transcript logs, and temp cleanup on every terminal path.

#### Lightweight audit after T1–T2

- Recheck R3/R5 against production code: only explicit external dependencies,
  no cache access/download/bundle/cloud path, and feature disabled by default.
- Recheck R4 lifecycle edges and confirm all finished T0 integration remains
  called rather than dead.
- Run compile plus configuration, preflight, worker, chrome, and view suites.
  Record any gap before downloading or live microphone testing.

Audit result: production `src/**` and package manifests contain no Nemotron,
Foundry, `chatDictationModels`, `chatDictationRuntime`, or Foundry-native
references. Compile and 46 configuration/preflight/worker/chrome/view tests
pass. The existing mic → controller → complete transcript → composer path is
still called. The remaining evidence gap is real live microphone quality.

### T3 — Run automated and package regression verification

**Status**: ✅ done

**Files**:

- `test/configuration.test.js`
- `test/localDictation.test.js`
- `test/localDictationWorker.test.js`
- `test/chatChrome.test.js`
- `test/dshChatView.test.js`
- prospective VSIX listing only; generated package is not committed

- [x] Run feature/touched-boundary tests after implementation and require all
  of them to pass.
- [x] Run `npm test` and compare with the documented 220/7/1 baseline. Do not
  change unrelated tests to make the count green.
- [x] Package/inspect the prospective VSIX and prove it contains no model,
  runtime, FFmpeg, WAV, temp path, captured transcript, or machine path.
- [x] Confirm compiled worker inclusion and that activation/default-disabled
  chat performs no executable/model check or child spawn.

Minimum commands:

```sh
npm test
npx vsce ls
```

**Completion criteria**: feature and touched-boundary tests pass, the full suite
adds no failure beyond baseline, and package inspection proves external assets
and private data are absent.

### T4 — Complete the macOS Arm64 quality checkpoint

**Status**: ✅ done

**Files**:

- external model file outside the repository (not committed or packaged)
- `doc/feature/06-local-voice-dictation/verification.md`

- [x] Explicitly download the official full `large-v3-turbo` GGML model to a
  local non-repository path and verify SHA-1
  `4af2b29d7ec73d781377bfd1758ca957a807e941`.
- [x] Record macOS/VS Code/`whisper-cli` versions and home-redacted paths.
- [x] Smoke-test a known WAV directly, then through the production worker.
- [x] Configure the development extension, record microphone input, press Stop,
  and verify final insertion without automatic Send.
- [x] Test fixed English and Estonian phrases; record the unedited output and
  Stop-to-final time. The user assesses whether meaning is preserved.
- [x] Repeat after setup with network unavailable or otherwise demonstrably
  blocked, and confirm the model/temp/VSIX boundaries.

**Completion criteria**: the Mac vertical slice works offline and both language
results preserve meaning, or the exact first failing boundary is documented.
Passing Mac authorizes handoff to Windows but is not final feature completion.

### T5 — Complete the Windows x64 checkpoint

**Status**: ⏳ pending

**Files**:

- same branch pulled to the user's Windows machine
- `doc/feature/06-local-voice-dictation/verification.md`
- only portability fixes proven necessary by Windows evidence

- [ ] Install/configure an external Windows `whisper-cli`, FFmpeg, full verified
  model, and exact DirectShow microphone name; do not bundle them.
- [ ] Run the same automated tests, known-WAV worker smoke, and package audit.
- [ ] Test fixed English and Estonian live phrases through the actual DSH
  composer with no automatic Send.
- [ ] Verify offline operation, subprocess cleanup, WAV deletion on success,
  Cancel and failure, and bounded errors for bad paths/device names.
- [ ] Make only evidence-driven portability fixes and rerun the affected Mac
  tests before accepting them.

**Completion criteria**: the Windows vertical slice and both languages pass the
same semantic/privacy/lifecycle criteria, or the exact first failing boundary
is documented.

### T6 — Close verification, plan review, summary, and TODO

**Status**: ⏳ pending

**Files**:

- `doc/feature/06-local-voice-dictation/verification.md`
- `doc/feature/06-local-voice-dictation/plan.md`
- `doc/feature/06-local-voice-dictation/summary.md`
- `doc/feature/06-local-voice-dictation/TODO.md`

- [ ] Recheck every RTTM row against code that exists and is called.
- [ ] Audit every `✅` task for implementation and runtime/test evidence.
- [ ] List every gap with severity and suggested action.
- [ ] Issue exactly one GO, CONDITIONAL GO, or NO-GO verdict covering accuracy,
  runtime/setup, microphone, composer, licensing, packaging, and portability.
- [ ] Review task states from verification and mechanically extract all `❌`
  and `⏭️` items into `TODO.md`; otherwise state `No outstanding tasks.`
- [ ] Record the final result and the earlier Nemotron comparison in
  `summary.md` without claiming Windows success from Mac evidence.

**Completion criteria**: all mandatory close-out documents agree, TODO is
mechanically derived, and the verdict is supported by separate Mac and Windows
evidence.

## Dependency order

```text
T0 ✅
 │
 ▼
T1 ──► T2 ──► lightweight audit ──► T3 ──► T4 (Mac)
                                              │
                                              ▼
                                         user push/pull
                                              │
                                              ▼
                                         T5 (Windows)
                                              │
                                              ▼
                                             T6
```

*Related documents: discussion.md | req.md | solution.md*
