#!/usr/bin/env bash
# Install the DSHmux extension from a local .vsix.
#
# Usage:
#   scripts/install.sh [VSIX] [CLI] [--bump [patch|minor|major]]
#
#   VSIX  Path to the .vsix to install.
#         Default: the freshly-built one in the repo root
#         (<name>-<version>.vsix).
#   CLI   IDE CLI to install with. Default: "code" (VS Code). May be a command
#         on PATH, a shell alias/function (e.g. your `code` alias), or a full
#         path to the binary. Pass your Antigravity build's binary name (e.g.
#         "antigravity") to target that fork instead.
#   --bump [level]
#         Bump the extension version (package.json + package-lock.json) by
#         <level>, rebuild the .vsix, then install it. <level> is patch by
#         default: patch (x.y.z -> x.y.(z+1)), or use minor / major.
#         No git commit or tag is made; you commit the bump yourself.
#
# Examples:
#   make package && scripts/install.sh          # build, then install into VS Code
#   scripts/install.sh                          # install the built vsix into VS Code
#   scripts/install.sh --bump                   # bump patch, rebuild, install
#   scripts/install.sh --bump minor             # bump minor, rebuild, install
#   scripts/install.sh dist/my.vsix             # install a specific vsix
#   scripts/install.sh "" antigravity --bump    # bump patch, rebuild, install into Antigravity
#   scripts/install.sh "" /path/to/code         # install with an explicit binary path
#
# The script only ever runs `<CLI> --install-extension <VSIX>` (plus, with
# --bump, `npm version` + `make package`); it does not publish anywhere or
# touch the network.
set -euo pipefail

# Resolve the repo root (this script lives in scripts/).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

# --- Parse arguments ---------------------------------------------------------
# Positional: [VSIX] [CLI]. Flag: --bump [patch|minor|major].
BUMP=""
BUMP_LEVEL="patch"
POSITIONAL=()
while [ $# -gt 0 ]; do
  case "$1" in
    --bump)
      BUMP="1"
      shift
      if [ $# -gt 0 ] && [[ "$1" =~ ^(patch|minor|major)$ ]]; then
        BUMP_LEVEL="$1"
        shift
      fi
      ;;
    --bump=*)
      BUMP="1"
      BUMP_LEVEL="${1#--bump=}"
      shift
      ;;
    *)
      POSITIONAL+=("$1")
      shift
      ;;
  esac
done
VSIX="${POSITIONAL[0]:-}"
CLI_NAME="${POSITIONAL[1]:-code}"
if [ "${#POSITIONAL[@]}" -gt 2 ]; then
  echo "Error: too many positional arguments (expected at most VSIX and CLI)." >&2
  exit 1
fi
if [ -n "$BUMP" ] && [ -n "$VSIX" ]; then
  echo "Error: --bump cannot be combined with an explicit VSIX path." >&2
  echo "Leave VSIX empty so the newly built DSHmux package is installed." >&2
  exit 1
fi

# --- Bump the version + rebuild (optional) -----------------------------------
# `npm version <level> --no-git-tag-version` bumps package.json and
# package-lock.json in place without any git commit or tag.
if [ -n "$BUMP" ]; then
  case "$BUMP_LEVEL" in
    patch|minor|major) ;;
    *)
      echo "Error: invalid bump level '${BUMP_LEVEL}' (use patch, minor, or major)." >&2
      exit 1
      ;;
  esac
  echo "Bumping version by '${BUMP_LEVEL}' ..."
  npm version "${BUMP_LEVEL}" --no-git-tag-version
  echo "Rebuilding .vsix ..."
  make package
fi

# --- Resolve the .vsix ------------------------------------------------------
VERSION="$(node -p "require('./package.json').version" 2>/dev/null || true)"
NAME="$(node -p "require('./package.json').name" 2>/dev/null || true)"
DEFAULT_VSIX="${NAME}-${VERSION}.vsix"
VSIX="${VSIX:-${DEFAULT_VSIX}}"

# --- Resolve the IDE CLI -----------------------------------------------------
# `code` is often a shell *alias* (not a real PATH command), which a
# non-interactive script cannot see. Resolve it in this order:
#   1. an existing executable path (user passed a full path)
#   2. a real command on PATH
#   3. a safely named alias/function in the user's interactive login shell
#   4. a known VS Code install location (macOS app bundle)

resolve_cli_path() {
  local name="$1" cand app
  # 1. Already a usable path?
  if [ -n "$name" ] && [ -x "$name" ]; then printf '%s\n' "$name"; return 0; fi
  # 2. Real command on PATH?
  if cand="$(command -v "$name" 2>/dev/null)" && [ -n "$cand" ] && [ -x "$cand" ]; then
    printf '%s\n' "$cand"
    return 0
  fi
  # 3. Known VS Code install location (only for the default "code" target).
  if [ "$name" = "code" ]; then
    for app in \
      "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" \
      "$HOME/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"; do
      if [ -x "$app" ]; then printf '%s\n' "$app"; return 0; fi
    done
  fi
  return 1
}

resolve_shell_cli() {
  local name="$1" shell="${SHELL:-/bin/sh}"
  # The name is interpolated into `-c`, so admit command-name characters only.
  # VSIX and CLI arguments remain positional parameters and are never eval'd.
  [[ "$name" =~ ^[A-Za-z_][A-Za-z0-9_.+-]*$ ]] || return 1
  [ -x "$shell" ] || return 1
  "$shell" -ic "type ${name} >/dev/null 2>&1" </dev/null >/dev/null 2>&1 || return 1
  printf '%s\n' "$shell"
}

# --- Validate ----------------------------------------------------------------
if [ ! -f "${VSIX}" ]; then
  echo "Error: vsix not found: ${VSIX}" >&2
  echo "Build it first:  make package   (or: npm run package)" >&2
  exit 1
fi

CLI=""
CLI_SHELL=""
if CLI="$(resolve_cli_path "${CLI_NAME}")"; then
  echo "Using IDE CLI: ${CLI}"
elif CLI_SHELL="$(resolve_shell_cli "${CLI_NAME}")"; then
  echo "Using IDE shell command: ${CLI_NAME} (${CLI_SHELL})"
else
  echo "Error: could not resolve IDE CLI '${CLI_NAME}' to a runnable binary." >&2
  echo "It is not on PATH, not a resolvable alias, and not at a known install location." >&2
  echo "Pass the full path to the binary as the 2nd argument, e.g.:" >&2
  echo "  scripts/install.sh \"\" \"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code\"" >&2
  exit 1
fi

# --- Install -----------------------------------------------------------------
echo "Installing ${VSIX} via '${CLI_NAME} --install-extension' ..."
if {
  if [ -n "$CLI_SHELL" ]; then
    # CLI_NAME was validated above. The VSIX and flags are passed as quoted
    # positional parameters, so shell aliases/functions work without eval.
    "$CLI_SHELL" -ic "${CLI_NAME} \"\$@\"" dshmux-install --install-extension "$VSIX" --force
  else
    "$CLI" --install-extension "$VSIX" --force
  fi
}; then
  echo "Done. DSHmux installed via ${CLI_NAME}."
  echo "Reload the window (or restart the IDE) to activate it."
else
  echo "Error: '${CLI_NAME} --install-extension ${VSIX}' failed." >&2
  exit 1
fi
