// Transport bridge — webview side (T5/T6/T7).
// Runs inside the webview document, BEFORE the DSH shell bundle. It shims
// fetch / WebSocket / navigator.clipboard so that every same-origin request
// (the DSH frontend resolves its API base to location.origin) is relayed
// through postMessage to the extension host, which performs the real call
// against the local dsh server (Node requests pass the /api trust fence).
//
// Protocol (webview -> host): http / http-abort / ws-open / ws-send / ws-close
//                            / clipboard-write / clipboard-read
//          (host -> webview): http-res / http-err / ws-open-res / ws-frame
//                            / ws-close / clipboard-res / server-status
(function () {
  "use strict";
  var bridge = window.__DSH_BRIDGE__ || { serverBase: "" };
  var vscode = acquireVsCodeApi();
  var nextId = 1;
  var pendingHttp = new Map(); // id -> { resolve, reject }
  var pendingClipboard = new Map(); // id -> { resolve, reject }
  var sockets = []; // BridgeWebSocket registry by _id

  function post(msg) {
    vscode.postMessage(msg);
  }

  function isSameOrigin(urlStr) {
    try {
      return new URL(urlStr, location.href).origin === location.origin;
    } catch (_e) {
      return false;
    }
  }

  // fetch() inputs can be a string, a URL object (what the DSH client passes),
  // or a Request — normalize to a URL string. URL objects expose `.href`,
  // NOT `.url`; reading `.url` yields undefined and resolves to "/undefined".
  function toUrlString(input) {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    if (input && typeof input.url === "string") return input.url;
    return String(input);
  }

  // -------------------------------------- prefers-color-scheme shim (R7 fix)
  // The embedded page's client connection sees a non-loopback page origin
  // (vscode-webview://), so its settings scope runs in "memory" mode and
  // never adopts ui-theme.preference — the theme stays on "system", which
  // resolves through matchMedia("(prefers-color-scheme: dark)"). Shimming
  // that query to follow the VS Code theme makes the boot script AND the
  // ThemeRuntime resolve dark/light correctly.
  var realMatchMedia = (window.matchMedia || function () {
    return { matches: false, media: "", addEventListener: function () {}, removeEventListener: function () {}, addListener: function () {}, removeListener: function () {} };
  }).bind(window);
  var DARK_QUERY = "(prefers-color-scheme: dark)";
  var darkOverride; // undefined = real media; boolean = forced by VS Code theme
  var mediaListeners = new Set();
  window.matchMedia = function (query) {
    if (query !== DARK_QUERY) return realMatchMedia(query);
    return {
      get matches() {
        return darkOverride === undefined ? realMatchMedia(DARK_QUERY).matches : darkOverride;
      },
      media: DARK_QUERY,
      addEventListener: function (type, fn) { if (type === "change") mediaListeners.add(fn); },
      removeEventListener: function (type, fn) { if (type === "change") mediaListeners.delete(fn); },
      addListener: function (fn) { mediaListeners.add(fn); },
      removeListener: function (fn) { mediaListeners.delete(fn); },
    };
  };
  if (bridge.dark !== undefined) darkOverride = !!bridge.dark;

  // ------------------------------------------------------------------ fetch
  var nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var urlStr = toUrlString(input);
    if (!isSameOrigin(urlStr)) return nativeFetch(input, init);

    var url = new URL(urlStr, location.href);
    var method = (init && init.method) || (input && input.method) || "GET";
    var headers = init && init.headers ? normalizeHeaders(init.headers) : undefined;
    var body = init && init.body != null ? normalizeBody(init.body) : undefined;
    var signal = init && init.signal;
    var id = nextId++;

    return new Promise(function (resolve, reject) {
      var onAbort = function () {
        if (pendingHttp.delete(id)) {
          post({ type: "http-abort", id: id });
          reject(new DOMException("Aborted", "AbortError"));
        }
      };
      if (signal) {
        if (signal.aborted) return onAbort();
        signal.addEventListener("abort", onAbort, { once: true });
      }
      pendingHttp.set(id, { resolve: resolve, reject: reject });
      post({
        type: "http",
        id: id,
        method: method,
        url: url.pathname + url.search,
        headers: headers,
        body: body,
      });
    });
  };

  function normalizeHeaders(headers) {
    if (headers instanceof Headers) return Object.fromEntries(headers.entries());
    if (Array.isArray(headers)) return Object.fromEntries(headers);
    return headers;
  }

  // The DSH RPC carrier always posts JSON strings; binary bodies (downloads)
  // are the response side. Blob/FormData fall back to no body for MVP.
  function normalizeBody(body) {
    if (typeof body === "string" || body instanceof ArrayBuffer) return body;
    if (ArrayBuffer.isView(body)) return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
    return null;
  }

  // ------------------------------------------------------------------- ws
  function BridgeWebSocket(url) {
    this.url = url;
    this.readyState = BridgeWebSocket.CONNECTING;
    this._id = nextId++;
    this._listeners = { open: [], message: [], close: [], error: [] };
    sockets.push(this);
    var parsed = new URL(url);
    post({ type: "ws-open", id: this._id, path: parsed.pathname + parsed.search });
  }
  BridgeWebSocket.CONNECTING = 0;
  BridgeWebSocket.OPEN = 1;
  BridgeWebSocket.CLOSING = 2;
  BridgeWebSocket.CLOSED = 3;
  BridgeWebSocket.prototype.addEventListener = function (type, fn) {
    if (this._listeners[type]) this._listeners[type].push(fn);
  };
  BridgeWebSocket.prototype.removeEventListener = function (type, fn) {
    if (!this._listeners[type]) return;
    this._listeners[type] = this._listeners[type].filter(function (f) { return f !== fn; });
  };
  BridgeWebSocket.prototype._fire = function (type, event) {
    this._listeners[type].forEach(function (fn) { fn(event); });
  };
  BridgeWebSocket.prototype.close = function () {
    if (this.readyState === BridgeWebSocket.CLOSED || this.readyState === BridgeWebSocket.CLOSING) return;
    this.readyState = BridgeWebSocket.CLOSING;
    post({ type: "ws-close", id: this._id });
  };
  BridgeWebSocket.prototype.send = function (data) {
    post({ type: "ws-send", id: this._id, data: String(data) });
  };
  function findSocket(id) {
    for (var i = 0; i < sockets.length; i++) if (sockets[i]._id === id) return sockets[i];
    return undefined;
  }
  window.WebSocket = BridgeWebSocket;

  // ------------------------------------------------- session sounds (Web Audio)
  // DSH streams two frame kinds over the bridged WebSocket downlink, both
  // observed in the ws-frame handler below (see observeFrame):
  //   * host/session-status ({ type, sessionId, running }) on /api/events.host —
  //     a running true->false edge means the task is DONE; turn/end is the
  //     mux-stream fallback when the webview missed the preceding true frame.
  //   * session/event       ({ type, sessionId, event }) on /api/events.mux —
  //     event.type "turn/start" means a task was picked up and started; a
  //     "tool/call" whose data.name is "ask_user_question", or the authoritative
  //     question/requested frame, means the harness is asking for an answer.
  // Each plays a distinct short sound (Web Audio API, no audio file), all gated
  // by the single dshmux.completionSound master toggle.
  var completionSoundEnabled = bridge.completionSound !== false; // default on
  var runningBySession = {}; // sessionId -> last seen running bit
  var lastSoundAt = {}; // "kind:sessionId" -> timestamp (dedupe fallback frames)
  var audioCtx = null;
  var pendingSoundKind = null;

  function ensureAudioCtx() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    return audioCtx;
  }

  // Chromium autoplay policy: an AudioContext created before any user gesture
  // starts "suspended". Prime it on the first gesture so later completions can
  // sound even when the user is not actively clicking (e.g. switched windows).
  function primeAudio() {
    if (!completionSoundEnabled) {
      pendingSoundKind = null;
      return;
    }
    var ctx = ensureAudioCtx();
    if (!ctx) return;
    function flushPending() {
      if (ctx.state === "running" && pendingSoundKind) {
        var kind = pendingSoundKind;
        pendingSoundKind = null;
        playSound(kind);
      }
    }
    if (ctx.state !== "running") {
      try {
        var resumed = ctx.resume();
        if (resumed && typeof resumed.then === "function") {
          resumed.then(flushPending).catch(function () {});
        } else {
          flushPending();
        }
      } catch (_e) {}
    } else {
      flushPending();
    }
  }
  // Capture phase matters: the embedded app may stop propagation on composer
  // input events, but Chromium still requires a real user gesture to unlock
  // Web Audio. Capture lets DSHmux prime the context before app handlers run.
  window.addEventListener("pointerdown", primeAudio, { passive: true, capture: true });
  window.addEventListener("keydown", primeAudio, { capture: true });
  window.addEventListener("touchstart", primeAudio, { passive: true, capture: true });

  // Distinct short sounds, all sine, all gated by the completionSound toggle.
  // "done"  — task finished: two-tone ding-dong A5->D6 (most prominent).
  // "ask"   — harness asks for your answer: rising two-tone C5->G5.
  // "start" — a task is picked up / starts: one soft low "thock" (shortest).
  var SOUNDS = {
    done: [
      { freq: 880.0, at: 0.0, gain: 0.28, decay: 0.32 },
      { freq: 1174.66, at: 0.14, gain: 0.28, decay: 0.32 },
    ],
    ask: [
      { freq: 523.25, at: 0.0, gain: 0.26, decay: 0.16 },
      { freq: 784.0, at: 0.11, gain: 0.26, decay: 0.2 },
    ],
    start: [
      { freq: 220.0, at: 0.0, gain: 0.2, decay: 0.09 },
    ],
  };

  function scheduleSound(ctx, notes) {
    var now = ctx.currentTime;
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      var t0 = now + n.at;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(n.freq, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(n.gain, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.02 + n.decay);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.02 + n.decay + 0.04);
    }
  }

  function playSound(kind) {
    var notes = SOUNDS[kind];
    if (!notes) return;
    var ctx = ensureAudioCtx();
    if (!ctx) return;
    function playWhenRunning() {
      if (!completionSoundEnabled) {
        if (pendingSoundKind === kind) pendingSoundKind = null;
        return;
      }
      if (ctx.state !== "running") {
        pendingSoundKind = kind;
        return;
      }
      if (pendingSoundKind === kind) pendingSoundKind = null;
      scheduleSound(ctx, notes);
    }
    if (ctx.state !== "running") {
      pendingSoundKind = kind;
      try {
        var resumed = ctx.resume();
        if (resumed && typeof resumed.then === "function") {
          resumed.then(playWhenRunning).catch(function () {});
        } else {
          playWhenRunning();
        }
      } catch (_e) {}
      return;
    }
    playWhenRunning();
  }

  function playSoundOnce(kind, sessionId) {
    if (!completionSoundEnabled) return;
    var key = kind + ":" + String(sessionId == null ? "" : sessionId);
    var now = Date.now();
    if (lastSoundAt[key] && now - lastSoundAt[key] < 2000) return;
    lastSoundAt[key] = now;
    playSound(kind);
  }

  // Observe one bridged WebSocket frame for sound-worthy transitions:
  //   * host/session-status running true->false  -> "done"
  //   * session/event turn/start                 -> "start"
  //   * session/event tool/call ask_user_question-> "ask"
  function observeFrame(data) {
    var parsed;
    try {
      parsed = JSON.parse(data);
    } catch (_e) {
      return; // not a JSON frame (or malformed) — ignore
    }
    var payload = parsed && parsed.payload;
    if (!payload) return;

    if (payload.type === "host/session-status") {
      var sid = payload.sessionId;
      if (sid === void 0 || sid === null) return;
      var running = payload.running === true;
      var prev = runningBySession[sid];
      runningBySession[sid] = running;
      if (prev === true && running === false) playSoundOnce("done", sid);
      return;
    }

    if (payload.type === "question/requested") {
      playSoundOnce("ask", payload.sessionId);
      return;
    }

    if (payload.type === "session/event") {
      var ev = payload.event;
      if (!ev || !ev.type) return;
      if (ev.type === "turn/start") {
        playSoundOnce("start", payload.sessionId);
      } else if (ev.type === "turn/end") {
        playSoundOnce("done", payload.sessionId);
      } else if (ev.type === "tool/call" && ev.data && ev.data.name === "ask_user_question") {
        playSoundOnce("ask", payload.sessionId);
      }
    }
  }

  // ------------------------------------------------------------- clipboard
  try {
    var clipboardShim = {
      writeText: function (text) {
        return new Promise(function (resolve, reject) {
          var id = nextId++;
          pendingClipboard.set(id, { resolve: resolve, reject: reject });
          post({ type: "clipboard-write", id: id, text: String(text) });
        });
      },
      readText: function () {
        return new Promise(function (resolve, reject) {
          var id = nextId++;
          pendingClipboard.set(id, { resolve: resolve, reject: reject });
          post({ type: "clipboard-read", id: id });
        });
      },
    };
    Object.defineProperty(navigator, "clipboard", { value: clipboardShim, configurable: true });
  } catch (_e) {
    console.error("[dsh-bridge] clipboard shim failed", _e);
  }

  // ---------------------------------------------------------- host -> page
  window.addEventListener("message", function (event) {
    var msg = event.data;
    if (!msg || typeof msg !== "object") return;
    switch (msg.type) {
      case "http-res": {
        var hp = pendingHttp.get(msg.id);
        if (!hp) break;
        pendingHttp.delete(msg.id);
        hp.resolve(
          new Response(msg.body != null ? msg.body : null, {
            status: msg.status,
            statusText: msg.statusText,
            headers: msg.headers,
          })
        );
        break;
      }
      case "http-err": {
        var he = pendingHttp.get(msg.id);
        if (!he) break;
        pendingHttp.delete(msg.id);
        he.reject(new Error(msg.message));
        break;
      }
      case "ws-open-res": {
        var wsOpen = findSocket(msg.id);
        if (!wsOpen) break;
        wsOpen.readyState = BridgeWebSocket.OPEN;
        wsOpen._fire("open", {});
        break;
      }
      case "ws-frame": {
        var wsFrame = findSocket(msg.id);
        if (!wsFrame) break;
        wsFrame._fire("message", { data: msg.data });
        observeFrame(msg.data); // completion-sound detector (running true->false edge)
        break;
      }
      case "ws-close": {
        var wsClose = findSocket(msg.id);
        if (!wsClose) break;
        wsClose.readyState = BridgeWebSocket.CLOSED;
        wsClose._fire("close", { code: msg.code, reason: msg.reason });
        var wsIdx = sockets.indexOf(wsClose);
        if (wsIdx !== -1) sockets.splice(wsIdx, 1);
        break;
      }
      case "clipboard-res": {
        var cp = pendingClipboard.get(msg.id);
        if (!cp) break;
        pendingClipboard.delete(msg.id);
        if (msg.ok) cp.resolve(msg.text !== undefined ? msg.text : undefined);
        else cp.reject(new Error(msg.message || "clipboard operation failed"));
        break;
      }
      case "theme-preference": {
        darkOverride = !!msg.dark;
        mediaListeners.forEach(function (fn) {
          try {
            fn({ matches: darkOverride, media: DARK_QUERY });
          } catch (_e) {
            /* listener isolation */
          }
        });
        break;
      }
      case "completion-sound": {
        completionSoundEnabled = !!msg.enabled;
        if (!completionSoundEnabled) pendingSoundKind = null;
        break;
      }
      default:
        break;
    }
  });
})();
