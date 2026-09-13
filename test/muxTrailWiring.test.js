// Production wiring guard: both embedded chat surfaces must load the same
// Mux Trail runtime and pass a visible-session scope to document assembly.
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

function source(name) {
  return fs.readFileSync(path.join(__dirname, "..", "src", name), "utf8");
}

test("side-panel chat wires Mux Trail script, strings, and current session", () => {
  const text = source("dshChatView.ts");
  assert.match(text, /media", "mux-trail\.js"/);
  assert.match(text, /muxTrailJs:\s*gameJs|muxTrailJs:\s*muxTrailJs|muxTrailJs,/);
  assert.match(text, /muxTrailStrings:\s*muxTrailStrings\(\)/);
  assert.match(text, /visibleSessionId:\s*this\.currentSessionId/);
});

test("editor-tab panel wires Mux Trail script, strings, and bound session", () => {
  const text = source("dshPanel.ts");
  assert.match(text, /media", "mux-trail\.js"/);
  assert.match(text, /muxTrailJs:\s*gameJs|muxTrailJs:\s*muxTrailJs|muxTrailJs,/);
  assert.match(text, /muxTrailStrings:\s*muxTrailStrings\(\)/);
  assert.match(text, /visibleSessionId:\s*this\.sessionId/);
});

test("VSIX manifest already includes every media asset", () => {
  const manifest = require("../package.json");
  assert.ok(manifest.files.includes("media/**"));
  assert.ok(fs.existsSync(path.join(__dirname, "..", "media", "mux-trail.js")));
});
