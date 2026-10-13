"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { fork, spawnSync } = require("node:child_process");
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

async function assertWorkerProtocol({ root, hostPath, modelPath, argsPath, env, readArgs }) {
  const child = fork(path.join(__dirname, "..", "out", "localDictationWorker.js"), [], {
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    env,
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
      platformKey: process.platform === "win32" ? "win32-x64" : "darwin-arm64",
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
    assert.deepEqual(readArgs(argsPath), [
      "--model", modelPath,
      "--language", "et",
      "--capture-id", "-1",
      "--partial-ms", "750",
    ]);
  } finally {
    child.kill();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("POSIX worker maps native-host partial/final JSONL and passes exact safe arguments", {
  skip: process.platform === "win32"
    ? "uses a POSIX shebang fixture"
    : false,
}, async () => {
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

  await assertWorkerProtocol({
    root,
    hostPath,
    modelPath,
    argsPath,
    env: process.env,
    readArgs: file => JSON.parse(fs.readFileSync(file, "utf8")),
  });
});

test("Windows worker maps native-host partial/final JSONL and passes exact safe arguments", {
  skip: process.platform !== "win32"
    ? "uses a Windows PE fixture"
    : false,
}, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dshmux-host-test-"));
  const hostPath = path.join(root, "fake-host.exe");
  const modelPath = path.join(root, "ggml-large-v3-turbo.bin");
  const argsPath = path.join(root, "args.txt");
  fs.writeFileSync(modelPath, "model fixture");

  const cscPath = path.join(
    process.env.SystemRoot || "C:\\Windows",
    "Microsoft.NET",
    "Framework64",
    "v4.0.30319",
    "csc.exe"
  );
  assert.ok(fs.existsSync(cscPath), `Windows C# compiler is missing: ${cscPath}`);
  const compile = spawnSync(cscPath, [
    "/nologo",
    "/target:exe",
    "/platform:x64",
    `/out:${hostPath}`,
    path.join(__dirname, "fixtures", "fakeDictationHost.cs"),
  ], { encoding: "utf8", windowsHide: true });
  if (compile.status !== 0) {
    fs.rmSync(root, { recursive: true, force: true });
    assert.fail(`fake Windows host compilation failed: ${compile.stderr || compile.stdout}`);
  }

  await assertWorkerProtocol({
    root,
    hostPath,
    modelPath,
    argsPath,
    env: { ...process.env, DSHMUX_TEST_ARGS_PATH: argsPath },
    readArgs: file => fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean),
  });
});
