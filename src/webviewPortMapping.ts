import type { WebviewPortMapping } from "vscode";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"]);

/**
 * Route loopback HTTP URLs in a webview to the extension host.
 *
 * This is a no-op for a local extension host. In Remote SSH/WSL/containers,
 * VS Code opens a tunnel to `extensionHostPort`, so an absolute DSH plugin URL
 * such as http://127.0.0.1:42873/plugins/... reaches the remote DSH process
 * instead of the user's local machine.
 */
export function dshWebviewPortMappings(serverBase?: string): readonly WebviewPortMapping[] {
  if (!serverBase) return [];
  try {
    const url = new URL(serverBase);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || !LOOPBACK_HOSTS.has(url.hostname)) {
      return [];
    }
    if (!url.port) return [];
    const port = Number(url.port);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) return [];
    return [{ webviewPort: port, extensionHostPort: port }];
  } catch {
    return [];
  }
}
