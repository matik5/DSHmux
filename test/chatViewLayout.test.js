"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const nls = JSON.parse(fs.readFileSync(path.join(root, "package.nls.json"), "utf8"));
const extensionSource = fs.readFileSync(path.join(root, "src", "extension.ts"), "utf8");
const chromeSource = fs.readFileSync(path.join(root, "src", "chatChrome.ts"), "utf8");
const chromeCss = fs.readFileSync(path.join(root, "media", "chat-chrome.css"), "utf8");
const views = pkg.contributes?.views?.dshmux ?? [];

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
});

test("the one provider is registered before the chat is revealed", () => {
  const registration = extensionSource.indexOf(
    "registerWebviewViewProvider(DshChatView.viewType, chatView"
  );
  const reveal = extensionSource.indexOf("revealChat();", registration);
  assert.ok(registration >= 0, "chat provider registration missing");
  assert.ok(reveal > registration, "chat must be revealed after provider registration");
  assert.equal(
    (extensionSource.match(/registerWebviewViewProvider\(/g) ?? []).length,
    1,
    "only one sidebar provider may remain"
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
  const setting = pkg.contributes?.configuration?.properties?.["dshmux.dshPath"];
  assert.equal(setting?.scope, "machine-overridable");
  assert.deepEqual(pkg.extensionKind, ["workspace"]);
  assert.ok(pkg.capabilities?.untrustedWorkspaces?.restrictedConfigurations?.includes("dshmux.dshPath"));
});
