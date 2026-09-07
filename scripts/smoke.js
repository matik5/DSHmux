// Cross-platform smoke test: resolve dsh, spawn `dsh web --port 0`, create a
// session for $HOME, and verify it appears in session.list with the matching
// cwd. Used by CI on macOS/Linux/Windows.
"use strict";
const { DshServerManager, sameFsPath } = require("../out/serverManager.js");
(async () => {
  const manager = new DshServerManager();
  const cwd = process.env.HOME || process.env.USERPROFILE;
  const url = await manager.start({
    cwd,
    ...(process.env.DSH_HOME ? { dshHome: process.env.DSH_HOME } : {}),
  });
  // Probe through the manager's own api(): token-auth DSH (>= 0.1.2-alpha)
  // requires the browser-session cookie on /api, and 0.1.2-rc.1 dropped the
  // legacy dot endpoints (host.describe is gone) — api() carries the cookie
  // and the remote/legacy 404 fallback that a raw fetch cannot.
  // Creating a session for $HOME proves both the auth and the
  // workspace/cwd binding; the created row is then asserted in session.list.
  const created = await manager.api("session.create", { cwd });
  if (!created?.sessionId) {
    throw new Error(`session.create returned unexpected shape: ${JSON.stringify(created)}`);
  }
  const value = await manager.api("session.list", {});
  const items = Array.isArray(value?.items) ? value.items : [];
  const row = items.find(
    (s) => s.sessionId === created.sessionId
      && (s.cwd === cwd || (typeof s.cwd === "string" && sameFsPath(s.cwd, cwd)))
  );
  if (!row) {
    throw new Error(
      `created session ${created.sessionId} with cwd ${cwd} missing from session.list: ${JSON.stringify(value)}`
    );
  }
  console.log(`smoke OK: ${url} session=${created.sessionId} cwd=${row.cwd}`);
  manager.stop();
  await new Promise((r) => manager.once("exit", r));
  process.exit(0);
})().catch((e) => {
  console.error("smoke FAIL:", e.message);
  process.exit(1);
});
