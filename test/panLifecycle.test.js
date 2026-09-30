"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { WebSocketServer } = require("ws");
const { PanLifecycleObserver, quietTurnEvent } = require("../out/panLifecycle.js");

async function until(predicate, timeout = 2000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error("timed out");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

test("quiet event carries only stable neutral metadata", () => {
  const event = {type: "turn/end", seq: 9, time: 1760000000000,
    data: {turn: 2, reason: {kind: "error", error: {message: "SECRET"}}}};
  const first = quietTurnEvent("session-1", event);
  assert.deepEqual(first, quietTurnEvent("session-1", event));
  assert.equal(first.event_type, "turn_end");
  assert.equal(first.run_id, "dsh:session-1");
  assert.doesNotMatch(JSON.stringify(first), /SECRET/);
});

test("extension-host observer sends live turn and replays after failure", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-pan-test-"));
  const tokenFile = path.join(tmp, "token");
  fs.writeFileSync(tokenFile, "test-token\n", {mode: 0o600});
  const server = new WebSocketServer({host: "127.0.0.1", port: 0});
  await new Promise(resolve => server.once("listening", resolve));
  const port = server.address().port;
  const turn = {type: "turn/end", seq: 1, time: Date.now(), data: {turn: 1, reason: {kind: "completed"}}};
  let connections = 0;
  server.on("connection", socket => {
    connections++;
    socket.once("message", bytes => {
      const open = JSON.parse(bytes.toString());
      assert.equal(open.endpoint, "session/follow");
      assert.equal(open.payload.args.request.address.sessionId, "session-1");
      const records = connections === 1 ? [] : [{type: "event", event: turn}];
      socket.send(JSON.stringify({type: "item", streamId: open.streamId,
        value: {type: "snapshot", cursor: connections === 1 ? 0 : 1, records}}));
      if (connections === 1) socket.send(JSON.stringify({type: "item", streamId: open.streamId,
        value: {type: "event", event: turn}}));
    });
  });
  const values = new Map();
  const state = {get: key => values.get(key), update: async (key, value) => {
    if (value === 0) await new Promise(resolve => setTimeout(resolve, 30));
    values.set(key, value);
  }};
  const manager = {serverUrl: `http://127.0.0.1:${port}`, authCookie: undefined,
    listWorkspaceSessions: async () => ({items: [{sessionId: "session-1"}], archivedItems: []})};
  const sent = [];
  const fetchImpl = async (_url, options) => {
    sent.push(JSON.parse(options.body));
    if (sent.length === 1) throw new Error("offline");
    return {ok: true, json: async () => ({ok: true, silent: true})};
  };
  const observer = new PanLifecycleObserver(manager, state, () => tokenFile, fetchImpl);
  const originalWarn = console.warn;
  console.warn = () => undefined;
  try {
    observer.start("/workspace");
    await until(() => sent.length === 1);
    await until(() => observer.follows.size === 0);
    await observer.poll();
    await until(() => sent.length === 2);
    await until(() => values.get("pan.lifecycle.cursor.session-1") === 1);
    assert.deepEqual(sent[0], sent[1]);
    assert.equal(values.get("pan.lifecycle.cursor.session-1"), 1);
  } finally {
    console.warn = originalWarn;
    observer.dispose();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(tmp, {recursive: true, force: true});
  }
});
