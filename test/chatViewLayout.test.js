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
const launcherSource = fs.readFileSync(path.join(here, "..", "src", "launcherView.ts"), "utf8");

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

test("launcher has one compact Doctor-owned dependency action and no notice panel", () => {
  assert.equal((launcherSource.match(/id="dependencyFix"/g) ?? []).length, 1);
  assert.match(launcherSource, /class="mini dependency-fix" id="dependencyFix"/);
  assert.match(launcherSource, /dependencyFix\.onclick[^\n]*open-doctor/);
  assert.doesNotMatch(launcherSource, /id="compatibilityWarning"|id="setupPanel"/);
  assert.doesNotMatch(launcherSource, /install-primary|install-alternative|install-source/);
});

test("activation reveals the DSHmux chat after registering its provider", () => {
  const registration = extensionSource.indexOf(
    "registerWebviewViewProvider(DshChatView.viewType, chatView"
  );
  const reveal = extensionSource.indexOf("revealChat();", registration);
  assert.ok(registration >= 0, "chat provider registration missing");
  assert.ok(reveal > registration, "chat must be revealed after provider registration");
});

test("update banner is one compact row: shared title plus separated channel chips", () => {
  const row = launcherSource.indexOf('<div class="upgrade-row" id="upgradeRow"');
  assert.ok(row >= 0, "upgrade row container missing");
  const rowEnd = launcherSource.indexOf("</div>", row);
  const title = launcherSource.indexOf('<span class="upgrade-title">', row);
  const latest = launcherSource.indexOf('id="upgradeLatest"', row);
  const next = launcherSource.indexOf('id="upgradeNext"', row);
  assert.ok(title > row && title < rowEnd, "row must carry the shared update title");
  assert.ok(latest > title && latest < rowEnd, "latest chip must sit in the same row");
  assert.ok(next > latest && next < rowEnd, "next chip must follow latest in the same row");
  assert.match(
    launcherSource,
    /button\.upgrade \{[^}]*width: auto/,
    "chips must be auto-width inline links, not full-width stacked buttons"
  );
});

test("chat webview retains its context while another sidebar tab is active", () => {
  assert.match(
    extensionSource,
    /registerWebviewViewProvider\(DshChatView\.viewType, chatView, \{[\s\S]*?retainContextWhenHidden: true/,
    "switching sidebar tabs must not destroy the DSH client and its live streams"
  );
});
