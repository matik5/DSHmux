# Mux Trail — lahendus

**Kuupäev**: 2026-09-13

**Allikad**: [discussion.md](discussion.md), [req.md](req.md)

**Staatus**: ✅ kasutaja kinnitatud (2026-09-13 korraldus läbida solution/plan ja implementeerida)

## 1. Goal

Lisada mõlemasse embed'itud DSH chatipinda sõltuvusteta Mux Traili ooteajamäng.
Mängu affordance ilmub ainult nähtava sessiooni vähemalt kolm sekundit kestva
AI-töö ajal, avaneb kasutaja käsul ning kaob kohe completion'i, küsimuse,
approval'i või webview lifecycle'i lõpus. Mäng ei tohi sõltuda upstream DSH DOM
selectoritest ega muuta relay liiklust.

Sihtarhitektuur jagab vastutuse kolmeks:

1. `media/bridge-client.js` tuvastab ja scope'ib DSH lifecycle-sündmused;
2. uus `media/mux-trail.js` sisaldab nii testitavat puhast mängumootorit kui
   isoleeritud webview UI-kontrollerit;
3. `src/documentAssembly.ts` süstib mänguskripti ja lokaliseeritud boot-konfi
   mõlema olemasoleva pinna dokumenti.

## 2. Facts

### F1 — Ühine document-assembly seam

- `AssembleOptions` võtab praegu ühe inlinetava `bridgeClientJs` stringi ja
  valikulise `chromeHtml` stringi (`src/documentAssembly.ts:11-55`).
- `assembleDocument` ehitab `window.__DSH_BRIDGE__` boot-konfi ning süstib
  session preset'i ja bridge-skripti `<head>` sisse enne upstream module-scripti
  (`src/documentAssembly.ts:199-274`).
- CSP lubab inline scripti/style'i, kuid keelab webview otseühendused; lokaalne
  mäng ei vaja CSP laiendamist (`src/documentAssembly.ts:172-182`).

### F2 — Kõik production call-site'id

- Külgriba `DshChatView.refresh()` loeb `media/bridge-client.js`, annab selle
  `assembleDocument`-ile ja teab täpset nähtavat `currentSessionId` väärtust
  (`src/dshChatView.ts:201-205,322-365`).
- Editor-tab `DshPanel.refresh()` teeb sama; bound paneel teab konstruktoris
  antud `sessionId` väärtust, unbound paneelil on see `undefined`
  (`src/dshPanel.ts:94-104,211-230,239-266`).
- Muid production `assembleDocument` call-site'e ei ole. Testid kutsuvad seda
  otse erinevate valikuliste kombinatsioonidega
  (`test/documentAssembly.test.js:108-306`).

### F3 — Lifecycle-signaalid on bridge'is juba nähtavad

- Iga hostilt saabunud `ws-frame` antakse esmalt vastavale shim-socketile ja
  seejärel `observeFrame`-ile (`media/bridge-client.js:542-547`).
- Vanas protokollis sisaldavad `host/session-status`, `session/event`,
  `question/requested` ja `approval/requested` kaadrid `sessionId` välja
  (`media/bridge-client.js:396-433`).
- DSH >= 0.1.2 protokollis sisaldab `api-session/status` emit sessiooni ID-d ja
  running-bitti, question/approval waterfall `agentId` väärtust ning
  `session/follow` item `turn/start` / `turn/end` event'i
  (`media/bridge-client.js:436-484`).
- Upstream DSH kood kinnitab, et sündmuse `api-session/status` esimene argument
  on `SessionId`, vaatamata bridge'i vanemale `agentId` kommentaarile
  (`packages/api/session-controller/src/types.ts:592` upstream checkout'is).

### F4 — Uue remote-mux follow-streami saab täpselt scope'ida

- `BridgeWebSocket.send()` annab kogu väljamineva payload'i muutmata hostile,
  kuid ei vaatle seda (`media/bridge-client.js:202-204`).
- DSH connection contract avab loogilise streami kujuga
  `{type:"open", streamId, endpoint:"session/follow", payload:{args:{sessionId}}}`;
  serveri item-kaader kannab sama `streamId` väärtust. Seda kinnitavad upstream
  client-connection testid (`packages/client/connection/tests/client-apply.client.spec.ts:505-519`)
  ja DSHmuxi enda remote-mux kasutus (`src/serverManager.ts:893-940`).
- Seega saab bridge jälgida ainult control-envelope'i metadata koopiat,
  muutmata ega peatamata algset `ws-send` sõnumit, ning siduda incoming
  follow-event'i nähtava sessiooniga socket ID + stream ID võtme kaudu.

### F5 — Olemasolev state ja testiseam

- Completion-sound hoiab `runningBySession` mappi ning deduplikeerib helisid;
  lifecycle'i parsija tunneb juba mõlemat protokolli
  (`media/bridge-client.js:239-247,368-484`).
- `test/bridgeClient.test.js` käivitab päris bridge-skripti fake-window
  keskkonnas ning suudab sisestada legacy ja remote-mux kaadreid
  (`test/bridgeClient.test.js:1-92,242-289`).
- `test/documentAssembly.test.js` kontrollib süstitud skriptide järjekorda,
  session preset'i ja CSP-d; `test/dshChatView.test.js` mock'ib
  `assembleDocument` call'i ja kontrollib valikuid.

### F6 — Teema, overlay ja lifecycle

- Bridge seob DSH semantilised tokenid VS Code'i live CSS muutujatega ning
  kuulab runtime theme message'it (`media/bridge-client.js:43-120,562-579`).
- Külgriba server/session-loading overlay kasutab z-index'i `9999` ja
  `aria-busy` olekut (`src/dshChatView.ts:66-190`); editor-tab server overlay
  kasutab samuti z-index'i `9999` (`src/dshPanel.ts:42-91`).
- Mõlemad pinnad kasutavad `retainContextWhenHidden`; seetõttu peab mäng
  `visibilitychange` ajal ise timer'i peatama (`src/dshChatView.ts:208-214`,
  `src/dshPanel.ts:160-174`).
- Sessiooni vahetus asendab dokumendi ja nullib bridge socketid
  (`src/dshChatView.ts:291-318,366-381`; `src/dshPanel.ts:268-274`).

### F7 — Lokaliseerimine ja pakendamine

- Keskne `STRINGS` tabel nõuab igale võtmele kümmet mitte-tühja keelt ning seda
  jõustab test (`src/i18nStrings.ts:1-19`; `test/i18n.test.js:11-32`).
- `t()` valib aktiivse VS Code'i keele (`src/i18n.ts:1-34`).
- VSIX `files` sisaldab kogu `media/**` puud, seega uus raw-JS fail pakitakse
  ilma package-manifesti faililoendi laienduseta (`package.json:26-40`).

### F8 — Paralleelne feature 07

- `07-ui-improvements` on teises worktree's dokumenteeritud, kuid selle kood ei
  ole käesoleva feature'i baasi merge'itud. Praegune production-fakt on endiselt
  kaks eraldi pinda. Lahendus hoiab mängu document-assembly tasemel, et tulevane
chrome'i ümberpaigutus ei nõuaks mängumootori ümberkirjutamist.

### F9 — Webview state seam

- `media/bridge-client.js` omab ainsat `acquireVsCodeApi()` instantsi, mistõttu
  saab ta anda Mux Trailile kitsad `getState`/`setState` adapterid ilma teist API
  instantsi hankimata.
- VS Code'i state objekt võib tulevikus sisaldada ka teiste komponentide välju;
  Mux Trail peab kirjutamisel säilitama kõik tundmatud top-level väljad.
- Mängumootori olemasolev pure state sisaldab juba kogu taastamiseks vajalikku
  infot: ruudustik, trail, packet, suunad, started/over/won ja score.

### F10 — Ühise mängukasti seam

- `media/mux-trail.js` omab juba lazy dialogi, lifecycle gate'i, storage adapterit
  ja kogu keyboard/focus cleanup'i. Teise mängu lisamine samasse controller'isse
  ei vaja uut assembly-, bridge- ega host-protokolli.
- Dialogi canvas ja footer on controller'i enda DOM; nende kõrvale saab lisada
  tablist'i ning Solitaire'i DOM-board'i upstream DSH selectoreid puudutamata.
- `media/**` on juba VSIX-is ning Unicode'i standardsed mastisümbolid ei vaja
  pilti, fonti ega kolmanda poole asset'it.

## 3. Gap

Praegune bridge oskab küll AI töö algust, lõppu ja inimvastuse vajadust ära
tunda, kuid kasutab neid ainult helideks. Puuduvad:

- visible-session-aware lifecycle projektsioon;
- kolme sekundi viitega vabatahtlik affordance;
- mängumootor ja ligipääsetav overlay;
- lokaliseeritud mängutekstid;
- mõlema pinna script/config wiring;
- mängu-, scoping-, cleanup- ja regressioonitestid.

2026-09-13 jätkuringi gap: elus `game` objekt nullitakse dialogi sulgemisel,
max score'i ei ole ning bridge ei anna mängule VS Code'i state adapterit.

## 4. Call-site audit

Muudatus laiendab `AssembleOptions` contract'i valikuliste väljadega
`muxTrailJs`, `muxTrailStrings` ja `visibleSessionId`. Olemasolevate väljade
semantika ei muutu.

| Call-site | Klassifikatsioon | Põhjus / vajalik muudatus |
|---|---|---|
| `src/dshChatView.ts:346-365` | **compatible** | Annab uue skripti, lokaliseeritud tekstid ja `currentSessionId`; ülejäänud assembly jääb samaks. |
| `src/dshPanel.ts:252-266` | **compatible** | Annab uue skripti, tekstid ja bound `sessionId`; unbound paneeli nähtav ID õpitakse follow-open envelope'ist. |
| `test/documentAssembly.test.js:108-306` | **compatible** | Uued väljad on valikulised; olemasolevad fixture'id jäävad kehtima, lisatakse üks explicit injection-test. |
| `test/dshChatView.test.js:126-226` | **compatible** | Mock võtab juba suvalise options-objekti; lisatakse wiring-assert'id. |

`BridgeWebSocket.prototype.send(data)` avalik käitumine ei muutu: sama string
postitatakse endiselt hostile. Lisandub fail-safe metadata vaatlus enne post'i.
Kõik olemasolevad WebSocket call-site'id ja relay-testid on seega compatible.

## 5. Tasks

### S1 — Originaalne testitav mängumootor ja UI-kontroller

Lisa `media/mux-trail.js` UMD-laadse failina:

- CommonJS export Node testidele;
- browseris automaatne install `window.__DSH_MUX_TRAIL__` privaatse API-na;
- puhtad `createGame`, `queueDirection`, `stepGame`, `spawnPacket` ja
  `speedForScore` funktsioonid;
- eraldi offer-gate, mis omab 3 s timer'it ja idempotentseid begin/end/destroy
  operatsioone;
- DOM controller, mis loob väikese launcheri ja `role="dialog"` overlay;
- canvas renderer: ruutudest rada ja rombikujuline pakett, VS Code theme tokenid,
  device-pixel-ratio ning responsive suurus;
- keyboard, focus, visibility, restart ja cleanup lifecycle;
- kõik game-facing vead püütakse lokaalselt ega levi bridge'i.

Privaatne runtime contract:

```js
window.__DSH_MUX_TRAIL__ = {
  beginWait(sessionId),
  endWait(reason),
  destroy()
}
```

### S2 — Sessioonitäpne lifecycle adapter bridge'is

Muuda `media/bridge-client.js`:

- loe boot-konfist esialgne `visibleSessionId`;
- vaata remote-mux `open` / `cancel` control-envelope'e ning map'i
  `socketId:streamId -> sessionId`;
- saada Mux Trailile `beginWait` ainult nähtava sessiooni running/start puhul;
- saada `endWait` completion/question/approval/follow-cancel/server-not-ready
  puhul;
- legacy payload'id scope'ida nende `sessionId` abil;
- wrapper peab olema `try/catch`-is, et mängu rike ei katkestaks heli ega relay'd.

### S3 — Assembly, mõlemad pinnad ja i18n

- Lisa `src/documentAssembly.ts` valikulised mänguväljad ning süsti
  `media/mux-trail.js` enne bridge-skripti.
- Lisa `src/i18nStrings.ts` Mux Traili tekstid kõigis kümnes keeles ja
  `src/i18n.ts` üks objektikoostaja, et kaks pinda ei dubleeriks key-listi.
- `src/dshChatView.ts` ja `src/dshPanel.ts` loevad uue media-faili ning annavad
  assembly'le tekstid ja nähtava session ID.
- Lisa `CHANGELOG.md` Unreleased/Added kirje.

### S4 — Deterministlikud testid

- Uus `test/muxTrail.test.js`: mootori reeglid, random bounds, offer delay,
  idempotentsus, cleanup ja lähtekoodi accessibility/theme guard'id.
- Laienda `test/bridgeClient.test.js`: visible/background scoping, remote follow
  map, completion/question/approval, server status ja muutmata ws-send.
- Laienda `test/documentAssembly.test.js`: config escaping, mänguskript enne
  bridge'i ja enne upstream module'it.
- Laienda `test/dshChatView.test.js` ning lisa panel/wiring guard, mis tõendab,
  et mõlemad production pinnad kasutavad uut skripti ja session ID-d.

### S5 — Close-out

Käivita compile, kogu unit suite ja VSIX package; kontrolli VSIX sisu. Seejärel
kirjuta `verification.md`, uuenda `plan.md` staatused, genereeri `TODO.md`
ainult `❌`/`⏭️` ridadest ning kirjuta `summary.md`.

### S6 — Sessioonipõhine current state ja max score

- Laienda `media/mux-trail.js` versioonitud snapshot/restore formaadiga ning
  valideeri kõik cell'id, suunad, skoor ja packet enne taastamist.
- Salvesta elus voor pärast suunasisendit ja iga tick'i; salvesta ka automaatse
  või käsitsi sulgemise ja dispose'i eel.
- Kustuta sessiooni resumable snapshot surma/võidu korral, kuid hoia max score.
- Anna bridge'ist `attachStorage({load, save})` adapter, mis kasutab
  `vscode.getState/setState` ning merge'b `dshmuxMuxTrail` välja olemasolevasse
  state'i.
- Kuva lokaliseeritud score real korraga `{score}` ja `{maxScore}`.
- Lisa engine/controller/bridge testid restore'i, death cleanup'i, max score'i
  ja tundmatute webview-state väljade säilimise kohta.

### S7 — Mux Arcade game selector ja Solitaire

- Muuda sama lazy dialog pealkirjaga **Mux Arcade** kastiks ja lisa üles
  ligipääsetav kahe nupuga tablist: Mux Trail / Solitaire.
- Lisa samasse dependency-free runtime'i pure Solitaire engine: Fisher–Yates
  deal, draw-one stock/recycle, tableau/foundation reeglid, flip, win ning
  versioonitud snapshot/restore validation.
- Renderda kaardid DOM button'itena VS Code theme tokenitega; kasuta klõpsa
  source-then-destination mudelit ja top-card double-click foundation shortcut'i.
- Peata Trail tick Solitaire'i valimisel; Solitaire ise ei kasuta loop'i.
- Salvesta sessioonipõhiselt mõlema mängu elus state ja aktiivne tab.
- Laienda typed i18n payload'i ning kõiki kümmet locale'i.
- Lisa deterministic engine, invalid snapshot ja controller tab/state testid.

### S8 — Solitaire'i interaktsiooni ja affordance'i parandused

- Tee iga face-up waste/foundation/tableau kaart native `draggable` elemendiks;
  dragstart seab sama selection mudeli, mida kasutab click-flow.
- Tee tableau pile/empty slot ja foundation-kaart/slot dragover/drop target'iks,
  mis kutsub olemasolevaid pure move-funktsioone.
- Click-flow hoiab ebaõnnestunud move'i korral algse selection'i ning kuvab
  lokaliseeritud invalid-move teate.
- Renderda stock `covered stock` kaardina koos allesolevate kaartide arvuga,
  suurenda kaetud tableau kaartide vertikaalset sammu ja kontrasti.
- Renderda kõik neli tühja foundation'it alati tugeva dashed outline'i ja
  mastisümboliga.
- Laienda fake-DOM testi, et see tõendaks stock back'i, foundation slot'e,
  draggable/drop hook'e ja päris click-source/click-destination move'i.

*Seotud dokumendid: [discussion.md](discussion.md) | [req.md](req.md) | [plan.md](plan.md)*
