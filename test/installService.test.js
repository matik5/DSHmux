// T10/T12 (04-install R5 + R7): the DSHmux setup terminal — every setup
// action opens the SAME terminal before any dialog. R5: steps are announced
// by auto-echoed printf lines. R7 (user decision 2026-09-05): the primary
// new-clone flow is confirmed ONCE (one modal listing every command) and
// then auto-runs as a single &&-chained send; the R2 flow and the guidance
// paths stay prefill-only. Grep invariant: the only `sendText(..., true)`
// lines in installService.ts are the fixed printf echo and the single
// `join(" && ")` chain send.
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

// --- Mock the virtual `vscode` module (only exists in the extension host). ---
let createdTerminals = [];
let showInfoScript = []; // next return values for showInformationMessage
let quickPickScript = []; // next return values for showQuickPick
let openDialogScript = []; // next return values for showOpenDialog
let warningCalls = [];

function makeTerminal(name) {
  return {
    name,
    shown: 0,
    sends: [],
    show() {
      this.shown += 1;
    },
    sendText(text, addNewLine) {
      this.sends.push({ text, addNewLine: addNewLine === true });
    },
    dispose() {},
  };
}

const fakeVscode = {
  Uri: {
    parse: (s) => ({ toString: () => s, fsPath: s }),
    file: (p) => ({ fsPath: p, toString: () => "file://" + p }),
  },
  env: {
    language: "en",
    remoteName: undefined,
    openExternal: async () => {},
    clipboard: { writeText: async () => {} },
  },
  window: {
    createTerminal: (opts) => {
      const term = makeTerminal(typeof opts === "string" ? opts : opts?.name);
      createdTerminals.push(term);
      return term;
    },
    showInformationMessage: async (msg, opts, ..._items) => {
      infoCalls.push(msg);
      // Only modal confirm dialogs consume the script; plain info toasts
      // (e.g. the "prefilled" notice) are ignored.
      if (opts && typeof opts === "object" && opts.modal === true) {
        modalCalls += 1;
        return showInfoScript.length > 0 ? showInfoScript.shift() : undefined;
      }
      return undefined;
    },
    showWarningMessage: async (msg) => {
      warningCalls.push(msg);
      return undefined;
    },
    showQuickPick: async (items) => {
      pickItems = items;
      return quickPickScript.length > 0 ? quickPickScript.shift() : undefined;
    },
    showOpenDialog: async () => {
      return openDialogScript.length > 0 ? openDialogScript.shift() : undefined;
    },
  },
  workspace: {
    getConfiguration: () => ({ get: (_k, dflt) => dflt, update: async () => {} }),
  },
  ConfigurationTarget: { Global: 1, Workspace: 2 },
};
let infoCalls = [];
let modalCalls = 0;
let pickItems = undefined;

const originalLoad = Module._load;
Module._load = function (request, _parent, _isMain) {
  if (request === "vscode") return fakeVscode;
  return originalLoad.apply(this, arguments);
};

// --- Fresh installService instance per test (module-level terminal cache). ---
function freshInstallService() {
  const p = require.resolve("../out/installService.js");
  delete require.cache[p];
  createdTerminals = [];
  showInfoScript = [];
  quickPickScript = [];
  openDialogScript = [];
  warningCalls = [];
  infoCalls = [];
  modalCalls = 0;
  pickItems = undefined;
  return require(p);
}

const SRC = fs.readFileSync(path.join(__dirname, "..", "src", "installService.ts"), "utf8");

test("getSetupTerminal: created once, same instance reused, shown on every call", () => {
  const svc = freshInstallService();
  const t1 = svc.getSetupTerminal();
  const t2 = svc.getSetupTerminal();
  assert.strictEqual(t1, t2, "same terminal instance on every call");
  assert.strictEqual(createdTerminals.length, 1, "exactly one terminal created");
  assert.strictEqual(createdTerminals[0].name, "DSHmux setup");
  assert.strictEqual(t1.shown, 2, "shown on every call");
});

test("prefillTerminal: echo line (true) BEFORE command prefill (false), with step + purpose", () => {
  const svc = freshInstallService();
  svc.prefillTerminal("pnpm build", "Build DSH", 4, 4);
  const term = createdTerminals[0];
  assert.strictEqual(createdTerminals.length, 1, "prefill routes through the shared terminal");
  assert.strictEqual(term.sends.length, 2, "exactly two sends: echo, then prefill");
  assert.ok(term.sends[0].addNewLine, "echo line is auto-executed");
  assert.strictEqual(term.sends[1].addNewLine, false, "install command is prefilled, never executed");
  assert.ok(term.sends[0].text.startsWith("printf '%s\\n' '"), "echo is the fixed printf form");
  assert.ok(term.sends[0].text.includes("Step 4 of 4"), "echo carries the step number");
  assert.ok(term.sends[0].text.includes("Build DSH"), "echo carries the purpose");
  assert.ok(term.sends[0].text.includes("pnpm build"), "echo carries the exact command");
  assert.strictEqual(term.sends[1].text, "pnpm build", "prefilled text is the exact command");
});

test("prefillTerminal without step info: no 'Step' segment in the echo", () => {
  const svc = freshInstallService();
  svc.prefillTerminal("npm i -g @deepseek-ai/dsh@0.1.2-rc.1", "Install DSH globally with npm");
  const term = createdTerminals[0];
  assert.ok(!term.sends[0].text.includes("Step"), "no step number when not given");
  assert.strictEqual(term.sends.length, 2);
});

test("echoSetupLine: shell metacharacters cannot break out of the quoted argument", () => {
  const svc = freshInstallService();
  const term = svc.getSetupTerminal();
  svc.echoSetupLine(term, "bad 'quote `tick` back\\slash dollar $PATH; rm -rf /");
  const echo = term.sends[0].text;
  assert.ok(echo.startsWith("printf '%s\\n' '"), "fixed printf form");
  const m = /^printf '%s\\n' '(.*)'$/.exec(echo);
  assert.ok(m, "echo is exactly the printf wrapper around one quoted argument");
  const arg = m[1];
  assert.ok(!arg.includes("'"), "no single quote survives inside the argument");
  assert.ok(!arg.includes("`"), "no backtick survives");
  assert.ok(!arg.includes("$"), "no dollar survives");
  assert.ok(!arg.includes("\\"), "no backslash survives");
});

test("guidance path: announces in the setup terminal BEFORE showing the message", async () => {
  const svc = freshInstallService();
  // Return undefined from the message (no "Open page" click).
  await svc.runPnpmInstallGuidance();
  assert.strictEqual(createdTerminals.length, 1, "guidance opens the setup terminal");
  const echo = createdTerminals[0].sends[0];
  assert.ok(echo.addNewLine, "guidance announcement is an auto-echo line");
  assert.ok(echo.text.includes("pnpm"), "echo names the missing tool");
  assert.ok(echo.text.includes("pnpm.io/installation"), "echo points to the official page");
  assert.ok(infoCalls.some((m) => m.includes("pnpm")), "the message is still shown");
});

test("primary flow (new clone): ONE modal, 4 echoes, then ONE &&-chained auto-run (R7)", async () => {
  const svc = freshInstallService();
  const run = "Run in terminal";
  quickPickScript.push({ label: "new", action: "new" });
  openDialogScript.push([fakeVscode.Uri.file("/tmp/dshmux-test")]);
  // R7: exactly ONE modal confirms the whole plan.
  showInfoScript.push(run);

  const report = {
    state: "dsh-missing",
    git: { available: true, version: "git 2.45" },
    pnpm: { available: true, version: "10.0" },
    warnings: [],
  };
  await svc.runPrimaryInstallFlow(report);

  assert.strictEqual(modalCalls, 1, "exactly one confirmation modal (not one per step)");
  assert.strictEqual(createdTerminals.length, 1, "the whole flow reuses ONE terminal");
  const sends = createdTerminals[0].sends;
  // 4 echo lines (printf, auto-executed) + exactly one chained plan line.
  assert.strictEqual(sends.length, 5, "4 echoes + one chained auto-run send");
  for (let i = 0; i < 4; i++) {
    assert.ok(sends[i].addNewLine, `echo ${i + 1} auto-executed`);
    assert.ok(sends[i].text.startsWith("printf '%s\\n' '"), `echo ${i + 1} is the fixed printf form`);
    assert.ok(sends[i].text.includes(`Step ${i + 1} of 4`), `echo ${i + 1} is numbered`);
  }
  const chain = sends[4];
  assert.ok(chain.addNewLine, "the chained plan line is auto-executed");
  // The clone target must track the platform-aware joinPath in
  // buildSourceClonePlan (backslash separator on win32, quoted for cmd).
  const target =
    process.platform === "win32"
      ? "/tmp/dshmux-test\\deepseek-harness"
      : "/tmp/dshmux-test/deepseek-harness";
  const plan = [
    `git clone --branch matik/dsh-patches-0.1.5-rc.2 https://github.com/matik5/deepseek-harness.git "${target}"`,
    `cd "${target}"`,
    "pnpm install",
    "pnpm build",
  ];
  assert.strictEqual(chain.text, plan.join(" && "), "all four commands, in order, &&-chained");
  // The single modal listed every command verbatim.
  const modal = infoCalls.find((m) => m.startsWith("Install DSH in the DSHmux setup terminal"));
  assert.ok(modal, "one confirmation modal was shown");
  for (const c of plan) {
    assert.ok(modal.includes(c), `modal lists: ${c.slice(0, 40)}…`);
  }
  assert.ok(infoCalls.some((m) => m.startsWith("Installing in the DSHmux setup terminal")), "end toast shown after the run starts");
});

test("primary flow with pnpm missing: guidance only — terminal opens, no clone commands", async () => {
  const svc = freshInstallService();
  const report = {
    state: "source-prerequisites-missing",
    git: { available: true, version: "git 2.45" },
    pnpm: { available: false },
    warnings: [],
  };
  await svc.runPrimaryInstallFlow(report);
  assert.strictEqual(createdTerminals.length, 1, "terminal opened before the guidance message");
  const echo = createdTerminals[0].sends[0];
  assert.ok(echo.addNewLine && echo.text.includes("pnpm.io/installation"));
  assert.strictEqual(createdTerminals[0].sends.length, 1, "no clone steps while pnpm is missing");
});

test("R2 alternative flow (npm): stays prefill-only — nothing auto-executed (R7 scope)", async () => {
  const svc = freshInstallService();
  quickPickScript.push({ label: "npm", command: "npm i -g @deepseek-ai/dsh@0.1.2-rc.1" });
  await svc.runAlternativeInstallFlow();
  assert.strictEqual(createdTerminals.length, 1, "the setup terminal opens for R2 too");
  const sends = createdTerminals[0].sends;
  assert.strictEqual(sends.length, 2, "echo + prefill, nothing else");
  assert.ok(sends[0].addNewLine && sends[0].text.startsWith("printf"), "echo is the fixed printf");
  assert.strictEqual(sends[1].text, "npm i -g @deepseek-ai/dsh@0.1.2-rc.1", "exact npm command");
  assert.strictEqual(sends[1].addNewLine, false, "R2 command is prefilled, never executed");
});

test("invariant: auto-executed sends are only printf echoes and R7 && chains (new-clone + update)", () => {
  const autoExecuted = SRC.split("\n").filter(
    (l) => /sendText\(/.test(l) && /,\s*true\)/.test(l)
  );
  assert.strictEqual(
    autoExecuted.length,
    3,
    "printf echo + new-clone && chain + update && chain"
  );
  assert.ok(
    autoExecuted.every((l) => l.includes("printf") || l.includes('join(" && ")')),
    "they are the fixed printf echo and the R7 && chain sends"
  );
  assert.ok(SRC.includes("terminal.sendText(command, false)"), "the R2 prefill stays false");
});
