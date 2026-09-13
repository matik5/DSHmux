# Mux Trail — Summary

**Date**: 2026-09-13

**Status**: ✅ implemented and verified

DSHmux now offers a small original **Mux Arcade** waiting-game box when the visible
AI session has been working for at least three seconds. The user chooses whether
to open it and can select Mux Trail or Solitaire at the top. Completion,
question, approval, session change, server unavailability and document disposal
immediately dismiss it.

## Delivered

- Dependency-free 18×18 signal-trail engine and lazy canvas dialog.
- Edge wrapping, packet collection, growth, score, bounded speed, collision,
  restart, pause and deterministic cleanup.
- Visible-session lifecycle support for legacy and current remote-mux protocols,
  including pinned editor/sidebar isolation.
- Accessible keyboard/focus semantics, responsive sizing, VS Code theme tokens,
  high-contrast treatment and reduced-motion handling.
- Complete game text in all ten supported locales.
- Production wiring in both the sidebar chat and editor-tab panel.
- Deterministic engine, bridge, DOM-contract, assembly and wiring tests.
- Successful TypeScript compile and VSIX package containing the new runtime.
- Versioned per-session live-round persistence through VS Code webview state;
  the current score/board resumes after interruption, death clears the round,
  and the best score remains visible.
- Original dependency-free draw-one Solitaire with 52-card deal, stock/waste,
  seven tableau columns, four foundations, click-based moves and new deal.
- The selected game and live Solitaire deal persist per DSH session; switching
  away from Mux Trail stops its tick and Solitaire has no animation loop.
- Solitaire supports both source→destination clicking and native drag/drop.
  Layered backs have stronger separation, stock displays a patterned back and
  remaining-card count, and all four empty foundation homes stay visible with
  suit symbols. Every face-up card keeps its rank and suit in a fixed exposed
  top-corner marker. Invalid destinations preserve selection and explain the error.
- Tableau destination cards now accept drops directly and corner labels are
  pointer-transparent, fixing moves such as red 8 onto black 9 in Chromium.

## Verification result

The directly affected suite passed 81/81. The broad suite excluding two known
baseline-failing files passed 184 tests with one skip and no failures. Seven
platform-sensitive failures in the full project suite were reproduced unchanged
in the primary worktree and are not caused by this feature. See
[verification.md](verification.md) for evidence and suggested follow-up.

No Mux Trail tasks remain outstanding.

*Related documents: [discussion.md](discussion.md) | [req.md](req.md) | [solution.md](solution.md) | [plan.md](plan.md) | [TODO.md](TODO.md)*
