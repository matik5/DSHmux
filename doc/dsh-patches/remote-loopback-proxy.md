# Remote Loopback Proxy Mapping Patch

**Date**: 2026-08-31  
**Status**: Already merged into DSHmux  
**Target**: `matik5/DSHmux`  
**Base**: `d6aa2e2b2537818831f61595063680f082bc1318`  
**Fix commit**: `3557288a923aac3d7bb8150f79bbfaeb59e1525b`  
**Artifact**: [remote-loopback-proxy.patch](remote-loopback-proxy.patch)

## Problem

Harness emits absolute plugin bundle URLs on its loopback HTTP server. In a
local VS Code window, the webview and extension host reach the same loopback
interface. In Remote SSH, WSL, or a dev container, an un-mapped webview URL can
instead resolve against the user's local machine.

The shell HTML loads but Harness plugins fail with errors such as:

```text
Failed to load plugins
HTML did not preload @deepseek-ai/dsh-client-modules/client.js
```

## Change

DSHmux derives a VS Code `WebviewPortMapping` from the active Harness server
URL and installs it on both the sidebar chat view and editor panel. VS Code then
maps the webview's loopback port to the remote extension-host port.

The helper intentionally accepts only explicit loopback HTTP(S) ports:

- `localhost`
- `127.0.0.1`
- `0.0.0.0`
- `::1`

Malformed URLs, non-loopback hosts, and implicit ports are not mapped. The fix
does not weaken Harness's `/api` trust fence or expose `dsh web` on a public
interface.

## Apply

This patch is archival because the fix is already part of current DSHmux
`main`. To replay it on the documented older base:

```sh
git apply --check /path/to/DSHmux/doc/dsh-patches/remote-loopback-proxy.patch
git am --3way /path/to/DSHmux/doc/dsh-patches/remote-loopback-proxy.patch
```

Do not apply it again to a revision that already contains
`src/webviewPortMapping.ts`.

## Verify

```sh
npm test
```

Then open DSHmux in a Remote SSH, WSL, or dev-container window and confirm that
the Harness shell and plugin-provided chat UI both load. A local window should
continue to work through the same no-op-compatible mapping.
