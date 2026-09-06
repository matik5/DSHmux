// Unit tests for src/bridgeHost.ts (relayHttp + WsRelay) against fixture
// HTTP/WebSocket servers.
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const { WebSocketServer } = require("ws");

const { relayHttp, WsRelay } = require("../out/bridgeCore.js");

function tmpdir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-bh-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("relayHttp forwards a POST and returns status/headers/binary body", async (t) => {
  const server = http.createServer((req, res) => {
    assert.equal(req.method, "POST");
    assert.equal(req.url, "/api/ping");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(Buffer.from([0x7b, 0x7d])); // "{}"
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  const { port } = server.address();

  const out = await relayHttp(`http://127.0.0.1:${port}`, {
    type: "http",
    id: 7,
    method: "POST",
    url: "/api/ping",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ a: 1 }),
  });
  assert.equal(out.type, "http-res");
  assert.equal(out.id, 7);
  assert.equal(out.status, 200);
  assert.equal(out.headers["content-type"], "application/json");
  assert.deepEqual(Buffer.from(out.body).toString(), "{}");
});

test("relayHttp forwards the cookie from the cookieProvider (token-auth DSH)", async (t) => {
  let seenCookie;
  const server = http.createServer((req, res) => {
    seenCookie = req.headers.cookie;
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  const { port } = server.address();

  const out = await relayHttp(
    `http://127.0.0.1:${port}`,
    { type: "http", id: 1, method: "GET", url: "/api/x" },
    fetch,
    () => "dsh-auth-abc123=v1.body.sig"
  );
  assert.equal(out.status, 200);
  assert.equal(seenCookie, "dsh-auth-abc123=v1.body.sig");
});

test("relayHttp sends no cookie header without a cookieProvider (pre-auth DSH)", async (t) => {
  let seenCookie;
  const server = http.createServer((req, res) => {
    seenCookie = req.headers.cookie;
    res.writeHead(200);
    res.end("ok");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  const { port } = server.address();

  await relayHttp(`http://127.0.0.1:${port}`, { type: "http", id: 1, method: "GET", url: "/" });
  assert.equal(seenCookie, undefined);
});

test("relayHttp surfaces non-2xx status as a transport response (client decides)", async (t) => {
  const server = http.createServer((_req, res) => {
    res.writeHead(403);
    res.end("forbidden");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  const { port } = server.address();

  const out = await relayHttp(`http://127.0.0.1:${port}`, {
    type: "http",
    id: 1,
    method: "GET",
    url: "/api/x",
  });
  assert.equal(out.status, 403);
  assert.equal(Buffer.from(out.body).toString(), "forbidden");
});

test("WsRelay relays open/frame/close with the webview-assigned id", async (t) => {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise((r) => wss.once("listening", r));
  t.after(() => wss.close());
  const { port } = wss.address();
  const base = `http://127.0.0.1:${port}`;

  wss.on("connection", (socket) => {
    socket.on("message", (data) => socket.send("echo:" + data.toString()));
  });

  const posts = [];
  const relay = new WsRelay((msg) => posts.push(msg), () => base);
  relay.open(42, "/api/events.mux");

  // open-res with the webview id.
  await waitFor(() => posts.some((p) => p.type === "ws-open-res" && p.id === 42 && p.ok));
  assert.ok(posts.some((p) => p.type === "ws-open-res" && p.id === 42 && p.ok === true));

  // send -> server echoes -> ws-frame with the same id.
  relay.send(42, "hello");
  await waitFor(() => posts.some((p) => p.type === "ws-frame" && p.id === 42 && p.data === "echo:hello"));

  // close -> ws-close.
  relay.close(42);
  await waitFor(() => posts.some((p) => p.type === "ws-close" && p.id === 42));
});

test("WsRelay sends the cookie header on the WebSocket upgrade (token-auth DSH)", async (t) => {
  let seenCookie;
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise((r) => wss.once("listening", r));
  t.after(() => wss.close());
  const { port } = wss.address();
  const base = `http://127.0.0.1:${port}`;

  wss.on("connection", (socket, req) => {
    seenCookie = req.headers.cookie;
    socket.close();
  });

  const posts = [];
  const relay = new WsRelay(
    (msg) => posts.push(msg),
    () => base,
    () => "dsh-auth-abc123=v1.body.sig"
  );
  relay.open(7, "/api/events.mux");
  await waitFor(() => posts.some((p) => p.type === "ws-open-res" && p.id === 7 && p.ok));
  assert.equal(seenCookie, "dsh-auth-abc123=v1.body.sig");
  relay.dispose();
});

test("WsRelay reports ws-open-res ok:false when the server is unreachable", async (t) => {
  // Grab a free port then close it so nothing listens there.
  const probe = http.createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const { port } = probe.address();
  await new Promise((r) => probe.close(r));

  const posts = [];
  const relay = new WsRelay((msg) => posts.push(msg), () => `http://127.0.0.1:${port}`);
  relay.open(9, "/api/events.mux");
  await waitFor(() => posts.some((p) => p.type === "ws-open-res" && p.id === 9));
  assert.ok(posts.some((p) => p.type === "ws-open-res" && p.id === 9 && p.ok === false));
  relay.dispose();
});

test("WsRelay.reset() closes leaked sockets and frees their ids for the new page", async (t) => {
  // Simulates a webview document swap (webview.html = ...): the old page world
  // dies without sending ws-close, and the new world re-mints ids from 1.
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise((r) => wss.once("listening", r));
  t.after(() => wss.close());
  const { port } = wss.address();
  const base = `http://127.0.0.1:${port}`;
  let serverConnections = 0;
  wss.on("connection", (socket) => {
    serverConnections += 1;
    socket.on("close", () => {
      serverConnections -= 1;
    });
    socket.on("message", (data) => socket.send("echo:" + data.toString()));
  });

  const posts = [];
  const relay = new WsRelay((msg) => posts.push(msg), () => base);

  // Old page: opens its stream socket with the small webview-assigned id 1.
  relay.open(1, "/api/remote.mux");
  await waitFor(() => posts.some((p) => p.type === "ws-open-res" && p.id === 1 && p.ok));
  assert.equal(serverConnections, 1);

  // Document swap: no ws-close arrives; reset() must drop the leaked socket.
  relay.reset();
  await waitFor(() => serverConnections === 0);
  // The dying socket must not post a stale ws-close into the new page.
  assert.ok(!posts.some((p) => p.type === "ws-close" && p.id === 1));

  // New page re-mints id 1: it must get a FRESH working socket, not a no-op.
  relay.open(1, "/api/remote.mux");
  await waitFor(() => posts.filter((p) => p.type === "ws-open-res" && p.id === 1 && p.ok).length === 2);
  relay.send(1, "hi");
  await waitFor(() => posts.some((p) => p.type === "ws-frame" && p.id === 1 && p.data === "echo:hi"));
  relay.dispose();
});

function waitFor(pred, timeoutMs = 3000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (pred()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("waitFor timeout"));
      setTimeout(tick, 10);
    };
    tick();
  });
}
