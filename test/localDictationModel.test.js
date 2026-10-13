"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PassThrough, Readable } = require("node:stream");

const {
  LocalDictationModelError,
  LocalDictationModelManager,
  managedModelPath,
} = require("../out/localDictationModel.js");

const payload = Buffer.from("verified-whisper-model-fixture");
const identity = {
  filename: "ggml-large-v3-turbo.bin",
  bytes: payload.length,
  sha1: crypto.createHash("sha1").update(payload).digest("hex"),
  url: "https://models.example.test/model.bin",
};
const created = [];

test.afterEach(() => {
  for (const directory of created.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function fixture(request, options = {}) {
  const homePath = fs.mkdtempSync(path.join(os.tmpdir(), "dshmux-model-test-"));
  created.push(homePath);
  const calls = [];
  const runtime = {
    stat: (filePath) => fs.promises.stat(filePath),
    read: (filePath) => fs.createReadStream(filePath),
    mkdir: (directory) => fs.promises.mkdir(directory, { recursive: true }).then(() => undefined),
    async open(filePath) {
      const handle = await fs.promises.open(filePath, "w");
      if (!options.maxWriteBytes) return handle;
      return {
        write: (data, offset = 0, length = data.length) =>
          handle.write(data, offset, Math.min(length, options.maxWriteBytes)),
        sync: () => handle.sync(),
        close: () => handle.close(),
      };
    },
    unlink: (filePath) => fs.promises.unlink(filePath),
    rename: (from, to) => fs.promises.rename(from, to),
    async request(url, signal) {
      calls.push(url.toString());
      return request(url, signal, calls.length);
    },
  };
  const modelPath = managedModelPath(homePath, identity);
  const partialPath = `${modelPath}.part`;
  return {
    calls,
    homePath,
    manager: new LocalDictationModelManager({ homePath, identity, runtime }),
    modelPath,
    partialPath,
  };
}

function response(statusCode, body = [], options = {}) {
  return {
    statusCode,
    location: options.location,
    contentLength: options.contentLength,
    body: Readable.from(body),
  };
}

test("managed path is the same home-relative cache contract on Windows and macOS", () => {
  assert.equal(
    managedModelPath("C:\\Users\\Ada", identity),
    path.join("C:\\Users\\Ada", ".dshmux", "models", identity.filename)
  );
  assert.equal(
    managedModelPath("/Users/ada", identity),
    path.join("/Users/ada", ".dshmux", "models", identity.filename)
  );
});

test("a verified canonical model is reused without any network request", async () => {
  const item = fixture(() => { throw new Error("network must remain unused"); });
  fs.mkdirSync(path.dirname(item.modelPath), { recursive: true });
  fs.writeFileSync(item.modelPath, payload);
  assert.equal(await item.manager.ensure(), item.modelPath);
  assert.equal(await item.manager.ensure(), item.modelPath);
  assert.deepEqual(item.calls, []);
});

test("HTTPS redirects stream into a sibling partial and atomically publish after verification", async () => {
  const item = fixture((_url, _signal, call) => call === 1
    ? response(302, [], { location: "/cdn/model.bin" })
    : response(200, [payload.subarray(0, 8), payload.subarray(8)], { contentLength: payload.length }));
  const progress = [];
  assert.equal(await item.manager.ensure((done, total) => progress.push([done, total])), item.modelPath);
  assert.equal(item.calls.length, 2);
  assert.equal(item.calls[1], "https://models.example.test/cdn/model.bin");
  assert.deepEqual(fs.readFileSync(item.modelPath), payload);
  assert.equal(fs.existsSync(item.partialPath), false);
  assert.deepEqual(progress.at(-1), [payload.length, payload.length]);
});

test("partial filesystem writes are completed before publishing", async () => {
  const item = fixture(
    () => response(200, [payload], { contentLength: payload.length }),
    { maxWriteBytes: 3 }
  );
  await item.manager.ensure();
  assert.deepEqual(fs.readFileSync(item.modelPath), payload);
});

for (const [name, downloaded, options, message] of [
  ["overflow", Buffer.concat([payload, Buffer.from("x")]), {}, "exceeded"],
  ["short download", payload.subarray(0, -1), {}, "checksum"],
  ["checksum mismatch", Buffer.alloc(payload.length, 1), {}, "checksum"],
  ["invalid Content-Length", payload, { contentLength: payload.length + 1 }, "size"],
]) {
  test(`${name} fails safely and removes the partial file`, async () => {
    const item = fixture(() => response(200, [downloaded], options));
    await assert.rejects(
      item.manager.ensure(),
      (error) => error instanceof LocalDictationModelError && error.message.includes(message)
    );
    assert.equal(fs.existsSync(item.modelPath), false);
    assert.equal(fs.existsSync(item.partialPath), false);
  });
}

test("cancellation aborts one in-flight setup and removes the partial file", async () => {
  let stream;
  const item = fixture((_url, signal) => {
    stream = new PassThrough();
    signal.addEventListener("abort", () => stream.destroy(new Error("aborted")), { once: true });
    queueMicrotask(() => stream.write(payload.subarray(0, 4)));
    return { statusCode: 200, body: stream };
  });
  await assert.rejects(
    item.manager.ensure(() => item.manager.cancel()),
    (error) => error instanceof LocalDictationModelError && error.cancelled
  );
  assert.equal(fs.existsSync(item.modelPath), false);
  assert.equal(fs.existsSync(item.partialPath), false);
});

test("concurrent callers share one download", async () => {
  let stream;
  const item = fixture(() => {
    stream = new PassThrough();
    queueMicrotask(() => stream.end(payload));
    return { statusCode: 200, contentLength: payload.length, body: stream };
  });
  const first = item.manager.ensure();
  const second = item.manager.ensure();
  assert.equal(first, second);
  assert.deepEqual(await Promise.all([first, second]), [item.modelPath, item.modelPath]);
  assert.equal(item.calls.length, 1);
});

test("non-HTTPS redirect is rejected before the redirected request", async () => {
  const item = fixture(() => response(302, [], { location: "http://unsafe.example/model.bin" }));
  await assert.rejects(item.manager.ensure(), /requires HTTPS/);
  assert.equal(item.calls.length, 1);
});

test("a failed replacement leaves an incompatible canonical file untouched", async () => {
  const item = fixture(() => response(500));
  const existing = Buffer.from("old-incompatible-model");
  fs.mkdirSync(path.dirname(item.modelPath), { recursive: true });
  fs.writeFileSync(item.modelPath, existing);
  await assert.rejects(item.manager.ensure(), /HTTP 500/);
  assert.deepEqual(fs.readFileSync(item.modelPath), existing);
  assert.equal(fs.existsSync(item.partialPath), false);
});
