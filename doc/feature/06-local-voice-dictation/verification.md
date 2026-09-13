# 06-local-voice-dictation — Verification

**Date**: 2026-09-13

**Status**: IN PROGRESS — native Mac checkpoint PASS; Windows remains

**Sources**: [req.md](req.md), [solution.md](solution.md), [plan.md](plan.md)

## Current checkpoint

The earlier external `whisper-cli` Mac implementation passed live English and
Estonian dictation with the full model. The approved native-host revision is
implemented, built, and user-verified through the Extension Development Host on
Mac. Windows compilation and testing remain pending, so no final R1 verdict is
issued.

## Reference environment and retained model evidence

| Item | Evidence |
|---|---|
| OS | Apple-silicon macOS, Arm64 |
| VS Code | 1.137.0, Arm64 |
| Native source | external whisper.cpp v1.9.2 checkout, commit `306c88f4` |
| Model | official full `ggml-large-v3-turbo.bin`, 1,624,555,275 bytes |
| Model SHA-1 | `4af2b29d7ec73d781377bfd1758ca957a807e941` |
| Model path | external user-configured DSHmux model cache |

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
- Focused configuration, preflight, worker protocol, controller, chrome, and
  view tests: **53/53 PASS**.
- Fake-host integration proves exact argument-array values, JSONL
  ready/partial/final mapping, sanitized metrics, and clean process exit.
- Preflight tests prove bundled path selection for `darwin-arm64` and
  `win32-x64`, explicit override validation, cached-model validation, and SDL
  capture-id validation.
- DSHmux-scoped full suite: **256 PASS, 0 FAIL, 1 SKIP**. An unscoped
  `node --test` also discovered the user's untracked `tmp/deepseek-harness`
  checkout; those unrelated results are excluded without modifying the
  checkout.
- `npx vsce ls` includes the host, SDL2, SDL3, and notices. It excludes the
  model, native build tree, and external whisper.cpp checkout.

## Licenses and redistribution

whisper.cpp and OpenAI Whisper use the MIT license; SDL2 uses the zlib license.
Those licenses allow modification, linking, and redistribution of the compiled
runtime. `runtime/THIRD_PARTY_NOTICES.md` accompanies the artifacts. The model
weights remain outside the repository and package.

## Outstanding evidence

1. Windows x64 build artifact, DLL/dependency audit, automated tests, live
   English/Estonian result, offline behavior, and lifecycle checks.
2. Final RTTM/code-called audit, verdict, plan review, summary, and mechanical
   TODO extraction after both platform checkpoints.
