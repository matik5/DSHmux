"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { fork } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { normalizeWhisperOutput } = require("../out/localDictationWorker.js");

test("Whisper output normalization removes only CLI framing", () => {
  assert.equal(
    normalizeWhisperOutput("\u001b[32m Tere maailm. \u001b[0m\n See on test.\n"),
    "Tere maailm. See on test."
  );
});

test("worker records WAV, transcribes only after Stop, emits one final, and cleans temp state", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dshmux-worker-test-"));
  const ffmpegPath = path.join(root, "fake-ffmpeg");
  const whisperPath = path.join(root, "fake-whisper");
  const modelPath = path.join(root, "ggml-large-v3-turbo.bin");
  fs.writeFileSync(modelPath, "model fixture");
  fs.writeFileSync(ffmpegPath, `#!/usr/bin/env node
const fs = require("node:fs");
const output = process.argv.at(-1);
fs.writeFileSync(output, Buffer.from("RIFF fixture WAV"));
process.stdin.setEncoding("utf8");
process.stdin.on("data", value => {
  if (value.includes("q")) process.exit(0);
});
`);
  fs.writeFileSync(whisperPath, `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const file = args[args.indexOf("--file") + 1];
const model = args[args.indexOf("--model") + 1];
const language = args[args.indexOf("--language") + 1];
if (!fs.readFileSync(file).toString().startsWith("RIFF")) process.exit(2);
if (!fs.existsSync(model) || language !== "et") process.exit(3);
process.stdout.write("  Tere maailm.  \\n");
`);
  fs.chmodSync(ffmpegPath, 0o755);
  fs.chmodSync(whisperPath, 0o755);

  const before = new Set(
    fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith("dshmux-dictation-"))
  );
  const child = fork(path.join(__dirname, "..", "out", "localDictationWorker.js"), [], {
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  const messages = [];
  const exited = new Promise((resolve) => child.once("exit", resolve));
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("worker test timed out")), 8_000);
    child.on("message", (message) => {
      messages.push(message);
      if (message.type === "ready") child.send({ type: "stop", generation: 1 });
      if (message.type === "transcript" && message.phase === "complete") {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (!messages.some((message) => message.type === "transcript")) {
        reject(new Error(`worker exited before completion (${code})`));
      }
    });
  });
  child.send({
    type: "start",
    generation: 1,
    options: {
      platformKey: "darwin-arm64",
      whisperLanguage: "et",
      ffmpegPath,
      whisperPath,
      modelPath,
      audioDevice: "",
    },
  });
  try {
    await done;
    assert.equal(messages.filter((message) => message.type === "transcript").length, 1);
    assert.ok(messages.some((message) => message.type === "metrics" && message.peakRssBytes > 0));
    assert.ok(messages.some((message) =>
      message.type === "transcript" &&
      message.phase === "complete" &&
      message.text === "Tere maailm."
    ));
    await exited;
    const after = fs.readdirSync(os.tmpdir())
      .filter((name) => name.startsWith("dshmux-dictation-") && !before.has(name));
    assert.deepEqual(after, []);
  } finally {
    child.kill();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
