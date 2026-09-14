"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const nls = JSON.parse(fs.readFileSync(path.join(root, "package.nls.json"), "utf8"));
const extensionSource = fs.readFileSync(path.join(root, "src", "extension.ts"), "utf8");
const commandsSource = fs.readFileSync(path.join(root, "src", "commands.ts"), "utf8");
const chromeSource = fs.readFileSync(path.join(root, "src", "chatChrome.ts"), "utf8");
const chromeCss = fs.readFileSync(path.join(root, "media", "chat-chrome.css"), "utf8");
const views = pkg.contributes?.views?.dshmux ?? [];
const configurationSections = Array.isArray(pkg.contributes?.configuration)
  ? pkg.contributes.configuration
  : [pkg.contributes?.configuration].filter(Boolean);

test("DSHmux contributes one chat-first webview and no launcher", () => {
  assert.deepEqual(views.map((view) => view.id), ["dshmux.chat"]);
  assert.equal(views[0].type, "webview");
  assert.equal(views[0].name, "%view.chat.name%");
  assert.equal(nls["view.chat.name"], "DSHmux");
  assert.equal(fs.existsSync(path.join(root, "src", "launcherView.ts")), false);
  assert.doesNotMatch(extensionSource, /DshLauncherView|dshmux\.view|launcher\?\.refresh/);
});

test("compact chrome is capped below the approved 44 CSS px budget", () => {
  const match = chromeCss.match(/--dshmux-header-height:\s*(\d+)px/);
  assert.ok(match, "header height variable missing");
  assert.ok(Number(match[1]) <= 44, `header is ${match[1]}px, expected <= 44px`);
  assert.match(chromeCss, /body\s*\{[^}]*padding-top:\s*var\(--dshmux-header-height\)/s);
  assert.match(chromeCss, /#root\s*\{[^}]*height:\s*100%\s*!important/s);
  assert.match(chromeSource, /dshmux-sessions/);
  assert.match(chromeSource, /dshmux-new-session/);
  assert.match(chromeSource, /dshmux-more/);
  const headerOrder = ["dshmux-sessions", "dshmux-new-session", "dshmux-current-title", "dshmux-more"]
    .map((id) => chromeSource.indexOf(`id="${id}"`));
  assert.deepEqual(headerOrder, [...headerOrder].sort((a, b) => a - b));
  const tabOrder = ["dshmux-pinned-tab", "dshmux-active-tab", "dshmux-archived-tab"]
    .map((id) => chromeSource.indexOf(`id="${id}"`));
  assert.deepEqual(tabOrder, [...tabOrder].sort((a, b) => a - b));
  assert.match(chromeSource, /id="dshmux-full-text" type="checkbox"/);
  assert.match(chromeSource, /id="dshmux-process-action"/);
  const overflowSource = chromeSource.slice(
    chromeSource.indexOf('id="dshmux-overflow"'),
    chromeSource.indexOf('id="dshmux-overlay"')
  );
  assert.ok(
    overflowSource.indexOf('id="dshmux-process-action"') > overflowSource.indexOf('id="dshmux-update-next"'),
    "process action must remain the final overflow action"
  );
});

test("activation registers the provider without forcing chat focus", () => {
  const registration = extensionSource.indexOf(
    "registerWebviewViewProvider(DshChatView.viewType, chatView"
  );
  assert.ok(registration >= 0, "chat provider registration missing");
  assert.equal(
    (extensionSource.match(/registerWebviewViewProvider\(/g) ?? []).length,
    1,
    "only one sidebar provider may remain"
  );
  assert.doesNotMatch(
    extensionSource,
    /\brevealChat\(\);/,
    "extension activation must let VS Code retain the selected sidebar view"
  );

  const startCommand = commandsSource.indexOf('registerCommand("dshmux.start"');
  const stopCommand = commandsSource.indexOf('registerCommand("dshmux.stop"', startCommand);
  const explicitStartSource = commandsSource.slice(startCommand, stopCommand);
  assert.ok(startCommand >= 0 && stopCommand > startCommand, "start command registration missing");
  assert.ok(
    explicitStartSource.indexOf("revealChat();") > explicitStartSource.indexOf("await manager.start("),
    "an explicit successful Start command must still reveal DSHmux"
  );
});

test("chat webview retains context and packaged media includes chrome assets", () => {
  assert.match(
    extensionSource,
    /registerWebviewViewProvider\(DshChatView\.viewType, chatView, \{[\s\S]*?retainContextWhenHidden: true/
  );
  assert.ok(pkg.files.includes("media/**"));
  assert.deepEqual(pkg.dependencies, { ws: "^8.21.3" }, "UI feature must add no runtime package");
  assert.match(extensionSource, /panels\.open\([\s\S]*?JSON\.stringify\(\{ sessionId \}\)/);
});

test("existing extension identity and host-safe configuration remain intact", () => {
  assert.equal(pkg.name, "dshmux");
  assert.equal(pkg.displayName, "DSHmux");
  assert.equal(pkg.publisher, "matik5");
  for (const command of pkg.contributes?.commands ?? []) {
    assert.match(command.command, /^dshmux\./);
    assert.equal(command.category, "DSHmux");
  }
  const setting = configurationSections
    .find((section) => section.title === "DSHmux")
    ?.properties?.["dshmux.dshPath"];
  assert.equal(setting?.scope, "machine-overridable");
  assert.deepEqual(pkg.extensionKind, ["workspace"]);
  assert.ok(pkg.capabilities?.untrustedWorkspaces?.restrictedConfigurations?.includes("dshmux.dshPath"));
});

test("settings place feedback sounds immediately above experimental dictation", () => {
  assert.deepEqual(
    configurationSections.map((section) => [section.title, section.order]),
    [
      ["DSHmux", 10],
      ["%configuration.feedbackSounds.title%", 20],
      ["%configuration.experimental.title%", 30],
    ]
  );
  assert.deepEqual(
    Object.keys(configurationSections[1].properties),
    ["dshmux.completionSound", "dshmux.soundStart", "dshmux.soundDone", "dshmux.soundAsk"]
  );
  assert.deepEqual(
    Object.keys(configurationSections[2].properties),
    [
      "dshmux.experimental.localDictation.enabled",
      "dshmux.experimental.localDictation.language",
      "dshmux.experimental.localDictation.hostPath",
      "dshmux.experimental.localDictation.audioDevice",
    ]
  );
  assert.equal(nls["configuration.feedbackSounds.title"], "DSHmux: Feedback Sounds");
  assert.equal(nls["configuration.experimental.title"], "DSHmux: Experimental");
  assert.match(nls["setting.localDictation.enabled.description"], /1\.6 GB/);
});

test("feature release manifests agree on version 0.4.8", () => {
  assert.equal(pkg.version, "0.4.8");
  assert.equal(lock.version, "0.4.8");
  assert.equal(lock.packages?.[""]?.version, "0.4.8");
});
