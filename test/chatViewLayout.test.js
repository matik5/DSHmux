// Layout guard for the side-panel chat view (2026-08-23): the DSH chat must be
// contributed as a webview in the `dshmux` side container, stacked
// BELOW the launcher (buttons / sessions / workspace indicator). Reading
// package.json keeps this vscode-free.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const here = __dirname;
const pkg = JSON.parse(fs.readFileSync(path.join(here, "..", "package.json"), "utf8"));
const nls = JSON.parse(fs.readFileSync(path.join(here, "..", "package.nls.json"), "utf8"));
const extensionSource = fs.readFileSync(path.join(here, "..", "src", "extension.ts"), "utf8");

const VIEWS = pkg.contributes?.views?.dshmux ?? [];

test("chat view is contributed in the dshmux side container", () => {
  const ids = VIEWS.map((v) => v.id);
  assert.ok(ids.includes("dshmux.chat"), "chat view id missing");
  const chat = VIEWS.find((v) => v.id === "dshmux.chat");
  assert.equal(chat.type, "webview");
});

test("chat view is stacked below the launcher (array order = top-to-bottom)", () => {
  const launcherIdx = VIEWS.findIndex((v) => v.id === "dshmux.view");
  const chatIdx = VIEWS.findIndex((v) => v.id === "dshmux.chat");
  assert.ok(launcherIdx !== -1, "launcher view id missing");
  assert.ok(chatIdx !== -1, "chat view id missing");
  assert.ok(
    chatIdx > launcherIdx,
    `chat view (index ${chatIdx}) must come after the launcher (index ${launcherIdx})`
  );
});

test("extension contributions use the DSHmux identity consistently", () => {
  assert.equal(pkg.name, "dshmux");
  assert.equal(pkg.displayName, "DSHmux");
  assert.equal(pkg.publisher, "matik5");
  assert.equal(pkg.repository?.url, "https://github.com/matik5/DSHmux.git");

  for (const command of pkg.contributes?.commands ?? []) {
    assert.match(command.command, /^dshmux\./);
    assert.equal(command.category, "DSHmux");
  }

  const properties = Object.keys(pkg.contributes?.configuration?.properties ?? {});
  assert.ok(properties.length > 0, "settings are missing");
  assert.ok(properties.every((key) => key.startsWith("dshmux.")));

  const container = pkg.contributes?.viewsContainers?.activitybar?.find(
    (item) => item.id === "dshmux"
  );
  assert.equal(container?.title, "DSHmux");
  assert.equal(VIEWS.find((view) => view.id === "dshmux.view")?.name, "DSHmux");
  assert.equal(nls["view.chat.name"], "DSHmux Chat");
});

test("custom DSH executable is host-overridable and safe in remote workspaces", () => {
  const setting = pkg.contributes?.configuration?.properties?.["dshmux.dshPath"];
  assert.equal(setting?.type, "string");
  assert.equal(setting?.default, "");
  assert.equal(setting?.scope, "machine-overridable");
  assert.equal(setting?.description, "%setting.dshPath.description%");
  assert.ok(nls["setting.dshPath.description"], "DSH path setting description missing");
  assert.deepEqual(pkg.extensionKind, ["workspace"], "DSH must run on the workspace/remote host");
  assert.ok(
    pkg.capabilities?.untrustedWorkspaces?.restrictedConfigurations?.includes("dshmux.dshPath"),
    "workspace overrides that execute a binary must require workspace trust"
  );
});

test("activation reveals the DSHmux chat after registering its provider", () => {
  const registration = extensionSource.indexOf(
    "registerWebviewViewProvider(DshChatView.viewType, chatView)"
  );
  const reveal = extensionSource.indexOf("revealChat();", registration);
  assert.ok(registration >= 0, "chat provider registration missing");
  assert.ok(reveal > registration, "chat must be revealed after provider registration");
});
