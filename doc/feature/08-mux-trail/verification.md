# Mux Trail — Verification

**Date**: 2026-09-13

**Result**: ✅ feature requirements verified; no feature-owned outstanding task

## RTTM close-out

| Requirement | Evidence | Result |
|---|---|---|
| R1 — voluntary 3 s affordance | `createOfferGate` and lazy DOM in `media/mux-trail.js:152-203,235-366`; fake-clock and controller tests in `test/muxTrail.test.js` | ✅ |
| R2 — game rules | Pure engine in `media/mux-trail.js:24-149`; deterministic movement, wrap, growth, spawn, collision and speed tests | ✅ |
| R2b — Solitaire selector | Same-dialog tablist and pure draw-one Klondike engine cover deal, stock/waste, tableau/foundation, win and persisted selection | ✅ |
| R3 — AI lifecycle | Fail-safe session-scoped adapter in `media/bridge-client.js:21-94,481-583,694-699`; legacy and remote-follow tests in `test/bridgeClient.test.js:296-402` | ✅ |
| R4 — input and accessibility | Dialog/controller in `media/mux-trail.js:206-591`; keyboard, focus, responsive, ARIA, forced-colors and reduced-motion guards | ✅ |
| R5 — original and local | One new dependency-free JS/canvas asset; no game package, image, font, audio, network, clipboard or telemetry path; VSIX content inspected | ✅ |
| R6 — isolation and compatibility | Hooks are guarded; relay payload is unchanged; both production surfaces call assembly; idle/hidden cleanup is covered | ✅ |
| R6a — live-round persistence | Versioned snapshots, same-session restore, death cleanup, max score and merge-safe VS Code state adapter are covered by deterministic tests | ✅ |
| R7 — verifiable quality | Compile, affected suite, broad regression suite and VSIX package pass; full-suite baseline exception documented below | ✅ with baseline exception |

## Done-task code and call-site audit

- **T1** exists in `media/mux-trail.js`. Browser installation at lines 10–13
  calls the controller; its gate drives lazy UI and its returned lifecycle API at
  lines 579–581 is consumed by the bridge. The exported engine is also directly
  exercised by tests, so it is not dead code.
- **T2** exists in `media/bridge-client.js`. `notifyMuxTrail` is called from
  legacy status/event handling, remote mux follow events, socket close, server
  state and session-loading paths. Tests cover pinned and unbound views,
  background sessions, cancellation and unchanged relay payloads.
- **T3** exists in `src/documentAssembly.ts:279-297` and is called by
  `src/dshChatView.ts:338-357` and `src/dshPanel.ts:247-263`. The shared i18n
  payload is built by `src/i18n.ts:45-69`; the packaging manifest already
  includes `media/**`.
- **T4** exists across `test/muxTrail.test.js`, `test/bridgeClient.test.js`,
  `test/documentAssembly.test.js`, `test/dshChatView.test.js` and
  `test/muxTrailWiring.test.js`. All are discovered and executed by `node:test`.
- **T5** exists in this close-out document and the reviewed `plan.md`,
  `summary.md` and mechanically derived `TODO.md`.
- **T6** exists in `media/mux-trail.js` (`snapshotGame`, `restoreGame`,
  `attachStorage` and per-tick persistence) and `media/bridge-client.js`
  (merge-safe `getState`/`setState` adapter). Controller tests prove a live
  same-session round resumes, death deletes it while preserving max score, and
  the bridge test proves unrelated webview state remains intact.
- **T7** exists in `media/mux-trail.js` as pure Solitaire operations plus the
  Mux Arcade tablist/DOM renderer. `muxTrailStrings()` passes every new label
  from all ten locale columns. Tests cover unique deal, placement, recycle,
  snapshot validation, tab switching, loop absence and persisted stock draw.
- **T8** is active in the same Solitaire renderer: face-up source cards install
  `dragstart`, tableau/foundation targets install `dragover`/`drop`, and the
  click path invokes the same pure move functions. The fake-DOM controller test
  performs a real waste-Ace-to-foundation click move and checks draggable/drop
  listeners, patterned stock back and all four empty suit slots.

## Executed checks

| Check | Result |
|---|---|
| `node --check media/mux-trail.js` and `media/bridge-client.js` | ✅ |
| `npm run compile` | ✅ |
| Six directly affected test files | ✅ 81 passed, 0 failed |
| All test files except the two known baseline-failing files | ✅ 184 passed, 0 failed, 1 skipped |
| `npm run package -- --out /tmp/dshmux-mux-arcade.vsix` | ✅ 78 files, 1.09 MB |
| VSIX listing | ✅ contains `media/mux-trail.js`, updated bridge and compiled view/assembly code |
| `git diff --check` | ✅ |

## Gaps and exceptions

1. **Pre-existing full-suite failures — feature severity: none; project severity:
   medium.** `npm test` reports seven failures: six Windows-path expectations in
   `test/installService.test.js` and one Node resolver expectation in
   `test/serverManager.test.js` (`/opt/homebrew/bin/node` versus `node`). The same
   failures were independently reproduced in the untouched primary worktree.
   The Mux Trail affected suite and the remaining broad suite have zero failures.
   **Suggested action:** repair those platform-sensitive fixtures in a separate
   fix pipeline; do not couple that unrelated work to this feature.
2. **Dependency audit notice — feature severity: none; project severity: medium.**
   `npm ci` reports three existing dependency advisories (one moderate, two
   high). Mux Trail adds no dependency. **Suggested action:** assess and update
   the existing dependency tree separately.
3. **Manual VS Code visual smoke — severity: low.** Automated fake-DOM and source
   contract tests cover lifecycle, focus and responsive guards, and the packaged
   artifact was inspected, but this run did not launch an interactive Extension
   Development Host. **Suggested action:** optionally smoke-test 240/320/480 px
   and high-contrast presentation before release.

The exceptions do not leave an unimplemented Mux Trail requirement or task.

*Related documents: [discussion.md](discussion.md) | [req.md](req.md) | [solution.md](solution.md) | [plan.md](plan.md)*
