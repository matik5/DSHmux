"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { dshWebviewPortMappings } = require("../out/webviewPortMapping.js");

test("maps an explicit DSH loopback port to the extension host", () => {
  assert.deepEqual(dshWebviewPortMappings("http://127.0.0.1:42873"), [
    { webviewPort: 42873, extensionHostPort: 42873 },
  ]);
  assert.deepEqual(dshWebviewPortMappings("http://localhost:40001"), [
    { webviewPort: 40001, extensionHostPort: 40001 },
  ]);
});

test("does not map malformed, non-loopback, or implicit ports", () => {
  assert.deepEqual(dshWebviewPortMappings(undefined), []);
  assert.deepEqual(dshWebviewPortMappings("not a url"), []);
  assert.deepEqual(dshWebviewPortMappings("https://example.com:42873"), []);
  assert.deepEqual(dshWebviewPortMappings("http://127.0.0.1"), []);
});
