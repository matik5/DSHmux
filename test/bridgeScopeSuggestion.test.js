"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

test("BridgeHost recommends the patched build once for the agent-scope failure", async () => {
  const warnings = [];
  const commands = [];
  const fakeVscode = {
    env: { language: "en", clipboard: { readText: async () => "", writeText: async () => {} } },
    window: {
      showWarningMessage: async (message, ...items) => {
        warnings.push({ message, items });
        return items[0];
      },
    },
    commands: { executeCommand: async (...args) => { commands.push(args); } },
  };
  const originalLoad = Module._load;
  Module._load = function (request) {
    if (request === "vscode") return fakeVscode;
    return originalLoad.apply(this, arguments);
  };
  let BridgeHost;
  try {
    ({ BridgeHost } = require("../out/bridgeHost.js"));
  } finally {
    Module._load = originalLoad;
  }

  let receive;
  const posted = [];
  const webview = {
    onDidReceiveMessage: (listener) => {
      receive = listener;
      return { dispose() {} };
    },
    postMessage: async (message) => { posted.push(message); return true; },
  };
  const payload = JSON.stringify({
    result: {
      ok: false,
      error: {
        code: "session/agent-busy",
        message: "prompt rejected",
        details: { reason: "file-upload: operation requires the Agent's own scope" },
      },
    },
  });
  const fetchImpl = async () => new Response(payload, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  const bridge = new BridgeHost(webview, () => "http://127.0.0.1:1234", fetchImpl);

  receive({ type: "http", id: 1, method: "POST", url: "/api/session.prompt" });
  receive({ type: "http", id: 2, method: "POST", url: "/api/session.prompt" });
  await waitFor(() => posted.length === 2 && commands.length === 1);

  assert.equal(warnings.length, 1);
  assert.match(warnings[0].message, /choose the patched source build/);
  assert.deepEqual(commands, [["dshmux.doctor"]]);
  bridge.dispose();
});

function waitFor(predicate, timeoutMs = 2_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (predicate()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error("waitFor timeout"));
      setTimeout(poll, 10);
    };
    poll();
  });
}
