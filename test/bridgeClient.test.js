// Regression tests for media/bridge-client.js — the webview-side shim.
// Executes the real injected script under a minimal browser-stub harness so
// the fetch/WebSocket/clipboard relay logic is covered by node:test.
// Regression: fetch(URL-object) used to produce "/undefined" (URL has .href,
// not .url) and relay everything to HTTP 405.
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

// Node's URL gives custom schemes (vscode-webview://) an opaque "null"
// origin, unlike Chromium; use an http origin so same-origin resolution
// behaves like the real webview.
const WEBVIEW_ORIGIN = "http://webview.local";
const SCRIPT = require("node:fs").readFileSync(
  path.join(__dirname, "..", "media", "bridge-client.js"),
  "utf8"
);

/** Install browser globals, run the bridge script, return a probe handle. */
function loadBridge(bridgeInit) {
  const posted = [];
  const nativeFetchCalls = [];
  const listeners = {};
  const listenerOptions = {};

  const window = {
    fetch: (input, init) => {
      nativeFetchCalls.push({ input, init });
      return Promise.resolve(new Response("native", { status: 200 }));
    },
    matchMedia: (query) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }),
    addEventListener: (type, fn, options) => {
      (listeners[type] = listeners[type] || []).push(fn);
      (listenerOptions[type] = listenerOptions[type] || []).push(options);
    },
    WebSocket: class {
      constructor(url) {
        this.url = url;
      }
    },
  };
  const acquireVsCodeApi = () => ({ postMessage: (msg) => posted.push(msg) });
  const location = { href: WEBVIEW_ORIGIN + "/", origin: WEBVIEW_ORIGIN };
  // Node ≥21 exposes a read-only global navigator; the bridge only adds a
  // `clipboard` property to it, which is allowed.
  const navigator = globalThis.navigator;

  globalThis.window = window;
  globalThis.location = location;
  globalThis.acquireVsCodeApi = acquireVsCodeApi;
  if (bridgeInit) window.__DSH_BRIDGE__ = bridgeInit;

  // Run the IIFE in this context.
  const run = new Function(
    "window",
    "location",
    "navigator",
    "acquireVsCodeApi",
    "URL",
    "Headers",
    "Response",
    "DOMException",
    SCRIPT
  );
  run(window, location, navigator, acquireVsCodeApi, URL, Headers, Response, DOMException);

  return { posted, nativeFetchCalls, window, listeners, listenerOptions };
}

test("fetch with a URL object relays the correct path (regression: /undefined)", async () => {
  const h = loadBridge();
  const input = new URL(WEBVIEW_ORIGIN + "/api/host.pickDirectory", "http://x");
  const p = h.window.fetch(input, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(h.posted.length, 1);
  assert.deepEqual(h.posted[0], {
    type: "http",
    id: 1,
    method: "POST",
    url: "/api/host.pickDirectory",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(h.nativeFetchCalls.length, 0);
  // Resolve the relay: respond and check the Response status.
  const msg = h.listeners.message;
  h.listeners.message.forEach((fn) => fn({ data: { type: "http-res", id: 1, status: 200, statusText: "OK", headers: {}, body: "{}" } }));
  const res = await p;
  assert.equal(res.status, 200);
});

test("fetch with a string input relays too", () => {
  const h = loadBridge();
  h.window.fetch(WEBVIEW_ORIGIN + "/api/session.list", { method: "POST", body: "{}" });
  assert.equal(h.posted[0].url, "/api/session.list");
});

test("cross-origin fetches (blob/data) fall through to native fetch", async () => {
  const h = loadBridge();
  const res = await h.window.fetch("blob:http://x/abc", {});
  assert.equal(h.nativeFetchCalls.length, 1);
  assert.equal(h.posted.length, 0);
  assert.equal(res.status, 200);
});

test("WebSocket shim relays ws-open with the path", () => {
  const h = loadBridge();
  const ws = new h.window.WebSocket(WEBVIEW_ORIGIN + "/api/events.mux");
  assert.equal(ws.readyState, h.window.WebSocket.CONNECTING);
  assert.equal(h.posted[0].type, "ws-open");
  assert.equal(h.posted[0].path, "/api/events.mux");
  // open-res flips readyState and fires open listeners.
  const opened = [];
  ws.addEventListener("open", () => opened.push(true));
  h.listeners.message.forEach((fn) => fn({ data: { type: "ws-open-res", id: h.posted[0].id, ok: true } }));
  assert.equal(ws.readyState, h.window.WebSocket.OPEN);
  assert.equal(opened.length, 1);
});

test("clipboard shim relays writeText and resolves clipboard-res", async () => {
  const h = loadBridge();
  const p = navigator.clipboard.writeText("hello");
  assert.equal(h.posted[0].type, "clipboard-write");
  assert.equal(h.posted[0].text, "hello");
  h.listeners.message.forEach((fn) => fn({ data: { type: "clipboard-res", id: h.posted[0].id, ok: true } }));
  await p; // resolves without rejection
});

test("matchMedia shim follows __DSH_BRIDGE__.dark and theme-preference messages", () => {
  // Pre-set __DSH_BRIDGE__ with dark:true before the script loads.
  const h = loadBridge({ serverBase: "http://x", dark: true });
  const darkMql = h.window.matchMedia("(prefers-color-scheme: dark)");
  assert.equal(darkMql.matches, true);
  // Other queries pass through to the real matchMedia.
  assert.equal(h.window.matchMedia("(max-width: 1px)").matches, false);

  // A theme-preference message flips the override and fires listeners.
  const seen = [];
  darkMql.addEventListener("change", (e) => seen.push(e.matches));
  h.listeners.message.forEach((fn) => fn({ data: { type: "theme-preference", dark: false } }));
  assert.equal(darkMql.matches, false);
  assert.deepEqual(seen, [false]);
});

// ---------------------------------------------------------------- completion sound
// The bridge observes the bridged WebSocket frames for the DSH
// host/session-status running true->false edge and plays a Web Audio chime.
// We stub window.AudioContext to count oscillator creation (one chime = 2 notes).
function makeAudioStub(initialState = "running") {
  const calls = { contexts: 0, oscillators: 0, resumes: 0 };
  const param = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  class StubOscillator {
    constructor() {
      calls.oscillators++;
      this.frequency = param();
    }
    connect() { return this; }
    start() {}
    stop() {}
  }
  class StubGain {
    constructor() { this.gain = param(); }
    connect() { return this; }
  }
  class StubCtx {
    constructor() {
      calls.contexts++;
      this.currentTime = 0;
      this.state = initialState;
      this.destination = {};
    }
    createOscillator() { return new StubOscillator(); }
    createGain() { return new StubGain(); }
    resume() {
      calls.resumes++;
      return Promise.resolve().then(() => { this.state = "running"; });
    }
  }
  return { StubCtx, calls };
}

// Open a bridged socket and deliver one host/session-status frame for a session.
function fireStatus(h, id, sessionId, running) {
  const frame = JSON.stringify({
    type: "server-request",
    rpcId: "r",
    method: "host.status",
    payload: { type: "host/session-status", sessionId, running },
  });
  h.listeners.message.forEach((fn) => fn({ data: { type: "ws-frame", id, data: frame } }));
}

// Deliver one session/event mux frame (turn/start, tool/call, ...).
function fireEvent(h, id, sessionId, event) {
  const frame = JSON.stringify({
    type: "server-request",
    rpcId: "r",
    method: "session.event",
    payload: { type: "session/event", sessionId, event },
  });
  h.listeners.message.forEach((fn) => fn({ data: { type: "ws-frame", id, data: frame } }));
}

function fireQuestion(h, id, sessionId) {
  const frame = JSON.stringify({
    type: "server-request",
    rpcId: "question-rpc",
    method: "events.mux",
    payload: { type: "question/requested", sessionId, questions: [{ id: "q", question: "Choose" }] },
  });
  h.listeners.message.forEach((fn) => fn({ data: { type: "ws-frame", id, data: frame } }));
}

test("completion: running true->false edge plays the chime", () => {
  const h = loadBridge({ serverBase: "http://x", completionSound: true });
  const { StubCtx, calls } = makeAudioStub();
  h.window.AudioContext = StubCtx;
  const ws = new h.window.WebSocket(WEBVIEW_ORIGIN + "/api/events.host");
  const id = h.posted[0].id;
  fireStatus(h, id, "s1", true); // baseline: running
  assert.equal(calls.oscillators, 0);
  fireStatus(h, id, "s1", false); // edge: done
  assert.equal(calls.oscillators, 2); // one chime = two notes
});

test("completion: turn/end is a fallback and is deduplicated against host status", () => {
  const h = loadBridge({ serverBase: "http://x", completionSound: true });
  const { StubCtx, calls } = makeAudioStub();
  h.window.AudioContext = StubCtx;
  const ws = new h.window.WebSocket(WEBVIEW_ORIGIN + "/api/events.mux");
  const id = h.posted[0].id;
  fireEvent(h, id, "s1", { type: "turn/end", seq: 2, time: 0, data: { turn: 1 } });
  assert.equal(calls.oscillators, 2);
  fireStatus(h, id, "s1", true);
  fireStatus(h, id, "s1", false);
  assert.equal(calls.oscillators, 2, "host fallback must not play a duplicate done sound");
});

test("completion: no chime when the setting is off", () => {
  const h = loadBridge({ serverBase: "http://x", completionSound: false });
  const { StubCtx, calls } = makeAudioStub();
  h.window.AudioContext = StubCtx;
  const ws = new h.window.WebSocket(WEBVIEW_ORIGIN + "/api/events.host");
  const id = h.posted[0].id;
  fireStatus(h, id, "s1", true);
  fireStatus(h, id, "s1", false);
  assert.equal(calls.oscillators, 0);
});

test("completion: no false positive on repeated false or first-seen false", () => {
  const h = loadBridge({ serverBase: "http://x", completionSound: true });
  const { StubCtx, calls } = makeAudioStub();
  h.window.AudioContext = StubCtx;
  const ws = new h.window.WebSocket(WEBVIEW_ORIGIN + "/api/events.host");
  const id = h.posted[0].id;
  fireStatus(h, id, "s1", false); // first seen false (no prior true) -> no chime
  assert.equal(calls.oscillators, 0);
  fireStatus(h, id, "s1", false); // repeated false -> no chime
  assert.equal(calls.oscillators, 0);
  fireStatus(h, id, "s1", true); // running again
  fireStatus(h, id, "s1", false); // edge -> one chime
  assert.equal(calls.oscillators, 2);
});

test("completion: a completion-sound message toggles the detector live", () => {
  const h = loadBridge({ serverBase: "http://x", completionSound: true });
  const { StubCtx, calls } = makeAudioStub();
  h.window.AudioContext = StubCtx;
  const ws = new h.window.WebSocket(WEBVIEW_ORIGIN + "/api/events.host");
  const id = h.posted[0].id;
  // Disable at runtime, then a completion must not sound.
  h.listeners.message.forEach((fn) => fn({ data: { type: "completion-sound", enabled: false } }));
  fireStatus(h, id, "s1", true);
  fireStatus(h, id, "s1", false);
  assert.equal(calls.oscillators, 0);
  // Re-enable, then a completion sounds.
  h.listeners.message.forEach((fn) => fn({ data: { type: "completion-sound", enabled: true } }));
  fireStatus(h, id, "s1", true);
  fireStatus(h, id, "s1", false);
  assert.equal(calls.oscillators, 2);
});

test("start: a turn/start event plays the short 'start' sound (1 note)", () => {
  const h = loadBridge({ serverBase: "http://x", completionSound: true });
  const { StubCtx, calls } = makeAudioStub();
  h.window.AudioContext = StubCtx;
  const ws = new h.window.WebSocket(WEBVIEW_ORIGIN + "/api/events.mux");
  const id = h.posted[0].id;
  fireEvent(h, id, "s1", { type: "turn/start", seq: 1, time: 0, data: { turn: 1 } });
  assert.equal(calls.oscillators, 1); // one soft "thock"
});

test("ask: an ask_user_question tool/call plays the 'ask' sound (2 notes)", () => {
  const h = loadBridge({ serverBase: "http://x", completionSound: true });
  const { StubCtx, calls } = makeAudioStub();
  h.window.AudioContext = StubCtx;
  const ws = new h.window.WebSocket(WEBVIEW_ORIGIN + "/api/events.mux");
  const id = h.posted[0].id;
  fireEvent(h, id, "s1", {
    type: "tool/call", seq: 1, time: 0,
    data: { callId: "c1", name: "ask_user_question", arguments: "{}", turn: 1, step: 1 },
  });
  assert.equal(calls.oscillators, 2); // rising two-tone "question"
});

test("ask: the authoritative question/requested frame plays once", () => {
  const h = loadBridge({ serverBase: "http://x", completionSound: true });
  const { StubCtx, calls } = makeAudioStub();
  h.window.AudioContext = StubCtx;
  const ws = new h.window.WebSocket(WEBVIEW_ORIGIN + "/api/events.mux");
  const id = h.posted[0].id;
  fireQuestion(h, id, "s1");
  assert.equal(calls.oscillators, 2);
  fireEvent(h, id, "s1", {
    type: "tool/call", seq: 1, time: 0,
    data: { callId: "c1", name: "ask_user_question", arguments: "{}", turn: 1, step: 1 },
  });
  assert.equal(calls.oscillators, 2, "tool fallback must not duplicate question/requested");
});

test("ask: a non-ask tool/call plays no sound", () => {
  const h = loadBridge({ serverBase: "http://x", completionSound: true });
  const { StubCtx, calls } = makeAudioStub();
  h.window.AudioContext = StubCtx;
  const ws = new h.window.WebSocket(WEBVIEW_ORIGIN + "/api/events.mux");
  const id = h.posted[0].id;
  fireEvent(h, id, "s1", {
    type: "tool/call", seq: 1, time: 0,
    data: { callId: "c1", name: "bash", arguments: "{}", turn: 1, step: 1 },
  });
  assert.equal(calls.oscillators, 0);
});

test("master toggle off silences start and ask sounds too", () => {
  const h = loadBridge({ serverBase: "http://x", completionSound: false });
  const { StubCtx, calls } = makeAudioStub();
  h.window.AudioContext = StubCtx;
  const ws = new h.window.WebSocket(WEBVIEW_ORIGIN + "/api/events.mux");
  const id = h.posted[0].id;
  fireEvent(h, id, "s1", { type: "turn/start", seq: 1, time: 0, data: { turn: 1 } });
  fireEvent(h, id, "s1", {
    type: "tool/call", seq: 2, time: 0,
    data: { callId: "c1", name: "ask_user_question", arguments: "{}", turn: 1, step: 1 },
  });
  assert.equal(calls.oscillators, 0);
});

test("suspended AudioContext waits for resume before scheduling notes", async () => {
  const h = loadBridge({ serverBase: "http://x", completionSound: true });
  const { StubCtx, calls } = makeAudioStub("suspended");
  h.window.AudioContext = StubCtx;
  const ws = new h.window.WebSocket(WEBVIEW_ORIGIN + "/api/events.host");
  const id = h.posted[0].id;
  fireStatus(h, id, "s1", true);
  fireStatus(h, id, "s1", false);
  assert.equal(calls.resumes, 1);
  assert.equal(calls.oscillators, 0, "notes must not be scheduled on a suspended clock");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.oscillators, 2);
});

test("audio priming listens in capture phase so DSH handlers cannot swallow the gesture", () => {
  const h = loadBridge({ serverBase: "http://x", completionSound: true });
  assert.equal(h.listenerOptions.pointerdown[0].capture, true);
  assert.equal(h.listenerOptions.keydown[0].capture, true);
  assert.equal(h.listenerOptions.touchstart[0].capture, true);
});

test("audio priming does not allocate an AudioContext while sounds are disabled", () => {
  const h = loadBridge({ serverBase: "http://x", completionSound: false });
  const { StubCtx, calls } = makeAudioStub("suspended");
  h.window.AudioContext = StubCtx;

  h.listeners.pointerdown.forEach((fn) => fn({}));

  assert.equal(calls.contexts, 0);
  assert.equal(calls.resumes, 0);
});

test("disabling sounds cancels a pending sound while AudioContext resumes", async () => {
  const h = loadBridge({ serverBase: "http://x", completionSound: true });
  const { StubCtx, calls } = makeAudioStub("suspended");
  h.window.AudioContext = StubCtx;
  const ws = new h.window.WebSocket(WEBVIEW_ORIGIN + "/api/events.host");
  const id = h.posted[0].id;

  fireStatus(h, id, "s1", true);
  fireStatus(h, id, "s1", false);
  h.listeners.message.forEach((fn) => fn({ data: { type: "completion-sound", enabled: false } }));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.oscillators, 0);
});
