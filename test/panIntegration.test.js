"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {PanIntegration} = require("../out/panIntegration.js");

function fixture() {
  const calls = [];
  let serial = 0;
  const factory = kind => () => {
    const id = ++serial;
    calls.push([kind, "create", id]);
    return {start: root => calls.push([kind, "start", id, root]),
      dispose: () => calls.push([kind, "dispose", id])};
  };
  return {calls, pan: new PanIntegration(factory("lifecycle"), factory("questions"))};
}

test("PAN is disabled by default and disabled/stopped windows create no adapters", () => {
  const setting = require("../package.json").contributes.configuration.properties["dshmux.panEnabled"];
  assert.equal(setting.default, false);
  const {calls, pan} = fixture();
  pan.sync(setting.default, true, "/project");
  pan.sync(true, false, "/project");
  assert.deepEqual(calls, []);
  const source = fs.readFileSync(require.resolve("../src/extension.ts"), "utf8");
  assert.match(source, /dshmuxConfiguration\("panEnabled", false\)/);
  assert.match(source, /manager\.on\("state", syncPan\)/);
  assert.match(source, /\["panEnabled", "panTokenFile", "panMailboxKeyFile"\]/);
});

test("runtime enable, workspace/config change, disable and DSH stop dispose both flows", () => {
  const {calls, pan} = fixture();
  pan.sync(true, true, "/first");
  assert.deepEqual(calls.slice(0, 4), [
    ["lifecycle", "create", 1], ["questions", "create", 2],
    ["lifecycle", "start", 1, "/first"], ["questions", "start", 2, undefined]
  ]);
  pan.sync(true, true, "/second");
  assert.deepEqual(calls.slice(4, 6), [["lifecycle", "dispose", 1], ["questions", "dispose", 2]]);
  assert.deepEqual(calls[8], ["lifecycle", "start", 3, "/second"]);
  pan.sync(false, true, "/second");
  assert.deepEqual(calls.slice(-2), [["lifecycle", "dispose", 3], ["questions", "dispose", 4]]);
  const count = calls.length;
  pan.sync(false, true, "/third");
  assert.equal(calls.length, count);
  pan.sync(true, true, "/third");
  pan.sync(true, false, "/third");
  assert.deepEqual(calls.slice(-2), [["lifecycle", "dispose", 5], ["questions", "dispose", 6]]);
  pan.dispose();
});
