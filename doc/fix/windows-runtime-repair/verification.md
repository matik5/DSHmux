# Windows runtime repair — Verification

**Date**: 2026-09-13
**Result**: PASS

## Coverage

| Risk | Evidence |
|---|---|
| Program Files Node falsely missing | Real Windows Doctor reports `C:\Program Files\nodejs\node.exe`, `v26.8.2`, runnable and supported |
| Doctor/installer npm disagreement | Both resolve shell-free `node.exe <APPDATA npm-cli.js>`; real probe reports npm `12.0.2` |
| Managed DSH does not install | Isolated real Windows install produced and verified `@deepseek-ai/dsh` `0.1.5-rc.2` |
| Node installed after an earlier miss | Regression proves misses are not cached and the next resolution finds Node |
| Repair leaves launcher stopped | Regression proves a Doctor refresh transition to `ready` invokes one start |
| macOS/POSIX regression | Existing minimal macOS PATH test passes; POSIX npm remains `npm`, structured argv, `shell: false` |
| Install-choice UX | Tests require global + shown-location + Change actions and prove no explicit Cancel is passed |
| Project destination | Exact default is `<workspace>/.dshmux/managed-dsh/0.1.5-rc.2` |
| Changed destination | Exact target is `<selected>/deepseek-harness`; official tag, revision and pnpm 11.7.0 are pinned |

## Executed checks

- `npm run compile`: PASS.
- `npm test`: PASS, 212/212 tests.
- Real Windows Doctor/toolchain smoke: PASS.
- Real isolated Windows managed npm install and exact `dsh --version` validation: PASS.
- VSIX packaging and forced local install: PASS; `matik5.dshmux@0.4.7`.
- `git diff --check`: PASS (Git emitted only the repository's normal LF/CRLF conversion notices).

## Notes

- `npm ci` reported three dependency audit findings and blocked install scripts
  for two development-time packages. These are pre-existing dependency/tooling
  notices and did not affect compilation or tests.
- Existing child-process tests still emit Node's warning for legacy Windows
  `shell: true` DSH shim discovery. The repaired Node/npm managed path is
  shell-free.

## Conclusion

The reported Windows Node/npm detection and managed DSH install failures are
fixed, the repair flow reaches ready/start, and the POSIX/macOS behavior remains
covered and unchanged.
