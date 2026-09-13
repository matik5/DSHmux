"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  LocalDictationController,
  LocalDictationError,
  ffmpegCaptureArgs,
  isWorkerEvent,
  preflightLocalDictation,
} = require("../out/localDictation.js");

const created = [];

test.afterEach(() => {
  for (const directory of created.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function touch(filePath, executable = false) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "fixture");
  if (executable) fs.chmodSync(filePath, 0o755);
}

function fixture(platform = "darwin") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dshmux-preflight-test-"));
  created.push(root);
  const ffmpegPath = path.join(root, platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  const whisperPath = path.join(root, platform === "win32" ? "whisper-cli.exe" : "whisper-cli");
  const modelPath = path.join(root, "models", "ggml-large-v3-turbo.bin");
  touch(ffmpegPath, true);
  touch(whisperPath, true);
  touch(modelPath);
  return {
    environment: {
      platform,
      arch: platform === "darwin" ? "arm64" : "x64",
      homeDir: path.join(root, "home"),
      pathValue: "",
    },
    settings: {
      enabled: true,
      language: "en-US",
      ffmpegPath,
      whisperPath,
      modelPath,
      audioDevice: platform === "win32" ? "Test Microphone" : "",
    },
    ffmpegPath,
    whisperPath,
    modelPath,
  };
}

test("Mac preflight validates explicit local Whisper dependencies without VS Code cache access", async () => {
  const item = fixture("darwin");
  const result = await preflightLocalDictation(item.environment, item.settings);
  assert.deepEqual(result, {
    platformKey: "darwin-arm64",
    whisperLanguage: "en",
    ffmpegPath: item.ffmpegPath,
    whisperPath: item.whisperPath,
    modelPath: item.modelPath,
    audioDevice: "",
  });
});

test("Windows preflight maps Estonian and preserves the DirectShow device", async () => {
  const item = fixture("win32");
  const result = await preflightLocalDictation(item.environment, {
    ...item.settings,
    language: "et-EE",
  });
  assert.equal(result.platformKey, "win32-x64");
  assert.equal(result.whisperLanguage, "et");
  assert.equal(result.audioDevice, "Test Microphone");
});

test("preflight rejects disabled, remote, unsupported and missing/relative dependencies", async () => {
  const item = fixture("darwin");
  await assert.rejects(
    preflightLocalDictation(item.environment, { ...item.settings, enabled: false }),
    (error) => error instanceof LocalDictationError && error.code === "disabled"
  );
  await assert.rejects(
    preflightLocalDictation({ ...item.environment, remoteName: "ssh-remote" }, item.settings),
    (error) => error.code === "remote-host"
  );
  await assert.rejects(
    preflightLocalDictation({ ...item.environment, arch: "x64" }, item.settings),
    (error) => error.code === "unsupported-platform"
  );
  await assert.rejects(
    preflightLocalDictation(item.environment, { ...item.settings, modelPath: "model.bin" }),
    (error) => error.code === "model-unavailable"
  );
  await assert.rejects(
    preflightLocalDictation(item.environment, { ...item.settings, whisperPath: "whisper-cli" }),
    (error) => error.code === "whisper-unavailable"
  );
  fs.rmSync(item.modelPath);
  await assert.rejects(
    preflightLocalDictation(item.environment, item.settings),
    (error) => error.code === "model-unavailable"
  );
});

test("capture arguments write PCM16 WAV and preserve a hostile device as one argument", () => {
  assert.throws(
    () => ffmpegCaptureArgs("win32", "", "C:\\Temp\\recording.wav"),
    (error) => error.code === "audio-device-required"
  );
  const output = "C:\\Temp\\recording.wav";
  const args = ffmpegCaptureArgs("win32", "Mic & calc.exe", output);
  assert.ok(args.includes("audio=Mic & calc.exe"));
  assert.equal(args.includes("&"), false);
  assert.deepEqual(args.slice(-7), ["-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", output]);
});

test("worker-event validation rejects malformed IPC", () => {
  assert.equal(isWorkerEvent({ type: "ready", generation: 1 }), true);
  assert.equal(isWorkerEvent({ type: "transcript", generation: 1, phase: "complete", text: "hi" }), true);
  assert.equal(isWorkerEvent({ type: "transcript", generation: 0, phase: "complete", text: "hi" }), false);
  assert.equal(isWorkerEvent({ type: "transcript", generation: 1, phase: "raw", text: "hi" }), false);
  assert.equal(isWorkerEvent({ type: "error", generation: 1, errorCode: 42 }), false);
});

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.connected = true;
    this.sent = [];
    this.killed = false;
  }

  send(message) {
    this.sent.push(message);
  }

  kill() {
    this.killed = true;
    this.connected = false;
    return true;
  }
}

function controllerFixture() {
  const child = new FakeChild();
  const events = [];
  const forks = [];
  const controller = new LocalDictationController({
    workerPath: "/extension/out/localDictationWorker.js",
    execPath: "/code-helper",
    env: { SAFE: "1" },
    startupTimeoutMs: 1_000,
    stopTimeoutMs: 1_000,
    fork(workerPath, args, options) {
      forks.push({ workerPath, args, options });
      return child;
    },
    onEvent: (event) => events.push(event),
  });
  const options = {
    platformKey: "darwin-arm64",
    whisperLanguage: "en",
    ffmpegPath: "/ffmpeg",
    whisperPath: "/whisper-cli",
    modelPath: "/models/ggml-large-v3-turbo.bin",
    audioDevice: "",
  };
  return { child, controller, events, forks, options };
}

test("controller fences one complete-only generation through Stop", async () => {
  const item = controllerFixture();
  await item.controller.start(item.options);
  assert.equal(item.forks.length, 1);
  assert.equal(item.forks[0].options.env.ELECTRON_RUN_AS_NODE, "1");
  assert.equal(item.forks[0].options.env.VSCODE_FOUNDRY_LOCAL_NATIVE_DIR, undefined);
  assert.equal(item.child.sent[0].type, "start");
  await assert.rejects(item.controller.start(item.options), (error) => error.code === "busy");

  item.child.emit("message", { type: "ready", generation: 1 });
  item.child.emit("message", { type: "transcript", generation: 2, phase: "complete", text: "stale" });
  await item.controller.stop();
  item.child.emit("message", { type: "transcript", generation: 1, phase: "complete", text: "hello world" });
  item.child.emit("exit", 0, null);

  assert.deepEqual(item.events.map((event) => event.type === "state" ? event.state : `${event.phase}:${event.text}`), [
    "preparing",
    "listening",
    "stopping",
    "complete:hello world",
    "idle",
  ]);
});

test("controller Cancel suppresses completion and releases the child", async () => {
  const item = controllerFixture();
  await item.controller.start(item.options);
  item.child.emit("message", { type: "ready", generation: 1 });
  await item.controller.cancel();
  item.child.emit("message", { type: "transcript", generation: 1, phase: "complete", text: "discard" });
  item.child.emit("exit", 0, null);
  assert.equal(item.events.some((event) => event.type === "transcript"), false);
  assert.equal(item.events.at(-1).state, "idle");
});

test("controller converts failed worker behavior to a bounded error", async () => {
  const item = controllerFixture();
  await item.controller.start(item.options);
  item.child.emit("error", new Error("private output must not escape"));
  assert.deepEqual(item.events.at(-1), {
    type: "state",
    generation: 1,
    state: "error",
    errorCode: "worker-failed",
  });
  assert.equal(item.child.killed, true);
});
