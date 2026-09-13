# 05-managed-dependencies — Discussion

**Date**: 2026-09-13

**User report**: DSHmux 0.4.6 on Windows produces a noisy, duplicated setup
panel when DSH is not installed. The desired 0.4.7 release must use official
DeepSeek Harness 0.1.5-rc.2 rather than the `matik5` patch branch, move repair
into DSH Doctor, and replace the setup panel/compatibility notices with one
small **Missing deps · Fix** action that opens Doctor.

## Code facts

### Official DSH 0.1.5-rc.2

- The local upstream mirror has official tag `dsh-v0.1.5-rc.2` at commit
  `fb2c4b9e698e30edb738bca4cf0618587db7d203` in
  `https://github.com/deepseek-ai/deepseek-harness.git`.
- The tagged root `package.json` declares version `0.1.5-rc.2`, package manager
  `pnpm@11.7.0`, and Node engine `^22.19.0 || >=24.0.0`.
- The official CLI package is `@deepseek-ai/dsh@0.1.5-rc.2`; its binary is
  `lib/bin.js`. The official README presents `npx @deepseek-ai/dsh web` as the
  normal package route and an official-repository clone plus `pnpm install` /
  `pnpm run build` as the source route.
- Therefore Node is a real DSH runtime dependency, but the 0.4.6 launcher text
  saying “Node.js 20 or newer” is incorrect for the tested DSH version.

### Current source dependency

- `src/dshInstallService.ts` hard-codes the fork
  `https://github.com/matik5/deepseek-harness.git`, branch
  `matik/dsh-patches-0.1.5-rc.2`, and revision `5f54644c4f`.
- `buildSourceClonePlan`, `buildSourceUpdatePlan`,
  `recommendedSourceBranchExists`, checkout validation, Doctor source rows,
  launcher source links, strings, and tests all encode the fork/patched-source
  contract.
- `buildNpmPlan` already pins the official package to `TESTED_DSH_VERSION`, but
  0.4.6 labels it as a secondary, reduced-compatibility alternative.

### Current Doctor classification

- `runDoctor` probes Node before DSH and returns `node-missing` before it can
  classify a missing DSH. Missing Git/pnpm can turn missing DSH into
  `source-prerequisites-missing` because patched source is the primary route.
- `git` and `pnpm` are also shown as warnings on otherwise working machines,
  even though neither is needed to run an npm-installed DSH.
- Doctor is read-only today. The install service can run the four-step source
  clone after confirmation, but npm/npx installation is prefill-only.
- The existing resolver already discovers global npm shims and npx cache paths
  on Windows, macOS, and Linux.

### Current launcher noise and duplication

- `src/launcherView.ts` renders a large setup panel with a summary, warnings,
  prerequisite links, two install buttons, Check again, and a source link.
- Ready but untested versions receive a separate two-line compatibility
  warning in the header.
- The initial missing-tool button has an ID (`setupNode`, `setupGit`, or
  `setupPnpm`). `applyDoctor` removes buttons by those IDs, but dynamically
  recreated buttons are not assigned IDs. Each later Doctor message therefore
  inserts another button that future refreshes cannot remove. This explains
  the duplicated Node lines in the Windows screenshot.
- A stale `dshmux.dshPath` is correctly ignored for discovery, but its warning
  is currently promoted into the noisy launcher setup panel.

## Proposed product direction

- Make the pinned official npm package the default managed installation. It
  removes Git, pnpm, the fork, and source-build prerequisites from ordinary
  setup.
- Install DSH into extension-managed storage rather than globally. This avoids
  administrator rights and global npm-prefix/PATH ambiguity, gives Doctor a
  deterministic binary path, and allows a verified, repeatable repair.
- Keep official source checkout support only as an advanced/manual option,
  pinned to the official tag and commit; do not make it a launcher dependency.
- Keep Node as a Doctor prerequisite because DSH genuinely needs it, validate
  the correct engine range, and do not advertise Node 20. Do not treat Git or
  pnpm as runtime dependencies for the managed npm route.
- Reduce the launcher to one compact dependency action. Doctor owns details,
  confirmation, install progress, verification, and retry.

## Scope decisions needing approval

1. The recommended automated repair installs the pinned DSH npm package into
   VS Code extension global storage (workspace-host local), not global npm.
2. Doctor installs/repairs DSH after explicit confirmation. It does not install
   Node or invoke an OS package manager; when Node is absent/too old it gives
   one accurate prerequisite action for Node 22.19+ or 24+.
3. Compatibility becomes Doctor detail only. A working non-tested DSH remains
   usable and does not create a launcher banner.
