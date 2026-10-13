#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/../.." && pwd)
: "${WHISPER_CPP_DIR:?Set WHISPER_CPP_DIR to a pinned whisper.cpp checkout}"
whisper_dir=$WHISPER_CPP_DIR
build_dir=${DICTATION_BUILD_DIR:-$script_dir/build-macos}
runtime_dir="$repo_root/runtime/darwin-arm64"
sdl2_prefix=${SDL2_PREFIX:-$(brew --prefix sdl2-compat)}
sdl3_prefix=${SDL3_PREFIX:-$(brew --prefix sdl3)}

cmake -S "$script_dir" -B "$build_dir" \
  -DWHISPER_CPP_DIR="$whisper_dir" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_PREFIX_PATH="${SDL2_DIR:-$sdl2_prefix}"
cmake --build "$build_dir" --config Release --target dsh-dictation-host -j

mkdir -p "$runtime_dir"
cp "$build_dir/dsh-dictation-host" "$runtime_dir/dsh-dictation-host"
chmod 755 "$runtime_dir/dsh-dictation-host"

if otool -L "$runtime_dir/dsh-dictation-host" | grep -q "$sdl2_prefix/.*libSDL2"; then
  cp "$sdl2_prefix/lib/libSDL2-2.0.0.dylib" "$runtime_dir/libSDL2-2.0.0.dylib"
  cp "$sdl3_prefix/lib/libSDL3.0.dylib" "$runtime_dir/libSDL3.dylib"
  chmod 644 "$runtime_dir/libSDL2-2.0.0.dylib"
  chmod 644 "$runtime_dir/libSDL3.dylib"
  install_name_tool -change \
    "$sdl2_prefix/lib/libSDL2-2.0.0.dylib" \
    @executable_path/libSDL2-2.0.0.dylib \
    "$runtime_dir/dsh-dictation-host"
  if otool -l "$runtime_dir/dsh-dictation-host" | grep -q "$sdl2_prefix/lib"; then
    install_name_tool -delete_rpath "$sdl2_prefix/lib" "$runtime_dir/dsh-dictation-host"
  fi
  install_name_tool -id @loader_path/libSDL2-2.0.0.dylib "$runtime_dir/libSDL2-2.0.0.dylib"
  install_name_tool -id @loader_path/libSDL3.dylib "$runtime_dir/libSDL3.dylib"
  codesign --force --sign - "$runtime_dir/libSDL2-2.0.0.dylib"
  codesign --force --sign - "$runtime_dir/libSDL3.dylib"
  codesign --force --sign - "$runtime_dir/dsh-dictation-host"
fi

if ! "$runtime_dir/dsh-dictation-host" --invalid 2>/dev/null | grep -q '"code":"invalid-arguments"'; then
  echo "Bundled runtime startup smoke failed" >&2
  exit 1
fi

echo "Built $runtime_dir/dsh-dictation-host"
