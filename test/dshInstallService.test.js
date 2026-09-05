// Unit tests for src/dshInstallService.ts (04-install R2/R3): exact command
// strings, quoting, checkout validation matrix. No real processes — probe
// stubs only.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TESTED_SOURCE_REPO,
  TESTED_SOURCE_BRANCH,
  TESTED_SOURCE_REVISION,
  NODE_DOWNLOAD_URL,
  GIT_DOWNLOAD_URL,
  PNPM_INSTALL_URL,
  buildSourceClonePlan,
  buildNpmPlan,
  buildNpxPlan,
  checkExistingCheckout,
} from "../out/dshInstallService.js";
import { TESTED_DSH_VERSION } from "../out/versionCheck.js";
import { CHECKOUT_BIN_REL } from "../out/serverManager.js";

test("tested source constants are frozen", () => {
  assert.equal(TESTED_SOURCE_REPO, "https://github.com/matik5/deepseek-harness.git");
  assert.equal(TESTED_SOURCE_BRANCH, "matik/dsh-patches-0.1.2-rc.1");
  assert.equal(TESTED_SOURCE_REVISION, "07bca197e2");
});

test("prerequisite download URLs point at official pages", () => {
  assert.equal(NODE_DOWNLOAD_URL, "https://nodejs.org/en/download");
  assert.equal(GIT_DOWNLOAD_URL, "https://git-scm.com/downloads");
  assert.equal(PNPM_INSTALL_URL, "https://pnpm.io/installation");
});

test("clone plan (darwin): 4 steps in order, exact strings, spaces quoted", () => {
  const plan = buildSourceClonePlan("/Users/me/My Projects", "darwin");
  assert.equal(plan.length, 4);
  const target = "/Users/me/My Projects/deepseek-harness";
  assert.equal(
    plan[0].command,
    `git clone --branch ${TESTED_SOURCE_BRANCH} ${TESTED_SOURCE_REPO} "${target}"`
  );
  assert.equal(plan[1].command, `cd "${target}"`);
  assert.equal(plan[2].command, "pnpm install");
  assert.equal(plan[3].command, "pnpm build"); // build is always last
  assert.equal(plan[0].label, "install.cloneStep1");
  assert.equal(plan[0].purpose, "install.cloneStep1.purpose");
  // Every step carries an i18n label + purpose key.
  for (const step of plan) {
    assert.match(step.label, /^install\./);
    assert.match(step.purpose, /^install\./);
  }
});

test("clone plan (darwin): trailing separator on parentDir is not doubled", () => {
  const plan = buildSourceClonePlan("/Users/me/Projects/", "darwin");
  assert.equal(plan[0].command, `git clone --branch ${TESTED_SOURCE_BRANCH} ${TESTED_SOURCE_REPO} "/Users/me/Projects/deepseek-harness"`);
});

test("clone plan (win32): backslash join, double-quoted, backslashes unescaped", () => {
  const plan = buildSourceClonePlan("C:\\Users\\me\\Projects", "win32");
  const target = "C:\\Users\\me\\Projects\\deepseek-harness";
  assert.equal(
    plan[0].command,
    `git clone --branch ${TESTED_SOURCE_BRANCH} ${TESTED_SOURCE_REPO} "${target}"`
  );
  assert.equal(plan[1].command, `cd "${target}"`);
  assert.equal(plan[2].command, "pnpm install");
  assert.equal(plan[3].command, "pnpm build");
});

test("npm plan pins the tested version, never latest/next", () => {
  const plan = buildNpmPlan();
  assert.equal(plan.command, `npm i -g @deepseek-ai/dsh@${TESTED_DSH_VERSION}`);
  assert.ok(plan.command.includes(`@deepseek-ai/dsh@${TESTED_DSH_VERSION}`));
  assert.ok(!plan.command.includes("latest"));
  assert.ok(!plan.command.includes("next"));
  assert.match(plan.label, /^install\./);
  assert.match(plan.purpose, /^install\./);
});

test("npx plan pins the tested version, never latest/next", () => {
  const plan = buildNpxPlan();
  assert.equal(plan.command, `npx -y @deepseek-ai/dsh@${TESTED_DSH_VERSION} --version`);
  assert.ok(!plan.command.includes("latest"));
  assert.ok(!plan.command.includes("next"));
});

/** Stub probe for checkout validation: scripted run results, map-backed exists. */
function checkoutProbe(overrides = {}, runTable = new Map(), existsEntries = []) {
  const existsMap = new Map(existsEntries);
  return {
    platform: "linux",
    exists: (p) => (existsMap.has(p) ? existsMap.get(p) : false),
    run: (cmd, args) => runTable.get(`${cmd} ${args.join(" ")}`) ?? { ok: false, stdout: "" },
    ...overrides,
  };
}

test("checkExistingCheckout: valid patched build", () => {
  const dir = "/home/me/dsh";
  const bin = `${dir}/${CHECKOUT_BIN_REL}`;
  const t = new Map();
  t.set(`/usr/local/bin/node ${bin} --version`, { ok: true, stdout: "0.1.2-rc.1" });
  t.set(`git -C ${dir} status --porcelain`, { ok: true, stdout: "" });
  t.set(`git -C ${dir} rev-parse --abbrev-ref HEAD`, {
    ok: true,
    stdout: `${TESTED_SOURCE_BRANCH}\n`,
  });
  const check = checkExistingCheckout(dir, "/usr/local/bin/node", checkoutProbe({}, t, [[bin, true]]));
  assert.equal(check.valid, true);
  assert.equal(check.binPath, bin);
  assert.equal(check.version, "0.1.2-rc.1");
  assert.equal(check.dirty, false);
  assert.equal(check.onPatchedBranch, true);
});

test("checkExistingCheckout: missing CLI entry (stale/unbuilt) → invalid", () => {
  const dir = "/home/me/dsh";
  const t = new Map();
  t.set(`git -C ${dir} status --porcelain`, { ok: true, stdout: "" });
  t.set(`git -C ${dir} rev-parse --abbrev-ref HEAD`, {
    ok: true,
    stdout: `${TESTED_SOURCE_BRANCH}\n`,
  });
  const check = checkExistingCheckout(dir, "/usr/local/bin/node", checkoutProbe({}, t, []));
  assert.equal(check.valid, false);
  assert.equal(check.binPath, null);
  assert.equal(check.version, null);
});

test("checkExistingCheckout: --version fails (broken build) → invalid", () => {
  const dir = "/home/me/dsh";
  const bin = `${dir}/${CHECKOUT_BIN_REL}`;
  const t = new Map();
  t.set(`/usr/local/bin/node ${bin} --version`, { ok: false, stdout: "" });
  const check = checkExistingCheckout(dir, "/usr/local/bin/node", checkoutProbe({}, t, [[bin, true]]));
  assert.equal(check.valid, false);
  assert.equal(check.version, null);
});

test("checkExistingCheckout: dirty repo is flagged but still valid when build works", () => {
  const dir = "/home/me/dsh";
  const bin = `${dir}/${CHECKOUT_BIN_REL}`;
  const t = new Map();
  t.set(`/usr/local/bin/node ${bin} --version`, { ok: true, stdout: "0.1.2-rc.1" });
  t.set(`git -C ${dir} status --porcelain`, { ok: true, stdout: " M src/foo.ts\n" });
  t.set(`git -C ${dir} rev-parse --abbrev-ref HEAD`, {
    ok: true,
    stdout: `${TESTED_SOURCE_BRANCH}\n`,
  });
  const check = checkExistingCheckout(dir, "/usr/local/bin/node", checkoutProbe({}, t, [[bin, true]]));
  assert.equal(check.valid, true); // dirty is a warning, never a blocker
  assert.equal(check.dirty, true);
  assert.equal(check.onPatchedBranch, true);
});

test("checkExistingCheckout: wrong branch → onPatchedBranch false, still valid", () => {
  const dir = "/home/me/dsh";
  const bin = `${dir}/${CHECKOUT_BIN_REL}`;
  const t = new Map();
  t.set(`/usr/local/bin/node ${bin} --version`, { ok: true, stdout: "0.1.2-rc.1" });
  t.set(`git -C ${dir} status --porcelain`, { ok: true, stdout: "" });
  t.set(`git -C ${dir} rev-parse --abbrev-ref HEAD`, { ok: true, stdout: "main\n" });
  const check = checkExistingCheckout(dir, "/usr/local/bin/node", checkoutProbe({}, t, [[bin, true]]));
  assert.equal(check.valid, true);
  assert.equal(check.onPatchedBranch, false);
});

test("checkExistingCheckout: non-git dir → onPatchedBranch null, dirty false", () => {
  const dir = "/home/me/not-a-repo";
  const bin = `${dir}/${CHECKOUT_BIN_REL}`;
  const t = new Map();
  t.set(`/usr/local/bin/node ${bin} --version`, { ok: true, stdout: "0.1.2-rc.1" });
  // both git commands fail (exit != 0)
  const check = checkExistingCheckout(dir, "/usr/local/bin/node", checkoutProbe({}, t, [[bin, true]]));
  assert.equal(check.valid, true);
  assert.equal(check.dirty, false);
  assert.equal(check.onPatchedBranch, null);
});

test("checkExistingCheckout (win32): CLI entry uses backslashes", () => {
  const dir = "C:\\proj\\dsh";
  const bin = `C:\\proj\\dsh\\apps\\cli\\lib\\bin.js`;
  const t = new Map();
  t.set(`C:\\nodejs\\node.exe ${bin} --version`, { ok: true, stdout: "0.1.2-rc.1" });
  const check = checkExistingCheckout(
    dir,
    "C:\\nodejs\\node.exe",
    checkoutProbe({ platform: "win32" }, t, [[bin, true]])
  );
  assert.equal(check.binPath, bin);
  assert.equal(check.valid, true);
});
