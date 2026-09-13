# UI session controls — Implementation Plan

**Date**: 2026-09-13
**Sources**: [discussion.md](discussion.md), [req.md](req.md), [solution.md](solution.md)

**Status**: ✅ implementation and verification complete (2026-09-13)

## RTTM

| Requirement | Task | Verification |
|---|---|---|
| R1 — Header rename | T3, T7 | Header double-click opens selected input; Enter posts existing rename contract; Escape/blank/unchanged cancel; polling and errors preserve correct title. |
| R2 — Pinned view and persistence | T2, T3, T6, T7 | Three views appear in order; pin/unpin persists per workspace; archived pins remain visible in both relevant views; stale IDs are hidden/pruned. |
| R3 — Optional full-text search | T1, T4, T6, T7 | DSH RPC envelope is correct; results are workspace-filtered, snippet-safe, grouped/deduplicated and latest-request-only; errors/hasMore are visible. |
| R4 — Compact session picker | T5, T7 | Normal row is at most 32 px; controls fit at 240/320/480 px without horizontal popup overflow; focus/forced-colors rules remain. |
| R5 — Dynamic Start/Stop menu action | T5, T6, T7 | Last menu row follows ready/stopped/error/starting/stopping and routes to existing host commands without duplicates. |
| R6 — KISS, regressions and version 0.4.8 | T1–T8 | No runtime dependency/framework/index/parser added; old flows pass; manifests agree on 0.4.8; compile and full tests pass. |
| R7 — Reload preserves sidebar focus | T9 | Activation contains no unconditional chat-focus call; provider and background restart remain; explicit `DSHmux: Start` still reveals the chat. |

## Tasks

### T1 — Add the narrow DSH session-search wrapper

**Status**: ✅ done
**Files**: `src/serverManager.ts:53-63`, `src/serverManager.ts:806-880`, `src/serverManager.ts:1067-1134`, `test/serverManager.test.js:324-365`, `test/serverManager.test.js:708-734`, `test/serverManager.test.js:736-920`

- [x] Add a public result type containing only `sessionId` and `snippet` strings.
- [x] Add `searchSessions(query)` beside the existing session list/rename/archive wrappers.
- [x] Call the unchanged private carrier with `session.search` and `{ query }`.
- [x] Normalize malformed response items out and coerce `hasMore` only from a real boolean.
- [x] Test both token-auth Remote and legacy envelopes plus normalized output.
- [x] Confirm no existing `api()` caller or fallback behavior changes.

Target contract:

```ts
export interface SessionSearchResult {
  items: Array<{ sessionId: string; snippet: string }>;
  hasMore: boolean;
}

async searchSessions(query: string): Promise<SessionSearchResult> {
  const value = await this.api("session.search", { query });
  // Return only validated items and a boolean hasMore.
}
```

**Completion criteria**: Remote sends `{ args: { request: { query } } }`, legacy sends `{ query }`, malformed hits are excluded, and focused server-manager tests pass.

### T2 — Persist and expose workspace-scoped pinned sessions

**Status**: ✅ done
**Files**: `src/dshChatView.ts:33-51`, `src/dshChatView.ts:70-101`, `src/dshChatView.ts:285-356`, `src/dshChatView.ts:417-493`, `test/dshChatView.test.js:95-214`, `test/dshChatView.test.js:309-445`

- [x] Define one `dshmux.pinnedSessionIds` workspaceState key and a validator that keeps unique non-empty string IDs.
- [x] Initialize the pinned order from `context.workspaceState` in `DshChatView` without changing its constructor signature.
- [x] Add a validated `toggle-pin` message case.
- [x] Prepend newly pinned IDs; remove unpinned IDs; await persistence before publishing success.
- [x] On persistence failure, retain/restore the previous array and send an operation error.
- [x] Include `pinnedSessionIds` in `ChatChromeInit` and every `sessions-snapshot`.
- [x] After a successful poll, prune IDs absent from the current workspace active/archive union and persist only when the array changed.
- [x] Test persistence across controller recreation, order, unpin, archived pin, invalid message and stale-ID pruning.

State shape:

```ts
const PINNED_SESSION_IDS_KEY = "dshmux.pinnedSessionIds";
private pinnedSessionIds: string[];

// Additive snapshot field
{ type: "sessions-snapshot", items, archivedItems, pinnedSessionIds, currentSessionId }
```

**Completion criteria**: Pins survive reload through the fake `workspaceState`, remain isolated to that state object, publish in stable most-recently-pinned-first order, and invalid/stale IDs never render.

### T3 — Add header rename and the Pinned view

**Status**: ✅ done
**Files**: `src/chatChrome.ts:4-50`, `src/chatChrome.ts:82-113`, `media/chat-chrome.js:90-174`, `media/chat-chrome.js:230-420`, `media/chat-chrome.js:500-545`, `media/chat-chrome.css:45-74`, `media/chat-chrome.css:185-309`, `test/chatChrome.test.js:1-78`, `test/chatViewLayout.test.js:20-42`

- [x] Extend `ChatChromeCopy`/`ChatChromeInit` with pinned-related copy and pinned IDs.
- [x] Make the current-title element a clearly labelled, focusable rename target without moving the approved header action order.
- [x] On title double-click, replace its display content with a selected inline input for the concrete current session.
- [x] Submit trim/nonblank/changed text through the existing `rename-session`; cancel on Escape/blank/unchanged.
- [x] Track header edit state so `setTitle()` and session snapshots cannot replace the input mid-edit.
- [x] On rename error, restore the prior server-confirmed title and show the existing toast; on success render the confirmed snapshot title.
- [x] Add `Pinned` as the first tab and set all three `aria-pressed` states from one `sessionMode`.
- [x] Build pinned rows from active/archive union in `pinnedSessionIds` order.
- [x] Add a row pin/unpin icon button that stops row opening and posts only `toggle-pin`.
- [x] Default popup to Pinned only when at least one stored ID resolves to a current session, else Active.
- [x] Preserve the existing Active and Archived contents, keyboard navigation, focus trap, rename and archive actions.

Core browser flow:

```js
title.addEventListener("dblclick", beginHeaderRename);

function pinnedSessions() {
  var byId = /* active + archived map */;
  return pinnedSessionIds.map(function (id) { return byId[id]; }).filter(Boolean);
}

pinButton.addEventListener("click", function (event) {
  event.stopPropagation();
  post({ type: "toggle-pin", sessionId: item.sessionId });
});
```

**Completion criteria**: header rename follows R1 in manual/static contract checks, tabs are ordered Pinned → Active → Archived, and pin actions do not trigger open/archive/rename side effects.

### T4 — Add debounced, latest-only full-text UI

**Status**: ✅ done
**Files**: `src/chatChrome.ts:99-113`, `media/chat-chrome.js:90-174`, `media/chat-chrome.js:283-420`, `media/chat-chrome.js:500-625`, `media/chat-chrome.css:142-229`, `test/chatChrome.test.js:1-78`, `test/dshChatView.test.js:95-214`, `test/dshChatView.test.js:450-536`

- [x] Add a native checkbox and associated text label at the end of the search control area.
- [x] Keep unchecked input on the current synchronous title-filter path.
- [x] When checked with nonblank text, debounce by a small fixed delay and send a monotonically increasing `requestId` with `search-sessions`.
- [x] In `DshChatView`, call T1, filter hits through the current active/archive session map, enrich them with title/time/archive, and preserve the DSH snippet as plain text.
- [x] Return `session-search-result` with the same ID, normalized items, `hasMore`, or a local error.
- [x] Accept a response only when its ID equals the browser's newest request; toggling off or clearing input advances/invalidates that ID.
- [x] Render a subtle loading state while pending.
- [x] Group full-text hits Pinned → non-pinned Active → non-pinned Archived, without duplicating a pinned session.
- [x] Render group labels and snippets with `textContent` only.
- [x] Show a localized more-results notice when `hasMore`; show a recoverable localized error without mutating ordinary snapshot data.
- [x] Export only small pure grouping/latest-request helpers needed by Node tests.

Wire contract:

```ts
// webview -> host
{ type: "search-sessions", requestId: number, query: string }

// host -> webview
{
  type: "session-search-result",
  requestId,
  items: [{ sessionId, title, updatedAt, archived, snippet }],
  hasMore,
  error?: string
}
```

**Completion criteria**: a content-only match opens the right session, other-workspace IDs are absent, snippets cannot become HTML, and an older delayed response cannot replace the latest results.

### T5 — Compact the picker and make the final process action dynamic

**Status**: ✅ done
**Files**: `src/chatChrome.ts:99-138`, `media/chat-chrome.js:103-174`, `media/chat-chrome.js:422-498`, `media/chat-chrome.js:538-573`, `media/chat-chrome.css:127-229`, `media/chat-chrome.css:231-377`, `media/chat-chrome.css:468-496`, `test/chatChrome.test.js:45-78`, `test/chatViewLayout.test.js:20-42`

- [x] Reduce dialog/search/tab spacing and set ordinary `.dshmux-session-open` `min-height` to at most 32 px.
- [x] Let the search controls wrap internally on narrow widths while forbidding popup-wide horizontal overflow.
- [x] Keep icon buttons large enough to operate and preserve focus-visible/forced-colors behavior.
- [x] Replace `dshmux-stop` with exactly one final `dshmux-process-action` button.
- [x] Derive that button's label, command and disabled state inside `applyServerStatus()`.
- [x] Use ready=`stop`, stopped=`start`, error=`start` or `open-doctor` when gated, starting/stopping=disabled progress copy.
- [x] Ensure the generic overflow click handler posts the current dynamic command and closes only for actionable rows.
- [x] Leave the stopped/error overlay recovery controls intact.

State mapping:

```js
function processActionFor(state, doctorState) {
  if (state === "ready") return { command: "stop", label: copy.stop, disabled: false };
  if (state === "stopped") return { command: "start", label: copy.start, disabled: false };
  if (state === "error" && doctorState !== "ready") {
    return { command: "open-doctor", label: copy.openDoctor, disabled: false };
  }
  if (state === "error") return { command: "start", label: copy.retryDsh, disabled: false };
  return { command: "", label: stateText(state), disabled: true };
}
```

**Completion criteria**: row height and responsive assertions pass; overflow's last row always reflects current state; repeated clicks during transitions cannot send a process command.

### T6 — Add all localized UI copy

**Status**: ✅ done
**Files**: `src/i18nStrings.ts:165-383`, `src/i18nStrings.ts:457-505`, `src/dshChatView.ts:211-247`, `test/i18n.test.js`

- [x] Add keys for Pinned, Pin, Unpin, Full text search, searching, more-results, result group labels/archived indication where needed, and Retry DSH.
- [x] Supply non-empty `en`, `zh`, `ja`, `ko`, `et`, `uk`, `es`, `pt`, `fr`, `de` values for every new key.
- [x] Expose all browser-facing strings through `ChatChromeCopy`; do not hard-code visible English in the browser asset.
- [x] Run the i18n completeness test.

Example keys:

```ts
"chrome.pinned": { en: "Pinned", et: "Kinnitatud", /* all columns */ },
"chrome.fullTextSearch": { en: "Full text search", et: "Täistekstiotsing", /* ... */ },
"chrome.retryDsh": { en: "Retry DSH", et: "Proovi DSH-d uuesti", /* ... */ },
```

**Completion criteria**: every visible new phrase comes from `t(...)`, all ten locale columns are non-empty, and `test/i18n.test.js` passes.

### T7 — Complete focused tests and regression verification

**Status**: ✅ done
**Files**: `test/serverManager.test.js`, `test/dshChatView.test.js`, `test/chatChrome.test.js`, `test/chatViewLayout.test.js`, plus any existing test exposed by failures

- [x] Extend the manager fake with `searchSessions` and a deterministic in-memory workspaceState.
- [x] Cover header rename markup/state guards, three-tab ordering and pin action contract.
- [x] Cover persisted pins, archived pins, stale-ID pruning and failed persistence.
- [x] Cover search success/error, snippet mapping, current-workspace filtering and request-ID race handling.
- [x] Cover the 20-result/`hasMore` notice contract.
- [x] Cover process action mapping for all five server states and Doctor gating.
- [x] Assert popup row height ≤32 px, no new runtime dependency, and responsive/forced-color rules.
- [x] Re-run existing create/open/rename/archive/sidebar/editor/Doctor/settings/upgrade tests.
- [x] Run `npm test` and `npm run compile` from the feature worktree.

Expected verification commands:

```sh
npm test
npm run compile
git diff --check
```

**Completion criteria**: all focused and existing tests pass, TypeScript compiles cleanly, and `git diff --check` reports no whitespace error.

### T8 — Bump the extension patch version to 0.4.8

**Status**: ✅ done
**Files**: `package.json:5`, `package-lock.json:3`, `package-lock.json:9`

- [x] Update only the root extension version values from 0.4.7 to 0.4.8.
- [x] Do not create a git tag or release commit as a side effect.
- [x] Confirm dependency sections and unrelated package metadata did not change.
- [x] Re-run compile/tests after the bump so generated runtime reads the new manifest value.

Target manifest fragments:

```json
{
  "name": "dshmux",
  "version": "0.4.8"
}
```

**Completion criteria**: `node -p "require('./package.json').version"` prints `0.4.8`, both root lockfile version fields match, and no dependency delta exists.

### T9 — Stop activation from stealing sidebar focus

**Status**: ✅ done
**Files**: `src/extension.ts:130-166`, `src/commands.ts:20-27` (audited, unchanged), `test/chatViewLayout.test.js:12-78`

- [x] Remove only the unconditional `revealChat()` at the end of `activate()` and its obsolete comment.
- [x] Keep the single webview provider registration and `retainContextWhenHidden` behavior unchanged.
- [x] Keep auto-restart/session restoration background-capable without adding sidebar-selection state.
- [x] Keep `revealChat` passed into `registerCommands()` and invoked after a successful explicit `dshmux.start` command.
- [x] Replace the old “provider before reveal” assertion with a regression assertion that activation has no `revealChat()` call.
- [x] Assert the explicit Start command still invokes `revealChat()` after `manager.start()` succeeds.
- [x] Run focused layout tests, TypeScript compile, `git diff --check`, and package verification.

Target activation shape:

```ts
context.subscriptions.push(
  vscode.window.registerWebviewViewProvider(DshChatView.viewType, chatView, {
    webviewOptions: { retainContextWhenHidden: true },
  })
);
// No automatic reveal here; VS Code retains/restores the selected sidebar view.
```

**Completion criteria**: reload/activation never invokes `dshmux.chat.focus`, explicit `DSHmux: Start` still does, no sidebar-state machinery is introduced, and focused tests plus compile pass.

## Implementation order

```text
T1 search RPC ────────────────┐
                              ├──> T4 full-text UI ──┐
T2 pinned host state ─────────┤                      │
                              └──> T3 pin/header UI ─┤
T6 i18n ─────────────────────────> T3/T4/T5 ─────────┤
T5 compact/process UI ───────────────────────────────┤
                                                     v
                                               T7 verification
                                                     |
                                                     v
                                               T8 version bump
                                                     |
                                                     v
                                               T9 focus fix
                                                     |
                                                     v
                                  verification.md -> plan review
                                      -> summary.md + TODO.md
```

Implementation audits ran after T1–T3 and after T4–T6. T9 is audited separately against R7 before final verification.

*Related documents: discussion.md | req.md | solution.md*
