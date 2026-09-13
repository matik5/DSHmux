# DSH dictation host

Small native microphone and Whisper inference process for the experimental
DSHmux dictation feature. It owns microphone capture and keeps one model loaded
for the lifetime of a dictation session. The extension communicates over JSON
Lines on stdin/stdout.

The build expects a pinned whisper.cpp v1.9.2 checkout. Pass its location only
through `WHISPER_CPP_DIR`; the path is not stored in source or runtime artifacts.

```sh
WHISPER_CPP_DIR=/path/to/whisper.cpp native/dictation-host/build-macos.sh
```

On Windows, install SDL2 development files (for example through vcpkg), set
`SDL2_DIR` when CMake cannot discover them, then run:

```powershell
native\dictation-host\build-windows.ps1
```

Protocol events:

```json
{"event":"ready"}
{"event":"transcript","phase":"partial","text":"editable text"}
{"event":"transcript","phase":"final","text":"final editable text"}
```

Commands:

```json
{"command":"stop"}
{"command":"cancel"}
```

On macOS the Homebrew `sdl2-compat` dylib dynamically loads SDL3, so the build
script copies both libraries and performs a startup smoke test before succeeding.

The current prototype retains at most 30 seconds of microphone audio in memory.
It does not create a WAV file or send audio/transcripts over the network.
