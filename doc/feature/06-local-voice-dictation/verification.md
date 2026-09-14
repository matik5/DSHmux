# 06-local-voice-dictation — Verification

**Date**: 2026-09-14

**Status**: CLOSED — **CONDITIONAL GO**

**Sources**: [req.md](req.md), [solution.md](solution.md), [plan.md](plan.md)

## Current checkpoint

The managed-model and native-host revision is implemented and verified on the
available boundaries. Mac Arm64 passed live native dictation through the
Extension Development Host. Windows x64 passes build, package, real executable,
full-model load, managed-cache, and worker integration checks, but this Windows
machine exposes no microphone capture endpoint. The final verdict is therefore
CONDITIONAL GO rather than GO.

## Reference environment and retained model evidence

| Item | Evidence |
|---|---|
| OS | Apple-silicon macOS, Arm64 |
| VS Code | 1.137.0, Arm64 |
| Native source | external whisper.cpp v1.9.2 checkout, commit `306c88f4` |
| Model | official full `ggml-large-v3-turbo.bin`, 1,624,555,275 bytes |
| Model SHA-1 | `4af2b29d7ec73d781377bfd1758ca957a807e941` |
| Model path | home-redacted `~/.dshmux/models/ggml-large-v3-turbo.bin` |

The earlier live batch result was exact for both fixed phrases and was not
automatically sent:

| Language | Expected and observed earlier output |
|---|---|
| Estonian | `Palun vaata üle selle projekti testid ja paranda katkised testid.` |
| English | `Please review the project tests and fix the failing tests.` |

This establishes the model quality ceiling and unchanged composer seam, not yet
the new native host's microphone result.

## Native host build evidence

- `native/dictation-host/build-macos.sh` completed against the pinned checkout.
- `runtime/darwin-arm64/dsh-dictation-host` is a thin Arm64 Mach-O executable,
  approximately 2.5 MiB and ad-hoc signed by the linker.
- Whisper and GGML are statically linked. `otool -L` lists the adjacent
  `@executable_path/libSDL2-2.0.0.dylib` plus Apple system frameworks; it does
  not list Homebrew Whisper/GGML paths.
- The first live launch crashed before `main()` in `sdl2-compat`'s `dllinit`.
  The crash report proved that the copied compatibility dylib dynamically
  required SDL3. The build now copies `libSDL3.dylib` beside it and fails unless
  an invalid-argument startup smoke produces the expected JSON event.
- The adjacent SDL2 dylib is approximately 512 KiB and SDL3 approximately 2.5
  MiB. The corrected startup smoke passes.
- SHA-256: host `9b34b8771effcca4f67c21f500369c13f5d57c083eec14009cfa12aba7e47ce5`,
  SDL2 `977652abdd3222e623325263f6954a141ebe655dd84ac72bfd55528c3cbf68f6`,
  SDL3 `42dc953f134d7a024ac0f729ce39e3977e5ecfaca0bc42df40c877185d0b05d7`.
- Compiler prefix maps and Mach-O cleanup remove checkout/user paths and local
  Homebrew rpaths from the distributed host. A tracked-text and binary-string
  audit finds no machine-local user path or personal email address.
- Audio capture is an SDL callback into a mutex-protected vector capped at 30
  seconds. No WAV or other recording file is created.
- Full inference runs from a snapshot, not inside the audio callback. Partial
  cadence defaults to 750 ms and is rejected below 250 ms.
- JSON escaping, language validation, model failure, microphone failure, Stop,
  Cancel, partial, and final event paths exist in the compiled host source.

## Automated evidence for the native revision

- Native CMake Release build: PASS.
- Corrected native direct live run: PASS — `ready`, changing Estonian partials,
  one final transcript, and clean exit code 0 were observed.
- Corrected native real-model Cancel run: PASS — `ready`, `cancelled`, clean
  exit code 0, and no remaining `dsh-dictation-host` process.
- Extension Development Host live checkpoint: PASS — the user confirmed the
  bundled native host works through the microphone control. This confirms the
  visible partial/final path, final insertion into the editable DSH composer,
  and unchanged no-auto-Send behavior requested for the retest.
- TypeScript compile: PASS.
- Managed-model, configuration, preflight, worker protocol, controller, chrome,
  and view tests pass, including a real Windows PE fake-host launch.
- Fake-host integration proves exact argument-array values, JSONL
  ready/partial/final mapping, sanitized metrics, and clean process exit.
- Preflight tests prove bundled path selection for `darwin-arm64` and
  `win32-x64`, explicit override validation, cached-model validation, and SDL
  capture-id validation.
- Final DSHmux-scoped full suite: **270 PASS, 0 FAIL, 1 SKIP**. The one skip is
  the POSIX-shebang worker fixture on Windows; the separate Windows test builds
  and runs its PE fixture. An earlier unscoped
  `node --test` also discovered the user's untracked `tmp/deepseek-harness`
  checkout; those unrelated results are excluded without modifying the
  checkout.
- `npx vsce ls` includes the host, SDL2, SDL3, and notices. It excludes the
  model, native build tree, and external whisper.cpp checkout.

## Managed model setup

- `LocalDictationModelManager` is called by `DshChatView` at enabled activation,
  on a transition to enabled, and before microphone Start. Disabled, remote, and
  unsupported targets do not call `ensure()`; disposal and disabling cancel it.
- The identity is fixed to `ggml-large-v3-turbo.bin`, 1,624,555,275 bytes,
  SHA-1 `4af2b29d7ec73d781377bfd1758ca957a807e941`, from an HTTPS whisper.cpp model
  URL. There is no user-configurable model path.
- Deterministic tests cover both home-relative platform paths, offline cache
  reuse, redirects, streamed and partial writes, exact size/hash enforcement,
  overflow, short data, checksum mismatch, cancellation, partial cleanup,
  preservation of an existing canonical file on failure, and single-flight.
- The Windows file was verified at the former `%LOCALAPPDATA%` location, moved
  to `%USERPROFILE%\.dshmux\models`, and re-verified. Source is absent; the
  destination is 1,624,555,275 bytes with the expected SHA-1 and has no sibling
  `.part` file.
- A production-manager cache check against that real file completed in 1,973 ms
  and returned the canonical path without downloading. The deterministic
  offline test injects a request function that throws if called and proves zero
  network requests for a verified cache.
- `npx vsce ls` includes the Mac and Windows hosts and their adjacent SDL
  libraries. It includes neither the model nor any `.part` file.

## Windows x64 build checkpoint

- OS: Windows 11 Home x64, build `10.0.26100`.
- Toolchain: Visual Studio Community 2026 `18.10.0`, MSVC
  `19.51.36257.0`, and bundled CMake `4.3.1-msvc1`.
- Native source: external `C:\proj\whisper.cpp` checkout at tag `v1.9.2`,
  commit `306c88f4d1286aec1bf96e544632897886af5501`.
- SDL source: official SDL `2.32.10` VC development archive. Archive SHA-256:
  `af347939395a58b365846aaea27391e69f9ec9d4dd650d6ac40802159b418a6e`.
- `runtime/win32-x64/dsh-dictation-host.exe`: x64 Windows CUI PE,
  2,075,648 bytes, SHA-256
  `c9308987a2d4d43ff78820ecc130ca2926373759e49e7a58d128e8d3bdc1965f`.
- `runtime/win32-x64/SDL2.dll`: 1,586,176 bytes, SHA-256
  `b37740a72a7a9706216df9f0134894bb7a850b356fd149398c67d874cbcfacb4`.
- Whisper/GGML and the MSVC runtime are statically linked. OpenMP is disabled
  to avoid a `VCOMP140.dll` deployment dependency. PE imports contain only
  adjacent `SDL2.dll` and Windows system libraries.
- MSVC `/pathmap` plus deterministic compilation removes checkout and build
  paths. Binary scans find no `C:\proj`, user-home path, username, or personal
  email in either packaged artifact.
- Invalid-argument startup smoke: PASS — one bounded
  `{"event":"error","code":"invalid-arguments"}` event and exit code 2.
- Full model setup: PASS — `%USERPROFILE%\.dshmux\models\ggml-large-v3-turbo.bin`,
  1,624,555,275 bytes, SHA-1
  `4af2b29d7ec73d781377bfd1758ca957a807e941`. The packaged host loaded the
  model successfully through the CPU backend.
- Real microphone startup: FAIL at the environment boundary. SDL reports zero
  capture devices and WASAPI reports `Element not found`; FFmpeg independently
  reports no DirectShow audio input devices. Windows audio services are running
  and non-packaged microphone privacy access is allowed, so the current blocker
  is the absence of a present capture endpoint rather than permission or model
  failure. The host emits only `microphone-unavailable` on protocol stdout and
  keeps the detailed device/open reason on ignored stderr.
- TypeScript compile and final DSHmux-scoped suite: **270 PASS, 0 FAIL, 1 SKIP**.
  The Windows-specific worker integration test compiles a temporary PE fixture,
  spawns it with the production-required `shell: false`, and verifies safe
  arguments plus ready/partial/Stop/final/metrics JSONL mapping. The skipped
  test is the equivalent POSIX-shebang fixture.
- `npx vsce ls` includes both Windows runtime files and notices, and excludes
  the external checkout, build tree, SDL development package, and model.

The packaged real executable was rerun after the move and loaded the canonical
model successfully. It again reported `SDL capture devices: 0`, WASAPI
`Element not found`, and bounded protocol error `microphone-unavailable`.
Therefore Windows live microphone capture, English/Estonian transcripts,
composer insertion, cancellation, and performance remain unmeasured on this
reference machine. Offline model availability and the worker-to-composer
contract are independently verified, but they do not substitute for live audio.

## Licenses and redistribution

whisper.cpp and OpenAI Whisper use the MIT license; SDL2 uses the zlib license.
Those licenses allow modification, linking, and redistribution of the compiled
runtime. `runtime/THIRD_PARTY_NOTICES.md` accompanies the artifacts. The model
weights remain outside the repository and package.

## Settings presentation

- `contributes.configuration` contains three ordered groups: `DSHmux` (10),
  `DSHmux: Feedback Sounds` (20), and `DSHmux: Experimental` (30).
- The feedback group owns the unchanged `completionSound`, `soundStart`,
  `soundDone`, and `soundAsk` keys. The experimental group owns all four
  unchanged `experimental.localDictation` keys.
- The manifest regression test confirms group adjacency, membership, localized
  titles, the visible 1.6 GB model-size notice, and retention of the
  machine-overridable `dshPath` setting.
- Mac DSHmux-scoped verification: **270 PASS, 0 FAIL, 2 platform skips**.
- `vsce package`: PASS; the generated 0.4.8 VSIX contains the revised manifest
  and both localization files.

## Close-out audit

| Requirement | Called implementation and evidence | Result |
|---|---|---|
| R1/R2 | Bundled native hosts, Mac live checkpoint, Windows real-executable and environment probes | Partial: Windows live boundary blocked |
| R3 | `LocalDictationModelManager` → `DshChatView` → canonical preflight → worker argument array | PASS |
| R4 | `DshChatView` state events → chrome dictation messages → existing composer insertion seam | PASS on Mac; deterministic Windows contract PASS; Windows live audio blocked |
| R5 | Opt-in target gate, single-flight setup, bounded child process and audio buffer | PASS |
| R6 | 270/0/1 suite, package listing, checksums, Mac live evidence, repeated Windows probe | Partial: Windows live phrases/latency/RSS unavailable |
| R7 | Ordered `contributes.configuration` array plus manifest regression test | PASS |

Every plan item marked ✅ has both code and a caller or recorded runtime/package
evidence. No managed-model implementation is dead code: `DshChatView` owns and
calls the manager, preflight derives the same canonical path, and the worker
passes that validated path to the native host without a shell. The only gap is
T9's live Windows microphone checkpoint.

The settings manifest now exposes general settings first, `DSHmux: Feedback
Sounds` second, and `DSHmux: Experimental` third. A deterministic manifest test
confirms that feedback sounds directly precede experimental dictation and that
all existing setting keys remain in their intended group.

## Verdict — CONDITIONAL GO

- **Model accuracy**: PASS on the recorded Mac English and Estonian phrases.
- **Local runtime and data boundary**: PASS. Audio/transcripts stay in the
  native/local composer path, and the model cache is checksum-verified and
  external to the extension package.
- **Microphone capture and composer integration**: PASS on Mac. Windows remains
  blocked before capture because the reference machine exposes zero endpoints.
- **Licensing and packaging**: PASS for the prototype: MIT Whisper/whisper.cpp,
  zlib SDL2, notices included, model excluded.
- **Portability**: build/load/protocol PASS on Windows x64, but live semantic and
  performance evidence is incomplete.

Smallest next step: attach or enable one Windows recording endpoint, then rerun
the two fixed phrases through the Extension Development Host and record
default/explicit device, Stop/final insertion, Cancel, offline mode, latency,
peak RSS, no auto-Send, and no temporary audio file. No backend change is needed
or authorized.
