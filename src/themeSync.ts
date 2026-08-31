// Theme sync (R7/T12): mirror the VS Code color theme into the DSH host
// settings via the api (settings.update ns "ui-theme"), so the embedded UI
// never renders light-on-dark. Honored only while `dshmux.themeSync` is
// "follow" (default); the pre-rename key remains a read-only fallback.
import * as vscode from "vscode";
import { dshmuxConfiguration } from "./configuration.js";

const SETTINGS_NS = "ui-theme";

function preferenceFor(kind: vscode.ColorThemeKind): "dark" | "light" {
  return kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast
    ? "dark"
    : "light";
}

async function syncNow(
  getServerBase: () => string | undefined,
  getCookie?: () => string | undefined
): Promise<void> {
  const base = getServerBase();
  if (!base) return;
  if (dshmuxConfiguration("themeSync", "follow") !== "follow") return;
  const preference = preferenceFor(vscode.window.activeColorTheme.kind);
  const headers: Record<string, string> = { "content-type": "application/json" };
  const cookie = getCookie?.();
  if (cookie) headers.cookie = cookie;
  try {
    await fetch(base + "/api/settings.update", {
      method: "POST",
      headers,
      body: JSON.stringify({
        type: "client-request",
        rpcId: "theme-sync-" + Date.now(),
        method: "settings.update",
        payload: { ns: SETTINGS_NS, patch: { preference } },
      }),
    });
  } catch (err) {
    console.log("[dsh] theme sync failed:", err);
  }
}

/** Register the theme-change listener; returns syncNow for start-time calls. */
export function registerThemeSync(
  context: vscode.ExtensionContext,
  getServerBase: () => string | undefined,
  /** Optional DSH browser-session cookie provider (token-auth servers). */
  getCookie?: () => string | undefined
): { syncNow: () => Promise<void> } {
  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme(() => {
      void syncNow(getServerBase, getCookie);
    })
  );
  return { syncNow: () => syncNow(getServerBase, getCookie) };
}
