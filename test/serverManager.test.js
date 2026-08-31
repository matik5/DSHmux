// Unit tests for src/serverManager.ts (compiled to out/serverManager.js).
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const { parseUrlLine, splitLaunchUrl, resolveDshPath, resolveStartBin, probeNoOpenSupport, resolveNodeExecutable, spawnEnvironment, spawnSpec, DshServerManager, sameFsPath } = require("../out/serverManager.js");

/**
 * Write an executable fake dsh into a temp dir (platform-aware shim).
 * opts.helpNoOpen: `web --help` advertises --no-open (rc.8+ web-app shape).
 * opts.recordArgs: file receiving the argv of every non-help invocation,
 * so tests can assert exactly what the manager spawns.
 */
function fakeDsh(dir, opts = {}) {
  const helpOut = opts.helpNoOpen ? `process.stdout.write("  --no-open  do not open the Web UI in the default browser\\n");\n` : "";
  const help = `if (process.argv.includes("--help")) { ${helpOut}process.exit(0); }\n`;
  const record = opts.recordArgs
    ? `if (!process.argv.includes("--help")) require("node:fs").writeFileSync(${JSON.stringify(opts.recordArgs)}, JSON.stringify(process.argv.slice(2)));\n`
    : "";
  const urlLine = opts.urlLine ?? "dsh web: http://127.0.0.1:34567";
  const body = opts.quiet
    ? `${help}${record}setInterval(() => {}, 1000);\n`
    : `${help}${record}process.stdout.write(${JSON.stringify(urlLine + "\n")});\nprocess.on("SIGTERM", () => process.exit(0));\nsetInterval(() => {}, 1000);\n`;
  if (process.platform === "win32") {
    // Windows: cmd.exe cannot run unix-shebang scripts; ship a .cmd wrapper.
    const impl = path.join(dir, "dsh-impl.js");
    fs.writeFileSync(impl, body);
    const cmd = path.join(dir, "dsh.cmd");
    fs.writeFileSync(cmd, `@echo off\r\nnode "%~dp0dsh-impl.js" %*\r\n`);
    return cmd;
  }
  const file = path.join(dir, "dsh");
  fs.writeFileSync(file, `#!/usr/bin/env node\n${body}`);
  fs.chmodSync(file, 0o755);
  return file;
}

/**
 * Write the same fake as a source-checkout-style JavaScript entry. Unlike
 * fakeDsh(), this file has no executable bit or .cmd wrapper, so start() must
 * invoke it through Node. Keep a space in the path to exercise argument
 * quoting on Windows as well.
 */
function fakeDshJs(dir, opts = {}) {
  const sourceDir = path.join(dir, "patched harness");
  fs.mkdirSync(sourceDir, { recursive: true });
  const file = path.join(sourceDir, "bin.js");
  const helpOut = opts.helpNoOpen
    ? 'process.stdout.write("  --no-open  do not open the Web UI\\n");\n'
    : "";
  const record = opts.recordArgs
    ? `require("node:fs").writeFileSync(${JSON.stringify(opts.recordArgs)}, JSON.stringify(process.argv.slice(2)));\n`
    : "";
  const body = [
    'if (process.argv.includes("--version")) { process.stdout.write("0.1.1-test\\n"); process.exit(0); }',
    `if (process.argv.includes("--help")) { ${helpOut}process.exit(0); }`,
    opts.failMessage
      ? `process.stderr.write(${JSON.stringify(`${opts.failMessage}\n`)}); process.exit(42);`
      : `${record}process.stdout.write("dsh web: http://127.0.0.1:34567\\n");\nprocess.on("SIGTERM", () => process.exit(0));\nsetInterval(() => {}, 1000);`,
  ].join("\n");
  fs.writeFileSync(file, `${body}\n`);
  return file;
}

const IS_WIN = process.platform === "win32";

function tmpdir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-sm-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
  return dir;
}

test("parseUrlLine extracts the ready URL", () => {
  assert.equal(parseUrlLine("dsh web: http://127.0.0.1:62750"), "http://127.0.0.1:62750");
  assert.equal(parseUrlLine("some other line"), null);
  assert.equal(parseUrlLine(""), null);
  assert.equal(parseUrlLine("prefix dsh web: http://127.0.0.1:3080 suffix"), "http://127.0.0.1:3080");
});

test("parseUrlLine keeps the launch token query (token-auth DSH)", () => {
  assert.equal(
    parseUrlLine("dsh web: http://127.0.0.1:62750/?token=abc-DEF_123"),
    "http://127.0.0.1:62750/?token=abc-DEF_123"
  );
  // The optional (LAN: …) suffix must not leak into the capture.
  assert.equal(
    parseUrlLine("dsh web: http://127.0.0.1:62750/?token=abc (LAN: http://192.168.1.5:62750)"),
    "http://127.0.0.1:62750/?token=abc"
  );
});

test("splitLaunchUrl splits origin and token", () => {
  assert.deepEqual(splitLaunchUrl("http://127.0.0.1:62750"), { base: "http://127.0.0.1:62750", token: undefined });
  assert.deepEqual(splitLaunchUrl("http://127.0.0.1:62750/?token=abc-DEF_123"), {
    base: "http://127.0.0.1:62750",
    token: "abc-DEF_123",
  });
});

test("resolveDshPath finds dsh in an injected home", (t) => {
  const home = tmpdir(t);

  // Case 1: npx cache glob.
  const npxDir = path.join(home, ".npm", "_npx", "abc123", "node_modules", ".bin");
  fs.mkdirSync(npxDir, { recursive: true });
  fs.writeFileSync(path.join(npxDir, "dsh"), "");
  assert.equal(resolveDshPath(home, "linux").path, path.join(npxDir, "dsh"));

  // Case 2: npm-global bin wins over npx cache (earlier in the order).
  const globalDir = path.join(home, ".npm-global", "bin");
  fs.mkdirSync(globalDir, { recursive: true });
  fs.writeFileSync(path.join(globalDir, "dsh"), "");
  assert.equal(resolveDshPath(home, "linux").path, path.join(globalDir, "dsh"));

  // Case 3: nothing found → null; home-derived tried entries are "~"-redacted
  // (machine-level candidates like npm prefix -g stay absolute).
  const empty = tmpdir(t);
  const res = resolveDshPath(empty, "linux");
  assert.equal(res.path, null);
  assert.ok(res.tried.some((p) => p.startsWith("~")));
  assert.ok(res.tried.every((p) => !p.includes(empty)));
});

test("resolveDshPath handles Windows layout (npm-cache _npx, dsh.cmd)", (t) => {
  const home = tmpdir(t);
  // Windows npx cache: %LocalAppData%\npm-cache\_npx\<hash>\node_modules\.bin\dsh.cmd
  const npxDir = path.join(home, "AppData", "Local", "npm-cache", "_npx", "winhash", "node_modules", ".bin");
  fs.mkdirSync(npxDir, { recursive: true });
  fs.writeFileSync(path.join(npxDir, "dsh.cmd"), "");
  const res = resolveDshPath(home, "win32");
  assert.equal(res.path, path.join(npxDir, "dsh.cmd"));
  // Windows must NOT probe macOS-only paths (homebrew / usr-local).
  assert.ok(res.tried.every((p) => !p.includes("opt/homebrew")));
});

test("resolveDshPath finds the standard Windows roaming npm dsh.cmd", (t) => {
  const home = tmpdir(t);
  const npmDir = path.join(home, "AppData", "Roaming", "npm");
  fs.mkdirSync(npmDir, { recursive: true });
  const cmd = path.join(npmDir, "dsh.cmd");
  fs.writeFileSync(cmd, "");
  assert.equal(resolveDshPath(home, "win32").path, cmd);
});

test("resolveDshPath prefers dsh.cmd over the extensionless shim on Windows", (t) => {
  const home = tmpdir(t);
  const npxDir = path.join(home, "AppData", "Local", "npm-cache", "_npx", "h2", "node_modules", ".bin");
  fs.mkdirSync(npxDir, { recursive: true });
  fs.writeFileSync(path.join(npxDir, "dsh"), "");
  fs.writeFileSync(path.join(npxDir, "dsh.cmd"), "");
  const res = resolveDshPath(home, "win32");
  // The extensionless Unix shim is not executable by cmd.exe (spawn exits
  // code 1), so the .cmd shim must win when both exist.
  assert.equal(res.path, path.join(npxDir, "dsh.cmd"));
});

test("spawnSpec runs JS entry files under Node, never VS Code/Electron", () => {
  const jsBin = "C:\\src\\deepseek-harness\\apps\\cli\\lib\\bin.js";
  const spec = spawnSpec(jsBin, "win32", "C:\\Program Files\\Microsoft VS Code\\Code.exe");
  assert.equal(spec.command, "node.exe");
  assert.deepEqual(spec.args, [jsBin]);
  assert.equal(spec.shell, false);
  // Reuse a genuine Node executable instead of doing another PATH lookup.
  assert.equal(
    spawnSpec(jsBin, "win32", "C:\\Program Files\\nodejs\\node.exe").command,
    "C:\\Program Files\\nodejs\\node.exe"
  );
  // WSL/remote POSIX hosts also need Node when the entry lives on a mount
  // without an executable bit.
  assert.equal(
    path.basename(spawnSpec("/mnt/c/src/apps/cli/lib/bin.mjs", "linux", "/usr/share/code/code").command),
    "node"
  );
});

test("Node resolution survives a desktop IDE's minimal macOS PATH", (t) => {
  const home = tmpdir(t);
  const node = path.join(home, ".local", "bin", "node");
  fs.mkdirSync(path.dirname(node), { recursive: true });
  fs.writeFileSync(node, "");
  fs.chmodSync(node, 0o755);
  const minimalEnv = { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", SHELL: "/missing-shell" };
  const resolved = resolveNodeExecutable(
    "darwin",
    "/Applications/Visual Studio Code.app/Contents/MacOS/Electron",
    home,
    minimalEnv
  );
  assert.equal(resolved, node);

  const spec = spawnSpec("/src/apps/cli/lib/bin.js", "darwin", "/Applications/Code", home, minimalEnv);
  const childEnv = spawnEnvironment(spec, minimalEnv, "darwin");
  assert.equal(spec.command, node);
  assert.equal(childEnv.PATH, `${path.dirname(node)}:/usr/bin:/bin:/usr/sbin:/sbin`);
});

test("spawnEnvironment preserves the Windows Path key and prepends Node", () => {
  const spec = {
    command: "C:\\Program Files\\nodejs\\node.exe",
    args: ["C:\\src\\bin.js"],
    shell: false,
    runtimePath: "C:\\Program Files\\nodejs",
  };
  const env = spawnEnvironment(spec, { Path: "C:\\Windows\\System32" }, "win32");
  assert.equal(env.Path, "C:\\Program Files\\nodejs;C:\\Windows\\System32");
  assert.equal(env.PATH, undefined);
});

test("spawnSpec keeps plain binaries as-is (shell only on Windows)", () => {
  const win = spawnSpec("C:\\Users\\u\\AppData\\Roaming\\npm\\dsh.cmd", "win32");
  assert.equal(win.command, "C:\\Users\\u\\AppData\\Roaming\\npm\\dsh.cmd");
  assert.deepEqual(win.args, []);
  assert.equal(win.shell, true);
  const posix = spawnSpec("/usr/local/bin/dsh", "linux");
  assert.equal(posix.command, "/usr/local/bin/dsh");
  assert.deepEqual(posix.args, []);
  assert.equal(posix.shell, false);
  // A .js path is always launched through Node, independent of executable bits.
  const posixJs = spawnSpec("/src/apps/cli/lib/bin.js", "linux");
  assert.equal(posixJs.command, process.execPath);
  assert.deepEqual(posixJs.args, ["/src/apps/cli/lib/bin.js"]);
  assert.equal(posixJs.shell, false);
});

test("start() reaches ready via stdout URL and stop() exits cleanly", async (t) => {
  const dir = tmpdir(t);
  const bin = fakeDsh(dir);
  const manager = new DshServerManager();

  const url = await manager.start({ dshBin: bin, cwd: dir });
  assert.equal(url, "http://127.0.0.1:34567");
  assert.equal(manager.state, "ready");
  assert.equal(manager.serverUrl, url);
  assert.equal(manager.isRunning, true);

  const exited = new Promise((resolve) => manager.once("exit", (e) => resolve(e)));
  manager.stop();
  const exitInfo = await exited;
  // POSIX: graceful SIGTERM → exit code 0. Windows: cmd.exe wrapper is
  // force-terminated (TerminateProcess semantics), so only the state matters.
  if (!IS_WIN) {
    assert.equal(exitInfo.code, 0);
    assert.equal(exitInfo.signal, null);
  }
  assert.equal(manager.state, "stopped");
  assert.equal(manager.isRunning, false);
});

/**
 * Start a local exchange endpoint mimicking DSH >= 0.1.2-alpha:
 * GET /?token=<token> → 303 + Set-Cookie; anything else → 401.
 * Returns { port, stop }.
 */
function exchangeServer(t, token) {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    if (req.method === "GET" && u.pathname === "/" && u.searchParams.get("token") === token) {
      res.writeHead(303, {
        location: "/",
        "set-cookie": "dsh-auth-abc123=v1.body.sig; Max-Age=86400; Path=/; HttpOnly; SameSite=Strict",
      });
      res.end();
    } else {
      res.writeHead(401);
      res.end("unauthorized");
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      t.after(() => server.close());
      resolve({ port, stop: () => server.close() });
    });
  });
}

test("start() exchanges the launch token for a cookie (token-auth DSH)", async (t) => {
  const dir = tmpdir(t);
  const ex = await exchangeServer(t, "tok-123");
  const bin = fakeDsh(dir, { urlLine: `dsh web: http://127.0.0.1:${ex.port}/?token=tok-123` });
  const manager = new DshServerManager();

  const url = await manager.start({ dshBin: bin, cwd: dir });
  // start() resolves with the BASE url (no token) — serverUrl consumers unchanged.
  assert.equal(url, `http://127.0.0.1:${ex.port}`);
  assert.equal(manager.serverUrl, url);
  assert.equal(manager.launchUrl, `http://127.0.0.1:${ex.port}/?token=tok-123`);
  // Only the name=value segment is kept (attributes stripped).
  assert.equal(manager.authCookie, "dsh-auth-abc123=v1.body.sig");
  assert.equal(manager.state, "ready");

  // api() must send the cookie header.
  let seenHeaders;
  const realFetch = global.fetch;
  global.fetch = async (_url, opts) => {
    seenHeaders = opts.headers;
    return { json: async () => ({ result: { ok: true, value: { items: [] } } }) };
  };
  try {
    await manager.listWorkspaceSessions("/ws/a");
    assert.equal(seenHeaders.cookie, "dsh-auth-abc123=v1.body.sig");
  } finally {
    global.fetch = realFetch;
  }

  const exited = new Promise((r) => manager.once("exit", r));
  manager.stop();
  await exited;
  assert.equal(manager.state, "stopped");
  // Dead server: no stale launch URL / cookie may survive.
  assert.equal(manager.launchUrl, undefined);
  assert.equal(manager.authCookie, undefined);
});

test("start() rejects when the launch-token exchange fails (no cookie possible)", async (t) => {
  const dir = tmpdir(t);
  // Reserve a port then close it so the exchange fetch is refused.
  const probe = http.createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const { port } = probe.address();
  await new Promise((r) => probe.close(r));
  const bin = fakeDsh(dir, { urlLine: `dsh web: http://127.0.0.1:${port}/?token=tok-123` });
  const manager = new DshServerManager();

  await assert.rejects(manager.start({ dshBin: bin, cwd: dir }), /launch-token exchange failed/);
  assert.equal(manager.state, "error");
  assert.equal(manager.authCookie, undefined);
  const exited = new Promise((r) => manager.once("exit", r));
  manager.stop();
  await exited;
});

test("start() uses the configured binary provider", async (t) => {
  const dir = tmpdir(t);
  const bin = fakeDsh(dir);
  const manager = new DshServerManager(() => `  ${bin}  `);

  await manager.start({ cwd: dir });
  assert.equal(manager.dshBinPath, bin);

  const exited = new Promise((resolve) => manager.once("exit", resolve));
  manager.stop();
  await exited;
});

test("start() executes a configured source-checkout bin.js through Node", async (t) => {
  const dir = tmpdir(t);
  const argsFile = path.join(dir, "js-args.json");
  const bin = fakeDshJs(dir, { helpNoOpen: true, recordArgs: argsFile });
  const manager = new DshServerManager(() => `  ${bin}  `);

  const url = await manager.start({ cwd: dir });
  assert.equal(url, "http://127.0.0.1:34567");
  assert.equal(manager.dshBinPath, bin);
  assert.equal(manager.dshVersion, "0.1.1-test");
  const spawned = JSON.parse(fs.readFileSync(argsFile, "utf8"));
  assert.deepEqual(spawned, ["web", "--port", "0", "--no-open"]);

  const exited = new Promise((resolve) => manager.once("exit", resolve));
  manager.stop();
  await exited;
});

test("start() includes source-checkout stderr when it exits before ready", async (t) => {
  const dir = tmpdir(t);
  const bin = fakeDshJs(dir, { failMessage: "custom harness dependency is missing" });
  const manager = new DshServerManager(() => bin);

  await assert.rejects(
    manager.start({ cwd: dir }),
    /dsh exited before ready.*custom harness dependency is missing/
  );
  assert.equal(manager.state, "error");
});

test("resolveStartBin ignores a configured dshPath missing on this host (falls back to discovery)", () => {
  const emptyHome = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-emptyhome-"));
  try {
    const stale = path.join(emptyHome, "no-such-dsh"); // does not exist
    // A missing configured path is ignored -> auto-discovery (never the stale path).
    const res = resolveStartBin({}, stale, emptyHome, "linux");
    assert.notEqual(res.path, stale, "a missing configured dshPath must not be used");
    assert.ok(!res.tried.includes(stale), "host discovery must not retry the stale local path");

    const configured = path.join(emptyHome, "custom-dsh");
    fs.writeFileSync(configured, "#!/bin/sh\n");
    assert.equal(resolveStartBin({}, configured, emptyHome, "linux").path, configured);

    // An explicit dshBin stays authoritative even when missing (use it or fail).
    const explicit = resolveStartBin({ dshBin: stale }, undefined, emptyHome, "linux");
    assert.equal(explicit.path, stale);
  } finally {
    fs.rmSync(emptyHome, { recursive: true, force: true });
  }
});

test("probeNoOpenSupport reads the live web --help (rc.8 web-app shape)", (t) => {
  // web-app rc.7 shape: --help does not advertise --no-open → skip the flag.
  const oldBin = fakeDsh(tmpdir(t));
  assert.equal(probeNoOpenSupport(oldBin), false);
  // web-app rc.8 shape: --help advertises --no-open → pass the flag.
  const newBin = fakeDsh(tmpdir(t), { helpNoOpen: true });
  assert.equal(probeNoOpenSupport(newBin), true);
  // Missing binary → null (fall back to the CLI-version gate, never crash).
  assert.equal(probeNoOpenSupport("/nonexistent/dsh"), null);
});

test("start() passes --no-open when the live web --help supports it (rc mismatch)", async (t) => {
  // Regression: CLI rc.7 + web-app rc.8 (npx cache resolves a newer web-app
  // than the CLI version string says). The CLI-version gate alone would skip
  // --no-open and dsh would auto-open a browser; the live --help probe must
  // win. The fake dsh does NOT print a version, so shouldPassNoOpen("…") is
  // false — only the probe can flip the decision.
  const dir = tmpdir(t);
  const argsFile = path.join(dir, "args.json");
  const bin = fakeDsh(dir, { helpNoOpen: true, recordArgs: argsFile });
  const manager = new DshServerManager();
  const url = await manager.start({ dshBin: bin, cwd: dir });
  assert.equal(url, "http://127.0.0.1:34567");
  const spawned = JSON.parse(fs.readFileSync(argsFile, "utf8"));
  assert.ok(spawned.includes("--no-open"), `expected --no-open in spawn args, got ${JSON.stringify(spawned)}`);
  const exited = new Promise((r) => manager.once("exit", r));
  manager.stop();
  await exited;
});

test("start() omits --no-open when the live web --help does not support it", async (t) => {
  // web-app rc.6/rc.7 shape: commander would exit on the unknown option and
  // kill startup, so the flag must be omitted.
  const dir = tmpdir(t);
  const argsFile = path.join(dir, "args.json");
  const bin = fakeDsh(dir, { recordArgs: argsFile });
  const manager = new DshServerManager();
  const url = await manager.start({ dshBin: bin, cwd: dir });
  assert.equal(url, "http://127.0.0.1:34567");
  const spawned = JSON.parse(fs.readFileSync(argsFile, "utf8"));
  assert.ok(!spawned.includes("--no-open"), `no --no-open expected, got ${JSON.stringify(spawned)}`);
  const exited = new Promise((r) => manager.once("exit", r));
  manager.stop();
  await exited;
});

test("start() is idempotent when already ready", async (t) => {
  const dir = tmpdir(t);
  const bin = fakeDsh(dir);
  const manager = new DshServerManager();
  const url = await manager.start({ dshBin: bin, cwd: dir });
  const again = await manager.start({ dshBin: bin, cwd: dir });
  assert.equal(again, url);
  const exited = new Promise((r) => manager.once("exit", r));
  manager.stop();
  await exited;
});

test("start() rejects on timeout when no URL line arrives", async (t) => {
  const dir = tmpdir(t);
  const bin = fakeDsh(dir, { quiet: true });
  const manager = new DshServerManager();
  const exited = new Promise((r) => manager.once("exit", r));
  await assert.rejects(
    manager.start({ dshBin: bin, cwd: dir, readyTimeoutMs: 500 }),
    /did not become ready/
  );
  assert.equal(manager.state, "error");
  await exited;
});

test("start() rejects with a helpful message when the binary is missing", async (t) => {
  const manager = new DshServerManager();
  await assert.rejects(
    manager.start({ dshBin: "/nonexistent/dsh", cwd: os.tmpdir() }),
    IS_WIN ? /exited before ready/ : /dsh not found/
  );
  assert.equal(manager.state, "error");
});

test("stop() during the ready window settles the promise and stays stopped (no late error)", async (t) => {
  const dir = tmpdir(t);
  const bin = fakeDsh(dir, { quiet: true }); // never prints the ready URL
  const manager = new DshServerManager();
  const exited = new Promise((r) => manager.once("exit", r));
  const startP = manager.start({ dshBin: bin, cwd: dir, readyTimeoutMs: 5000 });
  manager.stop(); // abort the pending start
  await assert.rejects(startP, /stopped before ready/);
  await exited; // wait for the process to actually terminate
  assert.equal(manager.state, "stopped");
  // Wait past the ready timeout to ensure it does NOT flip back to "error".
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(manager.state, "stopped");
});

// --- session API (02-session-management T1) -------------------------------

/** Mock global.fetch to serve the client-request envelope; restore afterwards. */
function mockFetch(handler) {
  const real = global.fetch;
  global.fetch = async (_url, opts) => ({ json: async () => handler(JSON.parse(opts.body)) });
  return () => {
    global.fetch = real;
  };
}

/** A manager whose server URL is set so api() calls hit the mock fetch. */
function apiManager() {
  const manager = new DshServerManager();
  manager.url = "http://127.0.0.1:9999";
  return manager;
}

test("listWorkspaceSessions filters session.list to the cwd workspace", async () => {
  const manager = apiManager();
  const restore = mockFetch((req) => {
    if (req.method === "workspace.list") {
      return {
        result: {
          ok: true,
          value: {
            items: [{ workspaceId: "w1", path: "/ws/a", sessionIds: ["s1", "s2"] }],
            archivedSessionIds: ["sx"],
          },
        },
      };
    }
    if (req.method === "session.list") {
      return {
        result: {
          ok: true,
          value: {
            items: [
              { sessionId: "s1", updatedAt: 1, running: true, blank: false, cwd: "/ws/a", projections: { values: { title: "Titled" } } },
              { sessionId: "s2", updatedAt: 2, running: false, blank: false, cwd: "/ws/a", projections: { values: { title: null } } },
              { sessionId: "s3", updatedAt: 3, running: false, blank: false, cwd: "/other", projections: { values: { title: "Other" } } },
            ],
          },
        },
      };
    }
    throw new Error("unexpected method " + req.method);
  });
  try {
    const { items, archivedItems } = await manager.listWorkspaceSessions("/ws/a");
    assert.deepEqual(items.map((s) => s.sessionId), ["s1", "s2"]);
    assert.equal(items[0].title, "Titled");
    assert.equal(items[1].title, null);
    // "sx" is archived globally but NOT bound to workspace w1 — the archived
    // section only lists sessions of THIS workspace, so it is empty here.
    assert.deepEqual(archivedItems, []);
  } finally {
    restore();
  }
});

test("listWorkspaceSessions hides archived sessions from the active list", async () => {
  const manager = apiManager();
  const restore = mockFetch((req) => {
    if (req.method === "workspace.list") {
      return {
        result: {
          ok: true,
          value: {
            // s2 is in the workspace's sessionIds but ALSO archived — DSH's
            // archive is append-only, so the active list must hide it.
            items: [{ workspaceId: "w1", path: "/ws/a", sessionIds: ["s1", "s2"] }],
            archivedSessionIds: ["s2"],
          },
        },
      };
    }
    if (req.method === "session.list") {
      return {
        result: {
          ok: true,
          value: {
            items: [
              { sessionId: "s1", updatedAt: 1, running: false, blank: false, cwd: "/ws/a", projections: { values: { title: null } } },
              { sessionId: "s2", updatedAt: 2, running: false, blank: false, cwd: "/ws/a", projections: { values: { title: null } } },
            ],
          },
        },
      };
    }
    throw new Error("unexpected method " + req.method);
  });
  try {
    const { items, archivedItems } = await manager.listWorkspaceSessions("/ws/a");
    assert.deepEqual(items.map((s) => s.sessionId), ["s1"]);
    assert.deepEqual(archivedItems.map((s) => s.sessionId), ["s2"]);
    assert.equal(archivedItems[0].title, null);
  } finally {
    restore();
  }
});

test("listWorkspaceSessions lists ALL active sessions including blank ones", async () => {
  const manager = apiManager();
  const restore = mockFetch((req) => {
    if (req.method === "workspace.list") {
      return {
        result: {
          ok: true,
          value: {
            items: [{ workspaceId: "w1", path: "/ws/a", sessionIds: ["s1", "s2", "s3"] }],
            archivedSessionIds: [],
          },
        },
      };
    }
    if (req.method === "session.list") {
      return {
        result: {
          ok: true,
          value: {
            items: [
              { sessionId: "s1", updatedAt: 100, running: false, blank: true, cwd: "/ws/a", projections: { values: { title: null } } },
              { sessionId: "s2", updatedAt: 200, running: false, blank: false, cwd: "/ws/a", projections: { values: { title: "Chatted" } } },
              { sessionId: "s3", updatedAt: 300, running: false, blank: true, cwd: "/ws/a", projections: { values: { title: null } } },
            ],
          },
        },
      };
    }
    throw new Error("unexpected method " + req.method);
  });
  try {
    const { items } = await manager.listWorkspaceSessions("/ws/a");
    // Every active session is listed, blank included (blank ones show as
    // "New Session" with their relative time on the UI side).
    assert.deepEqual(items.map((s) => s.sessionId), ["s1", "s2", "s3"]);
    assert.deepEqual(items.map((s) => s.blank), [true, false, true]);
  } finally {
    restore();
  }
});

test("listWorkspaceSessions returns empty when cwd has no workspace", async () => {
  const manager = apiManager();
  const restore = mockFetch(() => ({
    result: { ok: true, value: { items: [{ workspaceId: "w1", path: "/other", sessionIds: [] }], archivedSessionIds: [] } },
  }));
  try {
    const { items, archivedItems } = await manager.listWorkspaceSessions("/nowhere");
    assert.deepEqual(items, []);
    assert.deepEqual(archivedItems, []);
  } finally {
    restore();
  }
});

test("renameSession sends the envelope and returns the accepted title", async () => {
  const manager = apiManager();
  let sent;
  const restore = mockFetch((req) => {
    sent = req;
    return { result: { ok: true, value: { title: "新标题", seq: 3 } } };
  });
  try {
    const res = await manager.renameSession("s1", "新标题");
    assert.deepEqual(res, { title: "新标题", seq: 3 });
    assert.equal(sent.type, "client-request");
    assert.equal(sent.method, "session.rename");
    assert.equal(sent.payload.sessionId, "s1");
    assert.equal(sent.payload.title, "新标题");
  } finally {
    restore();
  }
});

test("renameSession surfaces the DSH error code (title-invalid)", async () => {
  const manager = apiManager();
  const restore = mockFetch(() => ({
    result: { ok: false, error: { code: "title-invalid", message: "title must be non-blank" } },
  }));
  try {
    await assert.rejects(manager.renameSession("s1", "   "), (err) => {
      assert.equal(err.code, "title-invalid");
      return true;
    });
  } finally {
    restore();
  }
});

test("archiveSession calls workspace.archiveSession and returns the archive set", async () => {
  const manager = apiManager();
  let sent;
  const restore = mockFetch((req) => {
    sent = req;
    return { result: { ok: true, value: { archivedSessionIds: ["s1", "s2"] } } };
  });
  try {
    const archived = await manager.archiveSession("s1");
    assert.deepEqual(archived, ["s1", "s2"]);
    assert.equal(sent.method, "workspace.archiveSession");
    assert.deepEqual(sent.payload, { sessionId: "s1" });
  } finally {
    restore();
  }
});

test("ensureWorkspaceSession reuses a blank bound session instead of creating", async () => {
  const manager = apiManager();
  const methods = [];
  const restore = mockFetch((req) => {
    methods.push(req.method);
    if (req.method === "workspace.list") {
      return {
        result: {
          ok: true,
          value: {
            // s1 is bound and blank (user never chatted) — must be reused.
            items: [{ workspaceId: "w1", path: "/ws/a", sessionIds: ["s1"] }],
            archivedSessionIds: [],
          },
        },
      };
    }
    if (req.method === "session.list") {
      return {
        result: {
          ok: true,
          value: {
            items: [
              { sessionId: "s1", updatedAt: 1, running: false, blank: true, cwd: "/ws/a", projections: { values: { title: null } } },
            ],
          },
        },
      };
    }
    return { result: { ok: true, value: { sessionId: "created" } } };
  });
  try {
    const id = await manager.ensureWorkspaceSession("/ws/a");
    assert.equal(id, "s1");
    assert.ok(!methods.includes("session.create"), "must NOT create a new session");
  } finally {
    restore();
  }
});

test("ensureWorkspaceSession skips archived sessions and creates a fresh one", async () => {
  const manager = apiManager();
  const methods = [];
  const restore = mockFetch((req) => {
    methods.push(req.method);
    if (req.method === "workspace.list") {
      return {
        result: {
          ok: true,
          value: {
            // s1 is bound but ARCHIVED — must not be reused as the default.
            items: [{ workspaceId: "w1", path: "/ws/a", sessionIds: ["s1"] }],
            archivedSessionIds: ["s1"],
          },
        },
      };
    }
    if (req.method === "session.list") {
      return {
        result: {
          ok: true,
          value: {
            items: [
              { sessionId: "s1", updatedAt: 1, running: false, blank: false, cwd: "/ws/a", projections: { values: { title: null } } },
            ],
          },
        },
      };
    }
    if (req.method === "session.create") {
      return { result: { ok: true, value: { sessionId: "s2" } } };
    }
    return { result: { ok: false, error: { message: "unexpected " + req.method } } };
  });
  try {
    const id = await manager.ensureWorkspaceSession("/ws/a");
    assert.equal(id, "s2");
    assert.ok(methods.includes("session.create"));
  } finally {
    restore();
  }
});

test("sameFsPath matches normalized and realpath forms", (t) => {
  assert.equal(sameFsPath("/a/b", "/a/b/"), true);
  assert.equal(sameFsPath("/a/b", "/a/c"), false);
  if (process.platform !== "win32") {
    // macOS /tmp → /private/tmp: a symlinked form matches the realpath.
    const dir = tmpdir(t);
    const real = path.join(dir, "real");
    fs.mkdirSync(real);
    const link = path.join(dir, "link");
    fs.symlinkSync(real, link);
    assert.equal(sameFsPath(link, real), true);
    assert.equal(sameFsPath(link + "/", real), true);
  }
});
