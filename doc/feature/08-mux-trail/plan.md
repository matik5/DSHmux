# Mux Trail — Implementation Plan

**Date**: 2026-09-13

**Sources**: [discussion.md](discussion.md), [req.md](req.md), [solution.md](solution.md)

**Status**: ✅ kasutaja kinnitatud (2026-09-13 korraldus kinnitada plan ja implementeerida)

## RTTM

| Requirement | Task | Verification |
|---|---|---|
| R1 — vabatahtlik 3 s affordance | T1, T3, T4 | Fake-timer offer-testid; kiire completion ei näita ikooni; assembly/wiring test |
| R2 — mängureeglid | T1, T4 | Puhtad engine-testid liikumise, wrap'i, kasvu, collision'i, score'i ja restardi kohta |
| R3 — AI lifecycle | T2, T3, T4 | Legacy + remote-mux visible/background, done/ask/cancel/server-state testid |
| R4 — sisend ja a11y | T1, T4 | Keyboard/focus/cleanup testid ja DOM/source guard'id 240 px + ARIA + reduced-motion jaoks |
| R5 — originaalne/lokaalne | T1, T3, T5 | Dependency- ja VSIX-sisu audit; ainult oma JS/CSS/canvas; võrgu API puudumise kontroll |
| R6 — isolatsioon/ühilduvus | T2, T3, T4, T5 | Olemasolev full suite; fail-safe adapter; mõlema pinna wiring; timer cleanup |
| R7 — kvaliteet | T4, T5 | Kõik nõutud deterministlikud testid, compile, unit suite ja VSIX package |
| R6a — vooru taastamine | T6 | Snapshot validation, same-session resume, death cleanup, max score ja state merge testid |
| R2b — Solitaire samas kastis | T7 | Deal/rules/recycle/snapshot-testid ning controlleri tab/input/persistence test |
| R2b — Solitaire interaktsioon | T8 | Click-move, draggable/drop, stock back, layered backs ja foundation-slot DOM-testid |

## Tasks

### T1 — Mux Traili mootor ja webview UI

**Status**: ✅ done

**Files**: `media/mux-trail.js` (uus fail, kogu fail)

- [x] Loo sõltuvusteta UMD-moodul, mis ekspordib pure engine API Node testidele
  ja installib browser controller'i ainult DOM-i olemasolul.
- [x] Implementeeri 18×18 grid, esimesel suunal algav liikumine, nooled/WASD,
  wrap, keelatud reverse, packet spawn, growth, score, self-collision ja restart.
- [x] Implementeeri idempotentne 3000 ms offer-gate ning begin/end/destroy.
- [x] Loo väike fixed launcher ja ligipääsetav modal dialog; launcher ei ole idle
  olekus DOM-is nähtav ega kata composer'it rohkem kui oma väikese pinna võrra.
- [x] Lisa VS Code theme-token canvas-renderdus, kuju-põhine eristus,
  responsive/DPR sizing ning `prefers-reduced-motion` guard.
- [x] Püüa gameplay-klahvid ainult avatud dialogis, halda focus restore,
  `visibilitychange`, `pagehide` ja timer cleanup.

```js
const game = createGame(random, 18, 18);
queueDirection(game, { x: 1, y: 0 });
stepGame(game, random);

window.__DSH_MUX_TRAIL__ = install(window, window.__DSH_BRIDGE__.muxTrail);
```

**Completion criteria**: kõik R1/R2/R4 engine- ja lifecycle-käitumised on
testitava API kaudu olemas; suletud/peidetud mängul ei ole aktiivset tick'i.

### T2 — Visible-session lifecycle bridge

**Status**: ✅ done

**Files**: `media/bridge-client.js:14-23,190-209,377-484,536-590`

- [x] Hoia boot-konfi visible session ID-d ja remote follow-streamide map'i.
- [x] Vaata `BridgeWebSocket.send` control-envelope'i ilma hostile saadetavat
  payload'i muutmata.
- [x] Seo incoming `item.streamId` ainult uusima nähtava `session/follow`
  streamiga; legacy event'id scope'i `payload.sessionId` järgi.
- [x] Projekteeri start/running true -> `beginWait`; done/running false,
  question, approval, current follow cancel ja server-not-ready -> `endWait`.
- [x] Isoleeri kõik mängukutsed `try/catch`-iga ning jäta sound/relay järjekord
  ja semantika puutumata.

```js
function notifyMuxTrail(method, value) {
  try {
    var api = window.__DSH_MUX_TRAIL__;
    if (api && typeof api[method] === "function") api[method](value);
  } catch (error) {
    console.error("[dsh-mux-trail] lifecycle hook failed", error);
  }
}
```

**Completion criteria**: ainult nähtava sessiooni sündmused juhivad mängu;
olemasolev ws-send/frame relay ja session sounds läbivad muutmata.

### T3 — Assembly, i18n ja kahe pinna wiring

**Status**: ✅ done

**Files**: `src/documentAssembly.ts:11-55,199-274`; `src/i18nStrings.ts`;
`src/i18n.ts:1-34`; `src/dshChatView.ts:1-18,329-365`;
`src/dshPanel.ts:1-16,239-266`; `CHANGELOG.md:1-5`

- [x] Lisa typed Mux Trail string/config väljad `AssembleOptions`-isse.
- [x] JSON-escape boot config ning süsti mänguskript enne bridge'i ja upstream
  module-scripti; kui script puudub, säilita vana output.
- [x] Lisa kõik mängutekstid kümnesse i18n veergu ja ühine
  `muxTrailStrings()` koostaja.
- [x] Loe `media/mux-trail.js` mõlemas production view's, anna kaasa tekstid
  ning `currentSessionId` / bound `sessionId`.
- [x] Lisa Unreleased changelog kirje.

```ts
const gameJs = fs.readFileSync(
  path.join(this.context.extensionUri.fsPath, "media", "mux-trail.js"),
  "utf8"
);
await assembleDocument({
  ...,
  muxTrailJs: gameJs,
  muxTrailStrings: muxTrailStrings(),
  visibleSessionId: this.currentSessionId,
});
```

**Completion criteria**: mängu script/config on mõlema pinna assembled HTML-is,
lokaliseerimine on täielik ning existing assembly call-site'id ei purune.

### T4 — Deterministlik regressioonikate

**Status**: ✅ done

**Files**: `test/muxTrail.test.js` (uus); `test/bridgeClient.test.js:20-92,242-630`;
`test/documentAssembly.test.js:108-290`; `test/dshChatView.test.js:120-226`;
`test/muxTrailWiring.test.js` (uus)

- [x] Testi pure engine'i kõiki R2 reegleid fikseeritud randomiga.
- [x] Testi fake timer'iga 3 s offer, early end, duplicate begin/end ja destroy.
- [x] Testi DOM/source contract'i: dialog, ARIA, focus, 240 px responsive,
  high-contrast tokenid, reduced-motion ja ainult-open keyboard capture.
- [x] Testi bridge'is visible/background scoping mõlema protokolli jaoks,
  follow open/cancel map, completion, question, approval ja server state.
- [x] Testi assembly script order/config ning mõlema production view wiring.
- [x] Kinnita, et olemasolevad bridge sound-testid ja relay-testid jäävad
  muutmata roheliseks.

```js
gate.begin();
clock.advance(2999);
assert.equal(events.length, 0);
clock.advance(1);
assert.deepEqual(events, ["offer"]);
gate.end();
assert.deepEqual(events, ["offer", "dismiss"]);
```

**Completion criteria**: R7 loetletud deterministlik kate töötab ilma võrgu ja
päris VS Code'ita; kogu olemasolev suite on roheline.

### T5 — Build, package ja close-out audit

**Status**: ✅ done

**Files**: `doc/feature/08-mux-trail/verification.md` (uus), `plan.md`,
`summary.md` (uus), `TODO.md` (mehaaniliselt genereeritud)

- [x] Käivita `npm run compile`.
- [x] Käivita `npm test` (7 baasharu identset, feature'ist sõltumatut viga dokumenteeritud `verification.md`-s).
- [x] Käivita `npm run package` ning kontrolli, et VSIX sisaldab
  `media/mux-trail.js` ega lisa ootamatuid mängusõltuvusi/varasid.
- [x] Auditeeri RTTM: iga `✅` task peab omama olemasolevat ja kutsutud koodi.
- [x] Kirjuta `verification.md`, uuenda taskide staatuseid, kirjuta
  `summary.md` ja genereeri `TODO.md` ainult `❌`/`⏭️` taskidest.

```text
req R1..R7 -> RTTM -> T1..T5 -> code + call-site -> deterministic test -> VSIX
```

**Completion criteria**: compile, full unit suite ja package on rohelised;
verification ei leia täitmata acceptance gap'i või märgib selle ausalt
`❌`/`⏭️` kujul.

## Lightweight implementation audits

- **Pärast T1–T3**: R1–R6 katvus kontrollitud. UI on lazy, lifecycle on
  visible-session scoped ning mõlemad production-pinnad kutsuvad uut assembly
  rada. Funktsionaalset gap'i ei leitud.
- **Pärast T4–T5**: affected suite ja lai regressiooniring on rohelised;
  VSIX sisaldab runtime'i. Täis-suite'i seitse olemasolevat platvormi/resolveri
  viga reprodutseeriti muutmata baastööpuus ja on kirjas `verification.md`-s.
- **Pärast T6**: restore/death/max-score testid ja bridge state-merge test on
  rohelised; affected suite 78/78 ning lai regressiooniring 181 pass / 0 fail /
  1 skip. R6a gap'i ei jäänud.
- **Pärast T7**: Solitaire'i pure-engine ja controlleri tab-testid on rohelised;
  affected suite 81/81 ning lai regressiooniring 184 pass / 0 fail / 1 skip.
  Mõlemad mängud kasutavad sama lifecycle'i ja Solitaire ei jäta timer'it.
- **Pärast T8**: fake-DOM test teeb legaalse click-move'i ning kontrollib
  draggable/drop hook'e, stock back'i ja nelja foundation-slot'i. Affected suite
  on 81/81 ja lai regressiooniring 184 pass / 0 fail / 1 skip.

### T6 — Current state, current score ja max score

**Status**: ✅ done

**Files**: `media/mux-trail.js`, `media/bridge-client.js`,
`src/i18nStrings.ts`, `test/muxTrail.test.js`, `test/bridgeClient.test.js`

- [x] Lisa versioonitud pure snapshot/restore ja range/shape valideerimine.
- [x] Salvesta elus voor sessioonipõhiselt iga inputi/tick'i ja sulgemise eel.
- [x] Taasta sama sessiooni elus voor; kustuta snapshot surma/võidu korral.
- [x] Hoia ja kuva current score koos lokaalse max score'iga.
- [x] Kasuta VS Code webview state adapterit ning säilita tundmatud state-väljad.
- [x] Kata restore, death cleanup, max score ja state merge testidega.

```js
controller.attachStorage({ load: vscode.getState, save: mergeAndSetState });
const game = restoreGame(savedRound) || createGame(random, 18, 18);
```

**Completion criteria**: elus voor jätkub sama sessiooni uuel ooteajal, surnud
voor ei taastu, max score säilib ning DSH/webview muu state ei kao.

### T7 — Mux Arcade selector ja draw-one Solitaire

**Status**: ✅ done

**Files**: `media/mux-trail.js`, `src/documentAssembly.ts`, `src/i18n.ts`,
`src/i18nStrings.ts`, `test/muxTrail.test.js`, `test/dshChatView.test.js`

- [x] Lisa dialogi ülaossa Mux Trail / Solitaire tablist ja aktiivse tab'i state.
- [x] Implementeeri nullist 52-kaardiline draw-one Klondike engine.
- [x] Lisa stock/waste, tableau run, foundation, flip, recycle, win ja new deal.
- [x] Renderda responsive DOM-kaardid VS Code/high-contrast tokenitega.
- [x] Salvesta Solitaire'i elus deal ja aktiivne game-tab sessioonipõhiselt.
- [x] Lisa kõik uued UI-tekstid kümnes locale'is.
- [x] Kata engine, snapshot validation, tab switch ja persisted draw testidega.

```js
switchGame("solitaire");
moveSolitaireTableau(state, fromColumn, fromIndex, toColumn);
```

**Completion criteria**: kasutaja saab samas ootekastis valida ja mängida
mõlemat mängu; Solitaire järgib dokumenteeritud reegleid, ei kasuta aktiivset
loop'i ja taastub sama sessiooni järgmisel ooteajal.

### T8 — Solitaire'i liigutamine ja visuaalsed slot'id

**Status**: ✅ done

**Files**: `media/mux-trail.js`, `src/documentAssembly.ts`, `src/i18n.ts`,
`src/i18nStrings.ts`, `test/muxTrail.test.js`

- [x] Toeta nii source→destination klõpsu kui native drag-and-drop'i.
- [x] Hoia invalid move'i korral selection ja näita lokaliseeritud teadet.
- [x] Kuva stock mustrilise kaarditaguse ning allesoleva arvuga.
- [x] Tee kattuvate tableau tagakülgede servad ja vahed eristatavaks.
- [x] Hoia iga face-up kaardi rank+mast fikseeritud ülanurgas ja virnas nähtav.
- [x] Tee corner pointer-transparent'iks ja iga kaart otseseks drop-target'iks.
- [x] Lisa punane 8 (+ allrida) → must 9 regressioonitest.
- [x] Rakenda ♥/♦ punane klass ühises kaardirenderduses ka waste'ile ja foundation'ile.
- [x] Kuva neli tühja foundation-slot'i mastisümboli ja tugeva outline'iga.
- [x] Tõenda fake-DOM testiga slot'id, drag/drop hook'id ja click-move.

```js
beginSolitaireDrag(event, selectedRun);
makeSolitaireDropTarget(foundationNode, "foundation", suit);
```

**Completion criteria**: kaarte saab mõlema sisendimudeliga legaalselt
liigutada ning stock, kattuvad tagaküljed, face-up rank+mast ja kõik mastikohad
on kohe loetavad.

## Order

```text
T1 game core/UI ───────┐
                       ├──> T4 tests ──> T5 close-out
T2 lifecycle bridge ───┤
                       │
T3 assembly/i18n/wiring┘

T1 + T2 ──> T6 persistence ──> T5 close-out recheck
T1 + T6 ──> T7 Solitaire ──> T5 close-out recheck
T7 ──> T8 interaction polish ──> T5 close-out recheck
```

*Related documents: discussion.md | req.md | solution.md*
