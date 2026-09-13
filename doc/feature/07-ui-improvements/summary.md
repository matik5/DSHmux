# UI improvements — Summary

**Date**: 2026-09-13

## Result

DSHmux now has one chat-first sidebar view. The permanent launcher, duplicated section header, prominent product/version block, and always-visible session list are gone. A 40 px header shows the active chat title with compact Sessions, New session, and overflow actions; the embedded DSH chat receives all remaining height.

Sessions open in an in-view searchable Active/Archived popup with current-session state, relative times, rename/archive actions, keyboard/focus behavior, and narrow-width handling. Start/stop, Doctor, versions, and latest/next upgrade options are displayed only when relevant or requested. Stopped, starting, stopping, error, and session-loading states use the chat area as a recovery/progress surface.

## Main changes

- Consolidated sidebar lifecycle, session state, polling, and actions into `DshChatView`.
- Added three narrow chrome boundaries: safe HTML/config assembly, CSS, and browser DOM behavior.
- Removed `DshLauncherView`, its provider, manifest contribution, callback wiring, obsolete tests, and dead translations.
- Preserved the editor-tab surface and made both sidebar and editor documents reconnect after stop→start on a changed server port.
- Reused one VS Code API handle per document across the bridge and injected chrome.
- Added no runtime dependency or framework.
- Added controller, layout, chrome helper, bridge singleton, i18n, and editor restart coverage.
- Rendered actual chrome assets in light, dark, and high-contrast palettes at 240/320/480 px, plus popup and recovery states; see [verification.md](verification.md).

## Verification status

- `npm run compile`: pass.
- Feature/unaffected suite: 161 pass, 0 fail, 1 existing platform skip.
- Focused changed-area suite: 62 pass, 0 fail.
- Full `npm test`: 216 pass, 7 unrelated baseline failures, 1 skip. The same failures reproduce in the primary worktree.
- Live Extension Development Host smoke testing remains outstanding because no native/browser automation surface was available. See [TODO.md](TODO.md).

The implementation round is closed, but the feature is not formally complete while `TODO.md` is non-empty.

*Related documents: [discussion.md](discussion.md) | [req.md](req.md) | [solution.md](solution.md) | [plan.md](plan.md) | [verification.md](verification.md)*
