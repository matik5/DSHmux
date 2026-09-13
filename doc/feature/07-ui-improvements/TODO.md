# TODO

Generated mechanically from the `❌` and `⏭️` tasks and unchecked items in [plan.md](plan.md).

### T5 — Replace obsolete tests with requirement-level regression coverage

**Status**: ❌ blocked — feature-scoped tests pass; full `npm test` reproduces seven unrelated baseline failures

- [ ] Test the remaining live-DOM behavior (Arrow/Enter/Escape, focus restoration, outside click, pending state, and storage notification) in an Extension Development Host; pure helpers, safe serialization, host behavior, and rendered popup states are covered.
- [ ] Make the repository-wide `npm test` green; compile, focused tests, and the non-baseline suite pass, but seven unrelated failures reproduce in the primary worktree.

### T6 — Perform visual and end-to-end verification

**Status**: ⏭️ deferred — rendered verification complete; live Extension Development Host smoke unavailable

- [ ] Verify the complete mouse and keyboard flow in a live Extension Development Host; static/a11y audit and rendered popup evidence pass.
- [ ] Verify screen-reader announcements in a live Extension Development Host; markup, focus-visible, `aria-live`/`aria-busy`, forced-colors, and reduced-motion source checks pass.
- [ ] Run the manual lifecycle path in a live Extension Development Host; controller/bridge tests cover every transition, including both surfaces on stop → start.
