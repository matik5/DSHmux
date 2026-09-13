// Deterministic tests for the original dependency-free Mux Trail engine and
// delayed waiting-state gate. The browser controller consumes the same API.
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const sourcePath = path.join(__dirname, "..", "media", "mux-trail.js");
const source = fs.readFileSync(sourcePath, "utf8");
const {
  createGame,
  queueDirection,
  stepGame,
  spawnPacket,
  speedForScore,
  snapshotGame,
  restoreGame,
  createOfferGate,
  install,
} = require(sourcePath);

function clock() {
  let now = 0;
  let nextId = 1;
  const pending = new Map();
  return {
    setTimeout(fn, delay) {
      const id = nextId++;
      pending.set(id, { at: now + delay, fn });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    advance(ms) {
      const target = now + ms;
      while (true) {
        const due = [...pending.entries()]
          .filter(([, task]) => task.at <= target)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        pending.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = target;
    },
    get pendingCount() {
      return pending.size;
    },
  };
}

test("game waits for the first valid direction and rejects immediate reverse", () => {
  const game = createGame(() => 0, 18, 18);
  const before = structuredClone(game.trail);
  stepGame(game, () => 0);
  assert.deepEqual(game.trail, before, "idle board must not move");
  assert.equal(queueDirection(game, { x: -1, y: 0 }), false, "left reverses the initial right-facing trail");
  assert.equal(queueDirection(game, { x: 0, y: -1 }), true);
  assert.equal(queueDirection(game, { x: 1, y: 0 }), false, "only one turn may be queued per tick");
  stepGame(game, () => 0);
  assert.deepEqual(game.trail[0], { x: 9, y: 8 });
  assert.equal(game.started, true);
});

test("game wraps across every edge and moving into a vacating tail is legal", () => {
  const game = createGame(() => 0, 6, 6);
  game.trail = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 5, y: 0 }];
  game.direction = { x: -1, y: 0 };
  game.started = true;
  game.packet = { x: 3, y: 3 };
  stepGame(game, () => 0);
  assert.equal(game.over, false);
  assert.deepEqual(game.trail[0], { x: 5, y: 0 });
});

test("packet collection grows the trail and increments score", () => {
  const game = createGame(() => 0, 8, 8);
  game.started = true;
  game.packet = { x: game.trail[0].x + 1, y: game.trail[0].y };
  const oldLength = game.trail.length;
  stepGame(game, () => 0.5);
  assert.equal(game.score, 1);
  assert.equal(game.trail.length, oldLength + 1);
  assert.ok(!game.trail.some((cell) => cell.x === game.packet.x && cell.y === game.packet.y));
});

test("self-collision ends the round", () => {
  const game = createGame(() => 0, 8, 8);
  game.trail = [
    { x: 3, y: 3 },
    { x: 3, y: 2 },
    { x: 2, y: 2 },
    { x: 2, y: 3 },
    { x: 2, y: 4 },
  ];
  game.direction = { x: -1, y: 0 };
  game.started = true;
  game.packet = { x: 7, y: 7 };
  stepGame(game, () => 0);
  assert.equal(game.over, true);
  assert.equal(game.score, 0);
});

test("packet spawn is bounded and never occupies the trail", () => {
  const trail = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
  assert.deepEqual(spawnPacket(trail, 2, 2, () => -4), { x: 0, y: 1 });
  assert.deepEqual(spawnPacket(trail, 2, 2, () => 4), { x: 1, y: 1 });
  assert.equal(spawnPacket([...trail, { x: 0, y: 1 }, { x: 1, y: 1 }], 2, 2, () => 0), null);
});

test("speed increases gently and remains bounded", () => {
  assert.equal(speedForScore(0), 150);
  assert.equal(speedForScore(3), 140);
  assert.equal(speedForScore(999), 70);
});

test("game snapshots restore valid live rounds and reject dead or malformed state", () => {
  const game = createGame(() => 0.5, 18, 18);
  game.started = true;
  game.score = 7;
  const snapshot = snapshotGame(game);
  assert.deepEqual(restoreGame(snapshot), game);
  game.over = true;
  assert.equal(snapshotGame(game), null, "dead rounds must never be resumable");
  assert.equal(restoreGame({ ...snapshot, trail: [{ x: -1, y: 0 }] }), null);
  assert.equal(restoreGame({ ...snapshot, score: -1 }), null);
});

test("offer gate waits exactly 3000 ms and duplicate begin is idempotent", () => {
  const fake = clock();
  const events = [];
  const gate = createOfferGate({
    setTimeout: fake.setTimeout,
    clearTimeout: fake.clearTimeout,
    onOffer: (session) => events.push(["offer", session]),
    onDismiss: (reason) => events.push(["dismiss", reason]),
    delayMs: 3000,
  });
  gate.begin("s1");
  gate.begin("s1");
  assert.equal(fake.pendingCount, 1);
  fake.advance(2999);
  assert.deepEqual(events, []);
  fake.advance(1);
  assert.deepEqual(events, [["offer", "s1"]]);
  assert.deepEqual(gate.state(), { waiting: true, offered: true, destroyed: false, context: "s1" });
  gate.end("complete");
  gate.end("complete");
  assert.deepEqual(events, [["offer", "s1"], ["dismiss", "complete"]]);
  assert.equal(fake.pendingCount, 0);
});

test("early completion and destroy cancel delayed work", () => {
  const fake = clock();
  const events = [];
  const gate = createOfferGate({
    setTimeout: fake.setTimeout,
    clearTimeout: fake.clearTimeout,
    onOffer: () => events.push("offer"),
    onDismiss: (reason) => events.push(reason),
    delayMs: 3000,
  });
  gate.begin("s1");
  gate.end("complete");
  fake.advance(3000);
  assert.deepEqual(events, ["complete"]);
  gate.begin("s2");
  gate.destroy();
  fake.advance(3000);
  assert.deepEqual(events, ["complete", "destroy"]);
  assert.equal(fake.pendingCount, 0);
  assert.equal(gate.state().destroyed, true);
});

test("browser controller source pins accessibility, responsive theme, and cleanup contracts", () => {
  assert.match(source, /setAttribute\("role", "dialog"\)/);
  assert.match(source, /setAttribute\("aria-modal", "true"\)/);
  assert.match(source, /aria-labelledby/);
  assert.match(source, /@media\(max-width:260px\)/);
  assert.match(source, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(source, /@media\(forced-colors:active\)/);
  assert.match(source, /--vscode-focusBorder/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /removeEventListener/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /new\s+WebSocket\b/);
  assert.doesNotMatch(source, /navigator\.clipboard/);
});

test("browser controller lazily opens, captures gameplay keys, dismisses, and removes DOM", () => {
  const fake = clock();
  const documentListeners = new Map();
  const windowListeners = new Map();

  class Node {
    constructor(tag, document) {
      this.tagName = tag.toUpperCase();
      this.ownerDocument = document;
      this.children = [];
      this.listeners = new Map();
      this.style = {};
      this.hidden = false;
      this.parentNode = null;
      this.width = 0;
      this.height = 0;
    }
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    setAttribute(name, value) { this[name] = String(value); }
    addEventListener(type, fn) { (this.listeners.get(type) || this.listeners.set(type, []).get(type)).push(fn); }
    dispatch(type, event = {}) {
      event.target ||= this;
      for (const fn of this.listeners.get(type) || []) fn(event);
    }
    focus() { this.ownerDocument.activeElement = this; }
    remove() {
      if (!this.parentNode) return;
      this.parentNode.children = this.parentNode.children.filter((node) => node !== this);
      this.parentNode = null;
    }
    getBoundingClientRect() { return { width: 240, height: 240 }; }
    getContext() {
      if (this.tagName !== "CANVAS") return null;
      return {
        globalAlpha: 1,
        setTransform() {}, fillRect() {}, strokeRect() {}, beginPath() {},
        moveTo() {}, lineTo() {}, stroke() {}, save() {}, restore() {},
        translate() {}, rotate() {},
      };
    }
  }

  const document = {
    visibilityState: "visible",
    activeElement: null,
    createElement(tag) { return new Node(tag, document); },
    addEventListener(type, fn) { (documentListeners.get(type) || documentListeners.set(type, []).get(type)).push(fn); },
    removeEventListener(type, fn) {
      documentListeners.set(type, (documentListeners.get(type) || []).filter((item) => item !== fn));
    },
  };
  document.head = new Node("head", document);
  document.body = new Node("body", document);
  const window = {
    document,
    devicePixelRatio: 1,
    setTimeout: fake.setTimeout,
    clearTimeout: fake.clearTimeout,
    addEventListener(type, fn) { (windowListeners.get(type) || windowListeners.set(type, []).get(type)).push(fn); },
    removeEventListener(type, fn) {
      windowListeners.set(type, (windowListeners.get(type) || []).filter((item) => item !== fn));
    },
    getComputedStyle() { return { getPropertyValue() { return ""; } }; },
  };
  const find = (root, id) => {
    if (root.id === id) return root;
    for (const child of root.children) {
      const found = find(child, id);
      if (found) return found;
    }
    return null;
  };
  let persisted;
  const storage = {
    load() { return persisted; },
    save(value) { persisted = structuredClone(value); },
  };
  const controller = install(window, { delayMs: 3000, random: () => 0 });
  controller.attachStorage(storage);
  controller.beginWait("s1");
  assert.equal(document.body.children.length, 0, "idle delay creates no visible game chrome");
  fake.advance(3000);
  const launcher = find(document.body, "dshmux-mux-trail-launch");
  assert.ok(launcher && !launcher.hidden);
  launcher.dispatch("click");
  assert.equal(controller.state().open, true);
  const overlay = document.body.children.find((node) => node.className === "dshmux-mux-trail");
  const dialog = find(overlay, "dshmux-mux-trail-title").parentNode.parentNode;
  let prevented = 0;
  dialog.dispatch("keydown", {
    key: "ArrowUp",
    preventDefault() { prevented++; },
    stopPropagation() {},
  });
  assert.equal(prevented, 1);
  assert.ok(fake.pendingCount > 0, "active game schedules one bounded tick");
  fake.advance(150);
  const savedHead = persisted.rounds["session:s1"].trail[0];
  controller.endWait("complete");
  assert.equal(controller.state().open, false);
  assert.equal(overlay.hidden, true);
  assert.equal(fake.pendingCount, 0);

  controller.beginWait("s1");
  fake.advance(3000);
  launcher.dispatch("click");
  assert.equal(controller.state().open, true);
  assert.deepEqual(persisted.rounds["session:s1"].trail[0], savedHead, "live round resumes for the same session");
  assert.match(find(overlay, "dshmux-mux-trail-title").parentNode.children[1].textContent, /Best 0/);
  controller.endWait("complete");
  controller.destroy();
  assert.equal(document.body.children.length, 0);
  assert.equal(document.head.children.length, 0);
});

test("death clears the resumable round but retains max score", () => {
  const fake = clock();
  const listeners = new Map();
  let persisted = {
    version: 1,
    maxScore: 2,
    rounds: {
      "session:s-death": {
        columns: 8,
        rows: 8,
        trail: [{ x: 3, y: 3 }, { x: 3, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 3 }, { x: 2, y: 4 }],
        packet: { x: 7, y: 7 },
        direction: { x: -1, y: 0 },
        pendingDirection: null,
        turnQueued: false,
        started: true,
        over: false,
        won: false,
        score: 6,
      },
    },
  };
  class Node {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.listeners = new Map(); this.style = {}; this.hidden = false; }
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
    setAttribute(name, value) { this[name] = String(value); }
    addEventListener(type, fn) { (this.listeners.get(type) || this.listeners.set(type, []).get(type)).push(fn); }
    dispatch(type, event = {}) { event.target ||= this; for (const fn of this.listeners.get(type) || []) fn(event); }
    focus() {}
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this); }
    getBoundingClientRect() { return { width: 240, height: 240 }; }
    getContext() { return this.tagName === "CANVAS" ? { setTransform() {}, fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, save() {}, restore() {}, translate() {}, rotate() {} } : null; }
  }
  const document = {
    visibilityState: "visible",
    createElement: (tag) => new Node(tag),
    head: new Node("head"),
    body: new Node("body"),
    addEventListener(type, fn) { listeners.set("doc:" + type, fn); },
    removeEventListener() {},
  };
  const window = {
    document,
    setTimeout: fake.setTimeout,
    clearTimeout: fake.clearTimeout,
    addEventListener(type, fn) { listeners.set("win:" + type, fn); },
    removeEventListener() {},
    getComputedStyle() { return { getPropertyValue() { return ""; } }; },
  };
  const controller = install(window, { delayMs: 0, random: () => 0 });
  controller.attachStorage({
    load: () => persisted,
    save: (value) => { persisted = structuredClone(value); },
  });
  controller.beginWait("s-death");
  fake.advance(0);
  document.body.children[0].dispatch("click");
  fake.advance(speedForScore(6));
  assert.equal(persisted.rounds["session:s-death"], undefined);
  assert.equal(persisted.maxScore, 6);
  assert.equal(controller.state().gameOver, true);
  controller.destroy();
});
