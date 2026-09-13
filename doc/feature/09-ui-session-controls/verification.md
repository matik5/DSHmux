# UI session controls — verification

**Date**: 2026-09-13
**Sources**: [req.md](req.md), [solution.md](solution.md), [plan.md](plan.md)

## 1. Result

Kõik R1–R7 nõuded on koodis olemas ja kontrollitud. Pärast feature-branchi sünkroniseerimist värske `origin/main` peale läbib kogu repository testisuite: 238 testist 237 läbib, 0 ebaõnnestub ja 1 jäetakse platvormipõhiselt vahele. Extension kompileerub ning `dshmux-0.4.8.vsix` pakiti edukalt.

## 2. RTTM coverage recheck

| Requirement | Plan coverage | Evidence | Result |
|---|---|---|---|
| R1 — Header rename | T3, T7 | `media/chat-chrome.js:320-353,744-750`; olemasolev host rename `src/dshChatView.ts:326-340,417-432`; contract test `test/chatChrome.test.js:101-140` | ✅ covered |
| R2 — Pinned | T2, T3, T6, T7 | workspaceState `src/dshChatView.ts:35,107-113,470-486,568-581`; snapshot `:597`; tab/rows `src/chatChrome.ts:117`; `media/chat-chrome.js:472-577`; persistence tests `test/dshChatView.test.js:465-514` | ✅ covered |
| R3 — Full text | T1, T4, T6, T7 | RPC wrapper `src/serverManager.ts:1118-1137`; host filter `src/dshChatView.ts:488-520`; debounce/latest/group render `media/chat-chrome.js:60-81,544-605,732-740`; tests `test/serverManager.test.js:737-785`, `test/dshChatView.test.js:516-591` | ✅ covered |
| R4 — Compact picker | T5, T7 | search/tab layout `media/chat-chrome.css:155-249`; box-sized 32 px row `:282-309`; responsive/contrast `:527-556`; static layout tests | ✅ covered |
| R5 — Start/Stop menu | T5, T6, T7 | final markup row `src/chatChrome.ts:141`; state mapping and live application `media/chat-chrome.js:83-99,642-645`; process mapping unit test `test/chatChrome.test.js:42-62` | ✅ covered |
| R6 — KISS/version/regressions | T1–T8 | no dependency delta; existing RPC/state/message architecture reused; manifests `0.4.8`; focused and repository-wide tests plus package pass | ✅ covered |
| R7 — Reload preserves sidebar focus | T9 | activation reveal eemaldatud `src/extension.ts:160-166`; explicit Start reveal säilib `src/commands.ts:23-27`; regressioonitest `test/chatViewLayout.test.js:54-78` | ✅ covered |

Kõik requirements on seotud vähemalt ühe teostus- ja kontrollülesandega; RTTM-is ei ole katmata nõuet.

## 3. Completed-task code/call audit

| Task | Code exists | Code is called | Verification |
|---|---|---|---|
| T1 | `DshServerManager.searchSessions()` at `src/serverManager.ts:1118` | Called by `DshChatView.searchSessions()` at `src/dshChatView.ts:492` | Remote/legacy focused tests pass. |
| T2 | Pin parser/state/toggle/prune at `src/dshChatView.ts:35-60,107-113,470-486,568-581` | `toggle-pin` routes at `:343-346`; snapshots carry IDs at `:597` | Persistence, order, archive, stale and failure tests pass. |
| T3 | Header editor and pinned row renderer at `media/chat-chrome.js:320-353,472-577` | Registered at `:744-750`; pin button posts at `:506-513` | Markup/helper/host tests pass; code is not dead. |
| T4 | Queue, group renderer and response gate at `media/chat-chrome.js:544-605,732-740` | Input/checkbox listeners at `:763-765`; host route at `src/dshChatView.ts:347-356` | Search mapping, foreign-ID removal, error, stale-document and latest-ID tests pass. |
| T5 | Compact CSS and `processActionFor()` at `media/chat-chrome.css:155-309`; `media/chat-chrome.js:83-99` | Applied on every server status at `media/chat-chrome.js:642-645` | CSS/markup and five-state unit checks pass. |
| T6 | New translation rows at `src/i18nStrings.ts:190-273,406-418` | Read through `t(...)` in `src/dshChatView.ts:233-264`, then applied by chrome | All-language completeness test passes. |
| T8 | `package.json:5`, `package-lock.json:3,9` | VSIX manifest reads package version during packaging/runtime metadata | Packaged VSIX reports `0.4.8`. |
| T9 | Provider registration remains at `src/extension.ts:160-166`; activation-level `revealChat()` is absent | `revealChat` remains wired at `src/extension.ts:130-147` and called only by explicit Start at `src/commands.ts:23-27` | Layout regression test passes; packaged `out/extension.js` has zero reveal calls and `out/commands.js` has one. |

T7 täitis kõik kontrollikriteeriumid pärast seda, kui branch sünkroniseeriti `origin/main` platvormitestide parandusega. Kõigi `✅` ülesannete kood eksisteerib ja on ühendatud reaalsesse message-, renderdus-, command- või packaging-voogu.

## 4. Commands and evidence

| Command | Result |
|---|---|
| `npm run compile` | ✅ pass |
| `node --test test/chatViewLayout.test.js` | ✅ 6/6 pass, including activation focus regression |
| Focused manager search tests | ✅ 2/2 pass |
| `node --test test/chatChrome.test.js test/chatViewLayout.test.js test/dshChatView.test.js test/i18n.test.js` | ✅ 36/36 pass |
| `git diff --check` | ✅ pass |
| `npm run package` | ✅ `dshmux-0.4.8.vsix`, 79 files, 1.08 MB |
| VSIX content/version inspection | ✅ manifest `0.4.8`; new header/search/process code present |
| `npm test` pärast `origin/main` sünkroniseerimist | ✅ 237 pass, 0 fail, 1 skip |

## 5. Gaps

Lahendamata nõude- ega verifitseerimislünki ei leitud.

*Related documents: discussion.md | req.md | solution.md | plan.md | summary.md | TODO.md*
