# UI session controls — lahendus

**Kuupäev**: 2026-09-13

**Allikad**: [discussion.md](discussion.md), [req.md](req.md)

**Staatus**: ✅ kasutaja kinnitatud (2026-09-13)

## 1. Goal

Laiendada olemasolevat DSHmuxi chat-first chrome'i minimaalse lahendusega, mis:

1. lubab aktiivse sessiooni nime header'is topeltklõpsuga muuta;
2. lisab workspace-püsiva `Pinned` vaate ning pin/unpin toimingu;
3. kasutab DSH olemasolevat `session.search` RPC-d valitavaks logisisu otsinguks;
4. tihendab sessioonipopup'i vertikaalset paigutust;
5. muudab overflow-menüü viimase rea DSH oleku järgi `Start`/`Stop`/`Retry` tegevuseks;
6. tõstab extension'i patch-versiooni `0.4.7` → `0.4.8`;
7. ei too DSHmuxi activation'i või reload'i ajal automaatselt külgribal esiplaanile.

Lahendus ei lisa DSHmuxi oma otsinguindeksit, logiparserit, uut UI-raamistikku ega runtime-sõltuvust.

## 2. Facts

### 2.1 Praegune chrome ja rename

- `src/chatChrome.ts:84-97` renderdab ühe kompaktse header'i järjekorras session-list, new-session, aktiivse sessiooni nimi ja overflow. Nimi on praegu tavaline `div`.
- `media/chat-chrome.js:147-148,230-242` seab header'i nime `textContent` kaudu ning leiab aktiivse sessiooni pealkirja aktiivsete ja arhiveeritud sessioonide koondloendist.
- `media/chat-chrome.js:318-353` sisaldab juba sessioonirea inline rename'i: `Enter` saadab `rename-session`, `Escape` ja blur tühistavad ning `editingSessionId` takistab pollingul aktiivset input'i asendada.
- `src/dshChatView.ts:309-313,400-415` valideerib rename-sõnumi, kutsub managerit, uuendab mõlemat sessioonimassiivi, aktiivse header'i nime ja editor-panel'i hook'i ning postitab edu/vea oleku.
- `src/serverManager.ts:1121-1125` kasutab rename'iks olemasolevat DSH `session.rename` RPC-d.

### 2.2 Sessioonivaated ja pinni salvestus

- `src/chatChrome.ts:99-113` sisaldab otsingut, kahte tab'i (`Active`, `Archived`), staatuseala ja ühte loendit.
- `media/chat-chrome.js:122-127,283-287,355-409` hoiab kahte sessioonimassiivi, valib ühe aktiivse vaate ja ehitab selle read brauseris.
- `src/dshChatView.ts:41-46,84-85,464-493` hoiab workspace'i active/archive sessioone ja saadab need ühe `sessions-snapshot` sõnumiga chrome'ile.
- `src/serverManager.ts:1067-1104` seob sessiooniloendi IDE praeguse workspace'iga ning tagastab aktiivsed ja arhiveeritud kokkuvõtted.
- DSHmuxi manageris ei ole pin/unpin RPC-d ning auditeeritud DSH session-controller'i avalikus lepingus pinni välja ega käsku ei ole.
- `src/extension.ts:20-21,45-67` kasutab sama workspace'i püsioleku jaoks juba `ExtensionContext.workspaceState`-i. `DshChatView` saab `ExtensionContext` objekti konstruktoris (`src/dshChatView.ts:89-95`), seega eraldi storage-teenust ei ole vaja.

### 2.3 Full-text otsingu leping

- Praegune chrome'i otsing on puhas lokaalne tõstutundetu title-filter (`media/chat-chrome.js:24-31,355-367,542-543`).
- DSH session-controller avaldab `session.search` remote-meetodi, mille request on `{ query: string }` (`deepseek-harness/packages/api/session-controller/src/types.ts:251-260`; `src/index.ts:227-235`).
- Vastus on `{ items: [{ sessionId, snippet }], hasMore }`; ühe vastuse piir on 20 sessiooni ja snippet'i piir 240 Unicode code point'i (`types.ts:174-184,256-260`).
- Host otsib ainult `user/message` ja `assistant/message` sündmustest aktiivsel pinnal, ei aktiveeri sessiooni ning tagastab ühe parima vaste sessiooni kohta (`deepseek-harness/packages/api/session-controller/src/list.ts:160-208,233-258`).
- DSH otsing on hostile nähtavate sessioonide põhine, mitte DSHmuxi workspace'i põhine. DSHmuxil on workspace'i lubatud ID-d olemas oma active/archive snapshot'is, seega tulemused tuleb enne webview'sse saatmist selle hulgaga ristata.
- `DshServerManager.api()` juba teisendab `session.*` käsud token-auth Remote kujule `{ args: { request: payload } }`, säilitab legacy fallback'i ainult tõestatud 404 järel ja rakendab 15-sekundilist timeout'i (`src/serverManager.ts:806-880`). Uus `session.search` wrapper saab seda muutmata kasutada.

### 2.4 Tihedus ja DSH protsessimenüü

- Dialoogi padding on 10 px, otsing 32 px kõrge, tab'ide välisvahed 9/7 px ja sessioonirida vähemalt 36 px kõrge (`media/chat-chrome.css:142-208,225-250`).
- Kitsas vaade on juba kaetud `max-width: 280px` media query'ga ning high-contrast ja reduced-motion reeglid on olemas (`media/chat-chrome.css:468-496`).
- Overflow's on üks eraldi `Stop DSH` nupp (`src/chatChrome.ts:115-130`). `applyServerStatus()` näitab seda ainult `ready` olekus (`media/chat-chrome.js:438-450`).
- Overlay'l on eraldi `Start` nupp, mis kuvatakse stopped/error olekus ja mille Doctor-gate on juba rakendatud (`src/chatChrome.ts:132-138`; `media/chat-chrome.js:481-497,552-553`).
- Host käsitleb nii `start` kui `stop` sõnumeid juba olemasoleva state machine'i kaudu (`src/dshChatView.ts:297-302,358-367`).

### 2.5 Tekstid, testid ja versioon

- `src/i18nStrings.ts` on keskne kümne keele stringitabel; `test/i18n.test.js` nõuab igale võtmele kõiki keeli.
- `ChatChromeCopy` ja `ChatChromeInit` on `src/chatChrome.ts:4-50`; neid koostab ainult `DshChatView.chromeCopy()/chromeInit()` ning HTML-testi Proxy aktsepteerib additiivseid võtmeid.
- `test/dshChatView.test.js` sisaldab kontrollitavat managerit, workspaceState stub'i, webview sõnumisilda ning olemasolevaid rename/archive/start/stop teste.
- `test/chatChrome.test.js` kontrollib puhtaid brauseriabilisi, ohutut inline JSON-i ja chrome'i dependency-free omadust; `test/chatViewLayout.test.js` kontrollib header'i järjestust ning responsive/layout lepingut.
- Projekti versioon on `package.json:5` ja package-lock juurversioonid on `package-lock.json:3,9`, kõik `0.4.7`.
- `npm test` kompileerib TypeScripti ja käivitab kogu Node testisuite'i; `npm run compile` on eraldi compile-käsk (`package.json` scripts).

### 2.6 Activation ja külgriba fookus

- `package.json:160` aktiveerib extension'i sündmusega `onStartupFinished`, seega käib `activate()` ka VS Code'i akna või extension host'i reload'i järel.
- `src/extension.ts:162-170` registreerib ühe `DshChatView` provider'i ja kutsub seejärel tingimusteta `revealChat()`, mis käivitab VS Code'i genereeritud `dshmux.chat.focus` käsu. See muudab külgriba valikut sõltumata kasutaja eelmisest aktiivsest vaatest.
- `src/extension.ts:130-151` loob sama `revealChat` callback'i ja annab selle `registerCommands()` funktsioonile.
- `src/commands.ts:20-27` kutsub callback'i ainult pärast kasutaja otsese `dshmux.start` käsu edukat lõppu; see teadlik fookuse muutus vastab olemasolevale käsukäitumisele.
- `src/extension.ts:80-119` võib DSH protsessi ja workspace'i sessiooni reload'i järel taustal taastada, kuid see rada ei vaja webview fookustamist.
- `test/chatViewLayout.test.js:53-65` nõuab praegu automaatset reveal'i pärast provider'i registreerimist ning kodeerib seega soovimatu käitumise regressioonilepinguna.

## 3. Gap

| Nõue | Praegune lünk |
|---|---|
| R1 | Header'i nimele puudub edit-interaktsioon ja eraldi header-rename olek. |
| R2 | Puuduvad Pinned-tab, pin/unpin tegevus, pinni ID-de snapshot ja püsisalvestus. |
| R3 | Browser filtreerib ainult pealkirja; manageril ja view-hostil puudub `session.search` wrapper ning async request/result sõnumivoog. |
| R4 | Olemasolevad popup'i kontrollid ja 36 px read on kasutaja soovitud tiheduse jaoks liiga kõrged. |
| R5 | Overflow protsessinupp kaob stopped/error olekus ega muutu Start/Retry tegevuseks. |
| R6 | Manifestid on versioonil 0.4.7 ja uutele tekstidele/testidele pole veel katet. |
| R7 | `activate()` kutsub iga startup/reload järel `dshmux.chat.focus` ning varastab Codexi, Copiloti või muu aktiivse külgribavaate fookuse. |

Üks upstream piirang jääb teadlikult alles: DSH tagastab maksimaalselt 20 hostile nähtavat sessiooni enne DSHmuxi workspace-filtrit. Lahendus ei saa garanteerida, et väga suure mitme-workspace'i andmestiku iga võimalik vaste jõuab sellesse esimesse 20 hulka, ilma DSH serveri muutmise või oma logiindeksita. UI kuvab `hasMore` teate ning scope'i järgi keelatud tulemusi ei lekita.

## 4. Call-site audit

### 4.1 `DshServerManager.api()`

Selle privaatset signatuuri ega käitumist ei muudeta. Lisatakse ainult avalik `searchSessions(query)` wrapper, mis kutsub `api("session.search", { query })`.

Olemasolevad call site'id (`ensureWorkspaceSession`, `listWorkspaceSessions`, `createSession`, `workspaceIdFor`, `renameSession`, `archiveSession` ja muud manageri sisekutsed) jäävad muutmata ning on **compatible**.

### 4.2 `ChatChromeCopy` ja `ChatChromeInit`

| Call site | Klassifikatsioon | Põhjus |
|---|---|---|
| `src/dshChatView.ts:211-270` | compatible | Koostaja saab uued i18n stringid ja pinned ID-d additiivselt kaasa anda. |
| `test/chatChrome.test.js:52-65` | compatible | Test kasutab copy Proxy't; init'i uued optional/defaultitavad väljad ei lõhu serialiseerimist. |
| `src/chatChrome.ts:77-142` | compatible | Sama HTML-koostaja laiendatakse uute elementidega; funktsiooni signatuur ei muutu. |

### 4.3 Webview sõnumileping

Olemasolevaid sõnumeid ei muudeta. Lisatakse additiivselt:

```ts
// webview -> extension host
{ type: "toggle-pin"; sessionId: string }
{ type: "search-sessions"; requestId: number; query: string }

// extension host -> webview
{
  type: "sessions-snapshot";
  items: ChromeSession[];
  archivedItems: ChromeSession[];
  pinnedSessionIds: string[];
  currentSessionId?: string;
  error?: string;
}
{
  type: "session-search-result";
  requestId: number;
  items: Array<ChromeSession & { snippet: string }>;
  hasMore: boolean;
  error?: string;
}
```

| Tarbija | Klassifikatsioon | Põhjus |
|---|---|---|
| `DshChatView.handleMessage()` | compatible | Switch saab kaks uut case'i; tundmatute sõnumite senine ignoreerimine säilib. |
| `media/chat-chrome.js` message listener | compatible | Lisandub üks vastusetüüp; olemasolevad status/snapshot/operation teed säilivad. |
| `test/dshChatView.test.js` fake webview | compatible | Sõnumid on tavalised objektid; stub'i signatuuri pole vaja muuta. |

### 4.4 `DshChatView` konstruktor

Konstruktori signatuur ei muutu. Pinni olek loetakse juba olemasolevalt `context.workspaceState` objektilt. `src/extension.ts:137-140` ja kõik `test/dshChatView.test.js` konstruktorikutsed on **compatible**.

### 4.5 `revealChat` call site'id

Callback'i signatuuri ega käsu nime ei muudeta.

| Call site | Klassifikatsioon | Põhjus |
|---|---|---|
| `src/extension.ts:147` | compatible | Callback antakse endiselt `registerCommands()` funktsioonile. |
| `src/commands.ts:26` | compatible | Kasutaja otsene `DSHmux: Start` käsk võib pärast edukat starti DSHmuxi avada; kutse jääb alles. |
| `src/extension.ts:170` | conflict | Tingimusteta activation-kutse muudab külgriba ka reload'il; see kutse eemaldatakse. |
| `test/chatViewLayout.test.js:53-65` | conflict | Test nõuab soovimatut automaatset reveal'i; see asendatakse fookuse säilitamise lepinguga. |

R1–R6 lepingutes konfliktset call site'i ei leitud. R7 kaks konflikti lahendatakse ilma `revealChat` callback'i või command API muutmiseta.

## 5. Tasks

### T1 — DSH full-text wrapper ja hostipoolne filtreerimine

**Failid**: `src/serverManager.ts`, `src/dshChatView.ts`

- Lisada kitsas `SessionSearchResult` tüüp ja `DshServerManager.searchSessions(query)` wrapper olemasolevale `session.search` RPC-le.
- Valideerida/normaliseerida RPC vastuseks ainult stringist `sessionId` ja `snippet` ning boolean `hasMore`.
- Lisada `DshChatView` sõnumikäitlus, mis kutsub wrapperit ja ristab tulemused `sessions + archivedSessions` ID-dega.
- Lisada tulemusele olemasolevast snapshot'ist title, updatedAt ja archived metaandmed.
- Tagastada sama `requestId`; brauser aktsepteerib ainult uusima päringu vastust.
- Otsingu viga tagastada sama vastusesõnumi `error` väljana ilma sessioonisnapshot'i rikkumata.

### T2 — Workspace-püsiv pinned olek

**Fail**: `src/dshChatView.ts`

- Lisada konstantne workspaceState võti ja konstruktoris rangelt valideeritud unikaalne pinned ID-de massiiv.
- Lisada `toggle-pin` sõnumikäitlus: olemasolev ID eemaldatakse, uus ID lisatakse pinni järjekorra algusse.
- Pärast edukat `workspaceState.update()` kutset saata värske snapshot; vea korral hoida eelmine olek ja postitada operatsiooniviga.
- Eduka session poll'i järel jätta nähtavaks ainult ID-d, mis kuuluvad current workspace'i active/archive koondisse; aegunud ID-de muutus salvestada üks kord.
- Lisada `pinnedSessionIds` init'i ja igasse snapshot'i.

### T3 — Header rename ning Pinned UI

**Failid**: `src/chatChrome.ts`, `media/chat-chrome.js`, `media/chat-chrome.css`

- Muuta header'i title ligipääsetavaks rename-sihtmärgiks ning lisada topeltklõpsul samasse alasse input.
- Kasutada sama `rename-session` sõnumit, Enter/Escape semantikat ja pending kaitset nagu rearenames; header'i `setTitle()` ei tohi aktiivset edit-input'i pollinguga asendada.
- Lisada `Pinned` tab esimeseks ning valida popup'i avamisel Pinned ainult siis, kui sellel on nähtavaid kirjeid.
- Koostada pinned read active/archive koondist `pinnedSessionIds` järjekorras.
- Lisada igale reale pin/unpin ikoontegevus, mis peatab rea open-click'i ja näitab pending olekut.
- Säilitada Active/Archived vaadetes pinned sessioonid ning näidata pinned-vaates vajadusel archived oleku vaikset semantilist märget.

### T4 — Full-text checkbox ja async tulemused

**Failid**: `src/chatChrome.ts`, `media/chat-chrome.js`, `media/chat-chrome.css`

- Lisada otsingurea lõppu native checkbox koos tekstlabel'iga.
- Checkbox väljas kasutada muutmata title-filtrit valitud tab'is.
- Checkbox sees ja mittetühja päringu korral rakendada lühike debounce, genereerida kasvav `requestId` ja saata `search-sessions`.
- Tühja päringu või checkbox'i väljalülitamise korral tühistada loogiliselt aktiivne request ning renderdada tavavaade.
- Aktsepteerida ainult uusima `requestId` tulemus; näidata vahepeal loading-olekut.
- Renderdada DSH snippet alati `textContent` kaudu ning grupeerida tulemused Pinned → Active → Archived, ilma pinned duplikaadita.
- Näidata `hasMore` ja error infot sessioonipopup'i olemasolevas live status alas.

### T5 — Kompaktne layout ja dünaamiline protsessirida

**Failid**: `src/chatChrome.ts`, `media/chat-chrome.js`, `media/chat-chrome.css`

- Tihendada dialoogi padding'ut, otsingukontrolle, tab'ide vahesid ja sessioonirea `min-height` väärtuseks kuni 32 px.
- Paigutada checkbox kitsas vaates wrap'itavalt nii, et popup ise ei saaks horisontaalset scrollbar'i.
- Asendada eraldi hidden Stop-nupp ühe viimase `dshmux-process-action` reaga.
- `applyServerStatus()` seab selle teksti, käsu ja disabled oleku: ready=stop, stopped=start, error=retry/start või Doctor, starting/stopping=disabled progress.
- Jätta overlay start/retry/Doctor tee muutmata.

### T6 — I18n

**Failid**: `src/i18nStrings.ts`, `src/dshChatView.ts`

- Lisada vähemalt `Pinned`, `Pin`, `Unpin`, `Full text search`, otsingu loading/more-results ja `Retry DSH` tekstivõtmed.
- Täita kõik olemasolevad kümme keelt, nagu i18n tabel ja test nõuavad.
- Viia uued võtmed `ChatChromeCopy` kaudu brauserisse; hard-coded kasutajatekste ei lisata.

### T7 — Testid ja regressioonikate

**Failid**: `test/serverManager.test.js`, `test/dshChatView.test.js`, `test/chatChrome.test.js`, `test/chatViewLayout.test.js`

- Testida `session.search` remote/legacy envelope'i, tulemuse normaliseerimist ja `hasMore` väärtust.
- Laiendada fake workspaceState'i päriselt väärtusi hoidvaks stub'iks ning testida pin/unpin püsivust, järjekorda, aegunud ID eemaldamist ja workspace'i filtrit.
- Testida hosti full-text mapping'ut, teise workspace'i tulemuse eemaldamist, snippet'i säilimist ja vea vastust.
- Eksportida brauserifailist ainult väikesed puhtad abifunktsioonid, millega testida pinned-järjestust, full-text gruppide deduplikatsiooni, request-ID värskust ja protsessimenüü olekut.
- Laiendada HTML/CSS contract-teste header rename'i sihtmärgi, kolme tab'i, checkbox'i, kuni 32 px rea, responsive ning viimase protsessirea jaoks.
- Käivitada kogu `npm test` ja eraldi `npm run compile`.

### T8 — Kohustuslik patch version bump

**Failid**: `package.json`, `package-lock.json`

- Muuta extension'i versioon `0.4.7` pealt `0.4.8` peale mõlemas manifestis.
- Kontrollida, et muud package metadata ega sõltuvused ei muutunud.

### T9 — Activation ei fokuseeri DSHmuxi automaatselt

**Failid**: `src/extension.ts`, `test/chatViewLayout.test.js`

- Eemaldada `activate()` lõpus olev tingimusteta `revealChat()` ja selle eksitav kommentaar.
- Jätta provider'i registreerimine, taustal auto-restart ning `revealChat` callback muutmata.
- Jätta `dshmux.start` kasutajakäsu järel tehtav `revealChat()` alles.
- Asendada vana layout-test regressioonitestiga, mis keelab activation'i automaatse reveal'i ja kinnitab otsese Start-käsu reveal'i säilimise.

## 6. Muudatuste voog

```text
header dblclick ───────────────┐
row rename ───────────────────┴─> rename-session -> DshChatView -> session.rename

pin/unpin -> toggle-pin -> workspaceState -> sessions-snapshot -> Pinned/Active/Archived

search input + checkbox
  -> debounce + requestId
  -> search-sessions
  -> DshServerManager.session.search
  -> current-workspace ID filter
  -> session-search-result(requestId)
  -> latest-only grouped render

server-status -> one overflow process row -> start | stop | retry/Doctor | disabled progress

activation/reload -> register provider + optional background auto-restart -> keep VS Code sidebar selection
explicit DSHmux: Start -> start manager -> reveal DSHmux chat
```

## 7. Failimuudatuste kokkuvõte

| Fail | Muudatus |
|---|---|
| `src/serverManager.ts` | `session.search` tüüp ja wrapper. |
| `src/dshChatView.ts` | pinned persistence, otsingu host-flow, snapshot/copy/init laiendused. |
| `src/chatChrome.ts` | Pinned-tab, checkbox, dünaamiline process action ja ligipääsetav title markup. |
| `media/chat-chrome.js` | rename, pin, async full-text, grouped render ja olekupõhine menüü. |
| `media/chat-chrome.css` | kompaktsem, responsive ning uute elementide stiil. |
| `src/i18nStrings.ts` | uued tõlked kõigis toetatud keeltes. |
| `test/serverManager.test.js` | RPC wrapperi testid. |
| `test/dshChatView.test.js` | persistence, filtering ja message-flow testid. |
| `test/chatChrome.test.js` | puhaste chrome-olekute ja markup'i testid. |
| `test/chatViewLayout.test.js` | paigutuse, tiheduse ja activation'i fookuse säilitamise regressioonileping. |
| `src/extension.ts` | eemaldab activation'i tingimusteta chat-focus kutse. |
| `package.json`, `package-lock.json` | kohustuslik versioon `0.4.8`. |

*Seotud dokumendid: [discussion.md](discussion.md) | [req.md](req.md) | plan.md*
