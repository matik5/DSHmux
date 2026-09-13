# Windows runtime repair — Solution

**Date**: 2026-09-13

## 1. Goal

Make Node/npm detection, Doctor repair, managed DSH installation, and the
post-install launcher transition agree on Windows without changing the existing
POSIX/macOS launch behavior.

## 2. Facts

- `src/serverManager.ts:160-280` resolves Node from PATH and common locations,
  caches successful absolute paths, and also caches the bare `node.exe`/`node`
  fallback after a miss.
- `src/dshDoctor.ts:127-172,239-245` augments PATH with the resolved Node
  directory but probes npm independently as `npm --version` (with a shell on
  Windows).
- `src/dshDoctor.ts:226-230` also leaves the Windows Node probe on the probe's
  `shell: true` default. An absolute `C:\Program Files\nodejs\node.exe` command
  is then flattened by the shell and can be reported as missing.
- `src/dshInstallService.ts:102-136` independently reconstructs an npm launch.
  On Windows it accepts an adjacent `npm-cli.js` or `npm.exe`; it does not use
  the same command Doctor probed.
- `src/installService.ts:176-214` builds that second launch at install time and
  resolves Node again at verification time.
- `src/installService.ts:295-336` closes Doctor after a successful repair and
  only invokes the launcher refresh callback.
- `src/launcherView.ts:512-520,640-644` refreshes Doctor state but does not start
  DSH when a refreshed report becomes ready.
- `src/extension.ts:31-34` verifies the managed CLI for every start and retains
  configured/discovered DSH as fallback.
- The macOS/POSIX path in `buildManagedNpmLaunchSpec` currently launches `npm`
  with structured arguments and `shell: false`.
- Existing Windows tests exercise simulated path layouts, not the production
  Doctor-to-installer resolver contract or a miss followed by rediscovery.

Affected callers of the shared runtime discovery are Doctor, managed install
and validation, managed-path activation, DSH version probes, and JavaScript DSH
launches.

## 3. Gap

Doctor can falsely report a normal Program Files Node as missing, or report npm
available although the installer cannot construct its Windows launch. A cached
Node miss can survive Doctor's “Check again”. A successful repair also does not
complete the user-visible ready/start flow.
The POSIX path is already structurally safe and must remain unchanged.

## 4. Call-site audit

| Changed contract | Call site | Classification |
|---|---|---|
| Node resolution gains cache bypass and no longer caches misses | `spawnSpec`, DSH version/start probes | Compatible; defaults retain cached successful discovery |
| Same | Doctor and managed installer | Adapt: request fresh discovery so repair sees newly installed runtimes |
| npm launch resolution becomes reusable independently of install args | Doctor | Adapt: probe the exact resolved launch |
| Same | managed installer | Adapt: append install argv to the same resolved prefix |
| Doctor success callback becomes awaitable and reports fresh readiness | `src/extension.ts` | Compatible after async closure update |
| launcher Doctor refresh may start after transition to ready | `DshLauncherView.refresh(true)` | Compatible; guarded by stopped/not-running state |

No POSIX caller depends on the Windows npm candidate search. The POSIX launch
continues to use `npm`, structured argv, and `shell: false`.

## 5. Tasks

1. Add a reusable npm launch resolver and use it for both Doctor and install.
2. Make Doctor/installer Node discovery fresh and stop caching misses.
3. Complete repair by rechecking Doctor and resuming launcher start when ready.
4. Add regressions for Windows npm layouts, resolver agreement, cache refresh,
   and post-repair start; retain explicit POSIX/macOS assertions.
5. Compile, run the complete test suite, and record verification.

## 6. Approved install-location UX amendment

- Keep two install choices: pinned global npm, or project-specific managed npm.
- Project-specific default is
  `<workspace>/.dshmux/managed-dsh/0.1.5-rc.2`.
- Do not pass an explicit Cancel item; VS Code supplies it.
- **Change…** selects a parent and changes the second choice into a normal
  `<parent>/deepseek-harness` checkout, with no `.dshmux` segment.
- Clone the official tested tag, invoke the upstream-pinned pnpm 11.7.0 through
  the resolved npm launcher, build, verify the source CLI, and remember it in
  workspace state.
- Retain the previous globalStorage managed CLI as a read-only fallback.
