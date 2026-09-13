const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { repairProfileLinkCasing } = require('../out/profileLinkRepair.js');

test('repairs existing junction ESM identity without touching package files', { skip: process.platform !== 'win32' }, async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-link-test-'));
  const pkg = path.join(home, 'pkg');
  const modules = path.join(home, 'profiles', 'node_modules', '@fixture');
  fs.mkdirSync(pkg);
  fs.mkdirSync(modules, { recursive: true });
  fs.writeFileSync(path.join(pkg, 'scope.mjs'), 'export const key = Symbol("scope");');
  const good = path.join(modules, 'good');
  const bad = path.join(modules, 'bad');
  fs.symlinkSync(pkg, good, 'junction');
  fs.symlinkSync(pkg.replace(/^[A-Z]/, c => c.toLowerCase()), bad, 'junction');
  t.after(() => {
    fs.unlinkSync(good);
    fs.unlinkSync(bad);
    fs.rmSync(home, { recursive: true, force: true });
  });
  assert.equal(repairProfileLinkCasing(home, 'darwin'), 0);
  assert.equal(repairProfileLinkCasing(home), 1);
  assert.equal(repairProfileLinkCasing(home), 0);
  const a = await import(pathToFileURL(path.join(good, 'scope.mjs')));
  const b = await import(pathToFileURL(path.join(bad, 'scope.mjs')));
  assert.equal(a.key, b.key);
  assert.equal(fs.readFileSync(path.join(pkg, 'scope.mjs'), 'utf8'), 'export const key = Symbol("scope");');
});
