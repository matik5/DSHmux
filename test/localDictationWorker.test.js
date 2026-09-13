"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { fork } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { parseHostEvent } = require("../out/localDictationWorker.js");

test("host JSONL validation accepts only bounded protocol events", () => {
  assert.deepEqual(parseHostEvent('{"event":"ready"}'), { event: "ready" });
  assert.deepEqual(
    parseHostEvent('{"event":"transcript","phase":"partial","text":"Tere"}'),
    { event: "transcript", phase: "partial", text: "Tere" }
  );
  assert.equal(parseHostEvent("not json"), undefined);
  assert.equal(parseHostEvent('{"event":"transcript","phase":"raw","text":"x"}'), undefined);
});
test("worker maps native-host partial/final JSONL and passes exact safe arguments", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dshmux-host-test-"));
  const hostPath = path.join(root, "fake-host");
  const modelPath = path.join(root, "ggml-large-v3-turbo.bin");
  const argsPath = path.join(root, "args.json");
  fs.writeFileSync(modelPath, "model fixture");
  fs.writeFileSync(hostPath, `#!/usr/bin/env node
const fs = require("node:fs");
fs.writeFileSync(${JSON.stringify(argsPath)}, JSON.stringify(process.argv.slice(2)));
process.stdout.write('{"event":"ready"}\\n');
process.stdout.write('{"event":"transcript","phase":"partial","text":"Tere"}\\n');
process.stdin.setEncoding("utf8");
process.stdin.on("data", value => {
  if (value.includes('"command":"stop"')) {
    process.stdout.write('{"event":"transcript","phase":"final","text":"Tere maailm."}\\n');
  }
});
`);
  fs.chmodSync(hostPath, 0o755);

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
  });
  child.send({
    type: "start",
    generation: 1,
    options: {
      platformKey: "darwin-arm64",
      whisperLanguage: "et",
      hostPath,
      modelPath,
      captureId: -1,
    },
  });
  try {
    await done;
    await exited;
    assert.ok(messages.some((message) => message.type === "transcript" && message.phase === "interim" && message.text === "Tere"));
    assert.ok(messages.some((message) => message.type === "transcript" && message.phase === "complete" && message.text === "Tere maailm."));
    assert.ok(messages.some((message) => message.type === "metrics" && message.stopToFinalMs >= 0));
    assert.deepEqual(JSON.parse(fs.readFileSync(argsPath, "utf8")), [
      "--model", modelPath,
      "--language", "et",
      "--capture-id", "-1",
      "--partial-ms", "750",
    ]);
  } finally {
    child.kill();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
