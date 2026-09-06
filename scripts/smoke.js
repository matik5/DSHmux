// Cross-platform smoke test: resolve dsh, spawn `dsh web --port 0`, verify the
// API answers session.list. Used by CI on macOS/Linux/Windows.
"use strict";
const { DshServerManager } = require("../out/serverManager.js");
(async () => {
  const manager = new DshServerManager();
  const url = await manager.start({
    cwd: process.env.HOME || process.env.USERPROFILE,
    ...(process.env.DSH_HOME ? { dshHome: process.env.DSH_HOME } : {}),
  });
  // Probe through the manager's own api(): token-auth DSH (>= 0.1.2-alpha)
  // requires the browser-session cookie on /api, and 0.1.2-rc.1 dropped the
  // legacy dot endpoints (host.describe is gone) — api() carries the cookie
  // and the remote/legacy 404 fallback that a raw fetch cannot.
  const value = await manager.api("session.list", {});
  const count = Array.isArray(value?.items) ? value.items.length : -1;
  if (count < 0) throw new Error(`session.list returned unexpected shape: ${JSON.stringify(value)}`);
  console.log(`smoke OK: ${url} sessions=${count}`);
  manager.stop();
  await new Promise((r) => manager.once("exit", r));
  process.exit(0);
})().catch((e) => {
  console.error("smoke FAIL:", e.message);
  process.exit(1);
});
