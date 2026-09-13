# UI improvements — lahendus

**Kuupäev**: 2026-09-13

**Allikad**: [discussion.md](discussion.md), [req.md](req.md), lähtekoodi ja testide audit

**Staatus**: ✅ kasutaja kinnitatud (2026-09-13)

## 1. Goal

DSHmuxi külgriba viiakse kahe üksteise kohal oleva webview asemel üheks chat-first `dshmux.chat` vaateks. Selle webview ülaservas on kuni 44 px kompaktne header aktiivse sessiooni nime ning kolme ikoontegevusega; kohe selle all täidab olemasolev DSH chat kogu ülejäänud ruumi. Otsitav sessioonivalik, overflow-menüü ning stopped/error/loading olekud kuvatakse sama dokumendi ajutiste kihtidena.

```text
VS Code activity container: DSHmux
└─ dshmux.chat (ainus contributed WebviewView)
   └─ webview document
      ├─ ≤44 px header: sessiooni nimi + [sessions] [+] […]
      ├─ olemasolev embed'itud DSH Web UI kogu ülejäänud kõrguses
      ├─ ajutine otsitav session-picker dialog
      ├─ ajutine overflow/status menu
      └─ server/loading overlay
```

### 1.1 Valitud vastutusjaotus

| Osa | Vastutus | Miks see on KISS |
|---|---|---|
| `DshChatView` | Ühe vaate elutsükkel, serveri olek, sessioonitoimingud, pollimine ja host↔webview sõnumid | Launcheri ja chati kaks paralleelset controller'it asenduvad ühe autoriteetse vooga. |
| `chatChrome.ts` | Puhas, VS Code'ist sõltumatu HTML-konfiguratsiooni koostaja kompaktse header'i, overlay ja popup'ide jaoks | Ei kasvata `dshChatView.ts` faili uueks HTML/CSS/JS monoliidiks; väljund on lihtne eraldi testida. |
| `chat-chrome.css` | Ainult DSHmuxi ≤44 px header'i, overlay ja popup'ide VS Code tokenitel põhinevad stiilid | Stiilid ei ole TypeScripti template-stringis ega dubleeru launcheri CSS-iga. |
| `chat-chrome.js` | Ainult header'i/popup'ide DOM, otsing, klaviatuur/fookus ja host-sõnumid | Ei sisalda serveri- ega sessiooniäriloogikat; framework'i ega uut runtime dependency't pole. |
| Olemasolevad teenused | `DshServerManager`, Doctor, update-check, `BridgeHost`, `assembleDocument`, `SessionPanelManager` | Nende lepingud juba katavad vajaliku funktsionaalsuse ja jäävad autoriteetseks. |

Uusi üldotstarbelisi base-class'e, store'e, event bus'e ega disainisüsteemi ei lisata. `src/launcherView.ts` eemaldatakse, mitte ei peideta ega säilitata teise UI-teena. Uue koodi mahu vastu eemaldatakse launcheri umbes 730-realise renderduse ja selle eraldi testijuhtmestiku maht; tegelik netomuutus auditeeritakse `verification.md`-s.

### 1.2 Kompaktne header

VS Code'i native view-header jääb staatiliseks `DSHmux` sektsiooniks. Selle all on webview enda üks kuni 44 px rida, sest nii saab täita kinnitatud popup'i fookuselepingu: otsingule fookuse andmine ja dialoogi sulgemisel fookuse tagastamine täpselt sessions-nupule toimub ühe dokumendi sees. Auditeeritud `WebviewView` API oskab vaadet näidata/fookustada, kuid ei paku meetodit konkreetse native title-action'i fookustamiseks.

| Header'i osa | Käitumine |
|---|---|
| Aktiivse sessiooni pealkiri | Kasutab `sessionTitleOf` fallback'i, ellipsiseerub ja saab ülejäänud laiuse. |
| Sessions ikoon | Avab/sulgeb otsitava dialoogi; sulgemisel saab sama nupp fookuse tagasi. |
| New session ikoon | Loob ühe sessiooni; jääb nähtavaks, kuid on request'i ajal disabled + `aria-busy`. |
| Overflow `…` ikoon | Avab väikese menüü; sisaldab `Open in editor`, Settings, Doctor, status/versions, ready korral Stop ning saadaolevad latest/next update'id. |

Header kasutab natiivseid VS Code theme tokeneid, päris `<button>` elemente ja Codiconi-laadseid inline SVG-sid. Eraldi icon library't ei lisata. Command Palette'i olemasolevad start/stop/Doctor/open käsud säilivad, kuid header'i interaktsioonid kasutavad juba olemasolevat webview → host sõnumimustrit ega vaja manifesti uusi UI käske või context key'sid.

### 1.3 Sessioonide andmevoog

```text
view nähtav + server ready
        │
        ├─ kohe / iga 5 s ──> listWorkspaceSessions(workspaceRoot)
        │                         │
        │                         ├─ map: sessionTitleOf(...)
        │                         ├─ sort: updatedAt kahanevalt
        │                         └─ cache DshChatView sees
        │
sessions button ──> ava kohe + värske fetch ──> sessions-snapshot ──> popup
                                                     │
                    open / rename / archive / new <──┘
                                                     │
                                  DshServerManager API
                                                     │
                          cache + title + chat refresh
```

- Poller töötab ainult siis, kui view on olemas, nähtav ja server `ready`; re-entry guard takistab kattuvaid päringuid.
- Suletud popup'i DOM-i iga polli järel ümber ei renderdata. Cache'i kasutatakse header'i pealkirja hoidmiseks; snapshot saadetakse chrome'ile alglaadimisel, popup'i avamisel ja muutuse järel.
- `sessionTitleOf(title, cwd, sessionId)` jääb üheks fallback-pealkirja reegliks; blank sessioon kasutab lokaliseeritud `sessions.newSession` nime.
- Uue sessiooni hostipoolne `pending` lipp blokeerib topeltkäivituse; sama olek lülitab header'i nupu disabled/pending režiimi. Vea korral jäävad senine session ID ja dokument muutmata.
- Rename uuendab cache'i, header'i title't ja avatud editor-paneeli pealkirja. Archive kasutab senist backend-semantikat, eemaldab rea aktiivloendist ning sulgeb sama sessiooni editor-paneeli.
- DSH Web UI võib sessiooni muuta ka enda sees. `chat-chrome.js` jälgib kitsalt ainult `localStorage` võtit `dsh.sessions.current` ning saadab `active-session-changed` teate. Ta ei muuda kirjutatavat väärtust ega upstreami storage-semantikat. Nii ei jää header'i pealkiri embed'itud chati tegelikust sessioonist maha.

### 1.4 Host↔webview leping

Olemasolev `server-status` ja `session-loading` leping säilib. DSHmuxi chrome lisab järgmised kitsad sõnumid.

Host → webview:

| Tüüp | Payload | Eesmärk |
|---|---|---|
| `chrome-ready` vastusena saadetavad hetkeseisud | olemasolev `server-status`, Doctori readiness ja vajadusel session snapshot | Pärast HTML laadimist ei sõltu UI enne listener'i valmimist saadetud sõnumist. |
| `sessions-snapshot` | `{ items, archivedItems, currentSessionId, error? }` | Avatud popup'i täielik, workspace'i-põhine hetkeseis. Üks item on `{ sessionId, title, updatedAt, archived }`. |
| `session-operation` | `{ operation, state, sessionId?, message? }` | `new`/`rename`/`archive` pending, success või lokaliseeritud error. |
| `status-detail` | `{ state, extensionVersion, dshVersion, message? }` | Overflow-käsu nõudmisel kuvatav kompaktne detail; ready-pinnal seda pole. |

Webview → host:

| Tüüp | Payload | Hostitoiming |
|---|---|---|
| `chrome-ready` | `{}` | Saada praegune serveri/Doctori seis; väldib laadimisrassi. |
| `refresh-sessions` | `{}` | Uuenda cache ja snapshot. |
| `new-session` | `{}` | Loo üks workspace'i sessioon pending guard'i kaudu. |
| `open-session` | `{ sessionId }` | Sulge popup ja `loadSession(sessionId)`. |
| `rename-session` | `{ sessionId, title }` | Valideeri olemasoleva manageri kaudu, uuenda cache/title/panel. |
| `archive-session` | `{ sessionId }` | Kasuta olemasolevat archive API-t ja sulge seotud editor-paneel. |
| `active-session-changed` | `{ sessionId }` | Uuenda hosti current ID ja header'i title ilma dokumenti uuesti laadimata. |
| `start`, `stop`, `open-in-editor`, `open-settings`, `open-doctor` | `{}` | Header/overlay suunab toimingu olemasolevasse hostiteenusesse. |
| `show-status` | `{}` | Saada extension/DSH versioonid ja protsessi olek nõudmisel. |
| `upgrade` | `{ channel: "latest" | "next" }` | Käivita olemasolev ohutu `showUpgradeOptions` valitud kanalile. |

Kõik ID-d ja pealkirjad pannakse DOM-i `textContent`/element property kaudu, mitte HTML-stringina. Rename/archive ridade puhul kasutatakse päris nuppe ja nimetatud `aria-label` väärtusi. Dialoog rakendab `role="dialog"`, otsingul on label, aktiivsel real `aria-current`, klaviatuuril nooled/Enter/Escape ning sulgemisel taastatakse fookus samas dokumendis olevale sessions-nupule.

### 1.5 Serveri olek ja restart

- `ready`: overlay on peidus; Start/Stop/versioonid ei võta webview ruumi.
- `stopped`: overlay näitab `Start DSH` põhitegevust.
- `starting` ja `stopping`: overlay on `aria-busy`, kuvab progressi ja ei näita dubleerivat tegevust.
- `error`: lühike viga ning Start/Retry ja `Open Doctor`; kui Doctor raporteerib puuduva sõltuvuse, on Doctor esmane.
- `DshChatView` märgib assemble'i mitte-ready üleminekul vananenuks. Uue `ready` korral assemble'itakse dokument uuesti, sest server URL/port võib olla muutunud.
- Sama restart-blast-radius kehtib olemasolevale editor-tab `DshPanel`-ile: ready üleminekul refresh'itakse avatud paneel, et see ei jääks vana loopback pordi külge.

### 1.6 VS Code API instance

Praegu kutsuvad samas assemble'itud dokumendis nii `media/bridge-client.js` kui injekteeritud status-chrome `acquireVsCodeApi()`. Lahendus loob ühe dokumendipõhise singleton'i `window.__DSHMUX_VSCODE_API__`: bridge-client kasutab olemasolevat väärtust või omandab selle ühe korra; chat chrome kasutab sama väärtust. Eraldiseisev placeholder omandab API ise, sest seal bridge-client'i ei laadita. See ei muuda `BridgeHost` transport-protokolli.

### 1.7 Alternatiivid, mida ei valitud

| Alternatiiv | Põhjus |
|---|---|
| Launcher collapse'ida, kuid alles jätta | Säilitab kaks native section-header'it ja kaks controller'it; ei täida R1/R8. |
| Panna sessiooni nimi ja tegevused native view-title ribale | Säästaks kuni 44 px, kuid native action → in-view dialog piiril ei saa API-ga fookust avamisnupule taastada ega new-session pending-nuppu usaldusväärselt samas kohas disabled olekus hoida; ei täida R2–R4 a11y lepingut. |
| Kasutada sessioonide jaoks VS Code QuickPick'i | Lihtne tehniliselt, kuid ei täida kinnitatud Codexi-laadse in-view popup'i nõuet R3. |
| Lisada React/Vue või oma disainisüsteem | Väikese overlay jaoks ebaproportsionaalne ja vastuolus R8-ga. |
| Muuta upstream DSH UI-d | Väljub kinnitatud scope'ist N1 ning muudaks uuendused hapraks. |

### 1.8 Kinnitatud R9 addendum — DSH vasaku külgriba toggle

DSHmuxi overflow saab ühe browser-local toggle'i. Vaikeseis on peidetud ja kasutaja valik säilib olemasolevas VS Code webview state'is. Hostile uut sõnumit, command'i ega backend-state'i ei lisata.

Teostus liigub `[data-shell-overlay]` ankrust üles ja valib ainult lähima esivanema, mille inline `grid-template-columns` algab pikslites vasaku track'iga. Alles pärast seda kontrolli märgib JS konkreetse esimese grid-lapse ja vasaku resize-handle'i ning muudab esimese track'i `0px`-iks. Algne või DSH poolt hiljem uuesti arvutatud template säilitatakse taastamiseks. Väike `MutationObserver` jälgib pärast shelli leidmist ainult shelli `style` atribuuti; chati subtree/streaming'ut ei jälgita. Kui kontrollitud grid'i ei leita, ei peideta midagi. Nii ei saa versioonierinev wrapper kogu chati peita ning kolmas ehk DSH parempoolne track jääb muutmata.

## 2. Facts

### 2.1 Praegune UI ja host

| ID | Kontrollitud fakt | Tõend |
|---|---|---|
| F1 | Manifest paneb samasse activity container'isse kaks webview'd: `dshmux.view` ja `dshmux.chat`; eraldi header'id tulenevad sellest struktuurist. | `package.json:123-147` |
| F2 | Launcher sisaldab logo, nime, extension/DSH versiooni, staatust, new/stop/overflow tegevusi, upgrade-rida ja püsivat sessiooniloendit ühes suures HTML/CSS/JS template-stringis. | `src/launcherView.ts:39-482` |
| F3 | Launcher omab eraldi Doctori cache'i, auto-start gate'i, session-poller'it ja kõigi sessioonitoimingute message-router'it. | `src/launcherView.ts:484-732` |
| F4 | `extension.ts` ehitab launcheri jaoks eraldi create/open/rename/archive callback'id ning registreerib kaks view provider'it. | `src/extension.ts:152-211` |
| F5 | Auditeeritud `WebviewView` API pakub title/description/badge, visibility sündmust ja `show(preserveFocus?)` meetodit, kuid mitte konkreetse native title-action'i fookuse juhtimist. | installitud `@types/vscode/index.d.ts:10227-10292` |

### 2.2 Chat, embed ja transport

| ID | Kontrollitud fakt | Tõend |
|---|---|---|
| F6 | `DshChatView` on juba primary surface, hoiab current session ID-d, re-assemble'ib sessioonivahetusel ning kaitseb kattuvate refresh'ide eest järjestusloenduriga. | `src/dshChatView.ts:193-323,329-381` |
| F7 | Sama klassis olev inline chrome katab stopped/starting/error/session-loading olekuid, kuid `stopping` tekstiharu puudub ja template sisaldab oma `acquireVsCodeApi()` kutset. | `src/dshChatView.ts:41-190` |
| F8 | Manageri ready-handler refresh'ib chati ainult juhul, kui `assembled` on false; stop ei nulli seda lippu. Manuaalse stop→start järel võib vana serveri dokumendi refresh vahele jääda. | `src/dshChatView.ts:214-220` |
| F9 | `assembleDocument` toetab juba session preset'i ja suvalise `chromeHtml` lisamist `</body>` ette; uut assemble-lepingut pole vaja. | `src/documentAssembly.ts:47-52,254-274` |
| F10 | `media/bridge-client.js` omandab VS Code API ning teostab olemasoleva fetch/websocket/clipboard/theme/sound silla. | `media/bridge-client.js:12-23,25-594` |
| F11 | `BridgeHost` filtreerib oma transpordisõnumeid eraldi listener'is; tundmatud DSHmuxi UI sõnumid ei muuda bridge'i käitumist. | `src/bridgeHost.ts:30-116` |
| F12 | Editor-tab kasutab sama assemble/chrome mustrit ja saadab manageri state'i overlay'le, kuid ei refresh'i automaatselt uue ready URL-i järel. | `src/dshPanel.ts:56-90,105-143,225-267` |

### 2.3 Olemasolevad teenused, mida taaskasutatakse

| ID | Kontrollitud fakt | Tõend |
|---|---|---|
| F13 | `listWorkspaceSessions` tagastab aktiivse workspace'i aktiivsed ja arhiveeritud `SessionSummary` kirjed; create, rename ja archive API-d on juba olemas. | `src/serverManager.ts:53-63,1073-1138` |
| F14 | `ensureWorkspaceSessionResilient` lahendab/retry'b workspace'i sessiooni ready järel ning seda kasutab extensioni ready-flow. | `src/serverManager.ts:1010-1065`; `src/extension.ts:81-105` |
| F15 | `sessionTitleOf` rakendab durable title → cwd basename → session ID fallback'i. | `src/workspaceTracker.ts:41-58` |
| F16 | `runDoctorForLauncher` annab bounded readiness raporti; `runDoctorCommand` oskab pärast repair'i callback'i käivitada. Selle teenuse käitumist ei ole vaja muuta. | `src/installService.ts:82-104,501-545` |
| F17 | `checkForUpdates`, `upgradeInfo` ja `showUpgradeOptions` katavad 24 h cache'i, latest/next nähtavuse ning ainult terminali eeltäitmise. | `src/versionCheckService.ts:37-118,121-175` |
| F18 | `SessionPanelManager` avab sessiooniga editor-tab'i ning oskab rename'i korral title't uuendada ja archive'i korral paneeli sulgeda. | `src/sessionPanels.ts:1-80` |
| F19 | Runtime i18n tabelis on kümme keelt ja parity test nõuab kõigile samu võtmeid. Manifesti lokaliseeringud on praegu ainult vaikimisi ja zh-cn failis. | `src/i18n.ts:1-60`; `src/i18nStrings.ts:1-817`; `test/i18n.test.js:1-54`; `package.nls.json`; `package.nls.zh-cn.json` |

### 2.4 Testide praegune leping

| ID | Kontrollitud fakt | Tõend |
|---|---|---|
| F20 | Layout-test nõuab praegu launcheri paiknemist chati kohal; see on uue R1-ga otseses konfliktis. | `test/chatViewLayout.test.js:16-35,75-112` |
| F21 | Launcheri testid katavad Doctor gate'i, state handshake'i ja auto-starti; neid ei tohi lihtsalt kaotada, vaid asjakohane käitumine liigub chat-view testidesse. | `test/dshLauncher.test.js:1-191` |
| F22 | Chat-view testid katavad assemble'i, preset'i, loading'u, sama sessiooni no-op'i ja refresh-rassi. | `test/dshChatView.test.js:1-224` |
| F23 | Bridge-client'il, document assembly'l, installil ja manageri sessiooni API-del on eraldi testid, mille lepingud peavad jätkuvalt läbima. | `test/bridgeClient.test.js`; `test/documentAssembly.test.js`; `test/installService.test.js`; `test/serverManager.test.js` |
| F24 | DSH `AppFrame` renderdab inline kolme track'iga grid'i järjekorras sidebar, center, rightbar ning lisab `data-shell-overlay` ankru sama frame'i otseseks lapseks. | `/Users/mati/proj/deepseek-harness/packages/client/ui-layout/src/client/AppFrame.tsx:194-231` |
| F25 | DSH vasak sidebar on frame'i esimene renderdatud element; `DocumentTitle` tagastab `null`. Vasaku resize-handle'i semantiline atribuut on `data-side="sidebar"`. | `/Users/mati/proj/deepseek-harness/packages/client/ui-layout/src/client/AppFrame.tsx:47-77,215-229`; `DocumentTitle.tsx:19-34` |
| F26 | DSH collapsed olek jätab 56 px rail'i alles; see ei ole täielik peitmine. | `/Users/mati/proj/deepseek-harness/packages/client/ui-sidebar/src/client/contract/slots.ts:104-106`; `SidebarRoot.module.css:1-28` |

## 3. Gap

| Nõue | Praegune olukord | Lahendusega suletav vahe |
|---|---|---|
| R1 | Kaks contributed view'd ja püsiv launcher suruvad chat'i alla. | Üks `dshmux.chat`; üks ≤44 px header + kohe ülejäänud kõrguse chat. |
| R2 | Aktiivne pealkiri puudub; tegevused on launcheri tekstinupud/custom menu. | Üks compact row tegeliku title'i ning sessions/new/overflow ikoonidega. |
| R3 | Sessioonid on alati nähtav staatiline loend ilma otsingudialoogita. | Ajutine otsitav, klaviatuuriga juhitav in-view dialog aktiivse/arhiivi jaotusega. |
| R4 | New session töötab, kuid pending guard puudub ja nupp asub launcher'is. | Header'i ühe sammu nupp + host pending guard + popup empty-state tegevus. |
| R5 | Ready/status/versioon/Stop/update on püsivalt esiplaanil. | Ready on vaikne; Stop/version/update compact overflow's, probleemseisund chati overlay's. |
| R6 | Launcher on responsive osaliselt, kuid uus dialog/header a11y leping puudub. | Tokenipõhine header/dialog koos kontrollitava focus/keyboard/HC/reduced-motion käitumisega. |
| R7 | Põhifunktsioonid on olemas, kuid UI ümbertõstmine ja stop→start vajavad regressioonikaitset. | Teenuste lepingud jäävad; tests migrate; mõlemad chatipinnad refresh'ivad uue ready serveri järel. |
| R8 | Launcher koondab umbes 730 rida template'i/controller'it paralleelselt chat-view'ga. | Launcher kustutatakse; kolm kitsast UI artefakti ja üks host-controller, ilma uue sõltuvuseta. |
| R9 | DSH responsive collapse jätab 56 px valge rail'i ning DSHmuxil puudub täieliku peitmise valik. | Muuta ainult esimene shell-track nulliks, peita vasak occupant/handle ja säilitada toggle webview state'is. |

## 4. Call-site audit

See osa on nõutud, sest `DshChatView` konstruktori vastutus muutub, `DshLauncherView` eemaldatakse ning webview-sisene VS Code API omandamine tehakse ühiseks. ServerManageri, Doctori, update'i ega `assembleDocument` avalikku lepingut ei muudeta.

### 4.1 `DshLauncherView` eemaldamine

| Call site | Klassifikatsioon | Lahendus |
|---|---|---|
| `src/extension.ts:12` import | conflict | Import eemaldatakse. |
| `src/extension.ts:190-201` konstruktor ja provider registration | conflict | Asendub ühe `DshChatView` provider'iga. |
| `src/extension.ts:103-105,149,162,176,182` launcher refresh'id | conflict | Metadata/Doctor/session refresh suunatakse `DshChatView` ühte voogu. |
| `test/dshLauncher.test.js:1-191` | conflict | Fail eemaldatakse; endiselt vajalik Doctor/auto-start/handshake coverage liigub `dshChatView.test.js`-i. |
| `test/chatViewLayout.test.js:16-35,75-105` | conflict | Assertions pööratakse ühe view ja ≤44 px chat-chrome arhitektuuri kontrolliks. |

Kõik runtime- ja testiviited on `rg` abil loetletud; muud `DshLauncherView` call site'i ei ole.

### 4.2 `DshChatView` konstruktor ja sessioonihaldus

Uus konstruktor saab kahe väikese editor-paneeli callback'i objekti: `onSessionRenamed(id, title)` ja `onSessionArchived(id)`. Kõik serveri/sessiooni toimingud jäävad klassi sisse; callback'id ei dubleeri manageri tööd.

| Call site | Klassifikatsioon | Lahendus |
|---|---|---|
| `src/extension.ts:206` | conflict | Lisab callback'id `panels.updateTitle` ja `panels.close`; eraldi session handler'id eemaldatakse. |
| `test/dshChatView.test.js:126,164,175,193,210` | conflict | Test factory saab vaikimisi no-op callback'id; lisatest kinnitab paneeli notification'id. |
| `src/extension.ts:101` `loadSession` | compatible | Ready-flow kasutab sama meetodit edasi. |
| `src/extension.ts:197` `shownSessionId` | compatible, wiring muutub | `openPanel` callback registreeritakse pärast chat-view loomist ja avab selle sama ID. |
| `test/dshChatView.test.js:133,180,185,198,202,216,220` | compatible | Senine reassembly/no-op/race leping säilib. |

### 4.3 Jagatud sessiooni- ja teenuselepingud

| Leping / call site | Klassifikatsioon | Lahendus |
|---|---|---|
| `DshServerManager.listWorkspaceSessions/createSession/renameSession/archiveSession` launcheri ja extensioni kasutused | compatible, omanik liigub | Meetodid ei muutu; ainsaks UI-caller'iks saab `DshChatView`. ServerManageri testid jäävad. |
| `runDoctorForLauncher` `src/launcherView.ts:514,597` | compatible, omanik liigub | Funktsioon jääb nimele vaatamata samaks ning seda kutsub `DshChatView`; nime muutmine ei anna feature'ile väärtust. |
| `runDoctorCommand` `src/extension.ts:149` | compatible | Callback muutub `chatView.refreshDoctor()`-iks; installService'i leping/test jääb. |
| `checkForUpdates` `src/extension.ts:105` | compatible | `onResult` kutsub `chatView.refreshMetadata()`; check'i leping ei muutu. |
| `showUpgradeOptions` `src/extension.ts:193` | compatible | Seda kutsub DshChatView valideeritud overflow-sõnumi järel sama channel väärtusega. |
| `assembleDocument.chromeHtml` `src/dshChatView.ts:360`, `src/dshPanel.ts:262` | compatible | Olemasolev optional string leping jääb; ainult chat-view kasutab uut koostatud chrome'i. |
| `SessionPanelManager.updateTitle/close` `src/extension.ts:175,181` | compatible | Kutsed liiguvad DshChatView callback'idesse, manager ise ei muutu. |

### 4.4 `acquireVsCodeApi` call site'id

| Call site | Klassifikatsioon | Lahendus |
|---|---|---|
| `media/bridge-client.js:15` | compatible, täpsustatud omandamine | Kasutab `window.__DSHMUX_VSCODE_API__` väärtust või loob selle ühe korra. Kõik olemasolevad `postMessage` kutsed jäävad samaks. |
| `src/dshChatView.ts:97` inline chrome | conflict | Inline script eemaldatakse; assembled chat chrome kasutab singleton'i, placeholder omandab API ainult ilma bridge'ita dokumendis. |
| `src/dshPanel.ts:77` inline chrome | conflict | Status script loeb sama singleton'i; paneeli UI sõnumid ei muutu. |
| `test/bridgeClient.test.js:66-90` harness | compatible, laiendatav | Lisatakse assertion, et olemasoleva singleton'i korral teist acquisition'it ei tehta. |

`BridgeHost` ei omanda webview API-t ja tema protokoll jääb seetõttu compatible.

## 5. Tasks

Need on lahenduse failimuudatused. Detailne järjekord, RTTM, checklist ja completion criteria kirjutatakse pärast selle dokumendi kinnitamist `plan.md`-i.

### T1 — Viia manifest ühe chat-view peale

**Failid ja praegused piirkonnad**:

- `package.json:45-71,123-147`
- `package.nls.json`
- `package.nls.zh-cn.json`

Muudatused:

- eemalda `dshmux.view`, jäta ainult `dshmux.chat`;
- muuda view nimi neutraalseks `DSHmux`-iks ning eemalda dubleeriv description, mis toodab teise chat-header'i tunnet;
- säilita olemasolevad Command Palette'i käsud; ära lisa paralleelseid native UI käske ega context key'sid;
- uuenda ainult muudetud manifesti nime olemasolevates package-localization failides;
- ära lisa sõltuvust ega toolbar framework'i.

### T2 — Eristada väike chat-chrome template, stiil ja käitumine

**Failid**:

- uus `src/chatChrome.ts`
- uus `media/chat-chrome.css`
- uus `media/chat-chrome.js`

Muudatused:

- `chatChrome.ts` loeb kaks staatilist asset'it ning koostab nonce/CSP-ga sobiva localized chrome-fragmendi;
- CSS katab ainult ≤44 px header'i, serveri overlay, overflow/status menüü, session dialog'i, otsingu, list/hover/focus/high-contrast/narrow-width/reduced-motion olekud ning jätab ülejäänud kõrguse `#root` chatile;
- JS katab §1.4 sõnumid, kolme header-nupu state'id, case-insensitive filterduse, active/archived vaated, suhtelise aja, nooleklahvid/Enter/Escape, outside click'i, täpse fookuse taastamise, rename/archive toimingud ja kitsalt `dsh.sessions.current` muutuse teavituse;
- kasutaja andmed lähevad DOM-i property kaudu; inline user HTML-i ei moodustata.

### T3 — Teha `DshChatView`-st ainus sidebar controller

**Fail**: `src/dshChatView.ts:1-388`

Muudatused:

- asenda inline `placeholderHtml`/`statusChromeHtml` T2 koostajaga;
- võta üle launcheri kontrollitud Doctor gate, auto-start, session cache/poller ning metadata/update snapshot;
- hoia header'i title ja kolme tegevuse olek aktiivse session/server snapshot'iga kooskõlas;
- implementeeri §1.4 message validation ja create/open/rename/archive pending/error vood;
- polli ainult visible+ready view'd, snapshot'i renderda nõudmisel;
- säilita olemasolev `loadSession` refresh sequence ja loading UX;
- märgi dokument serveri non-ready üleminekul vananenuks ning re-assemble'i järgmisel ready'l;
- võta konstruktorisse ainult kaks editor-paneeli notification callback'i.

### T4 — Lihtsustada extension wiring ja eemaldada launcher

**Failid**:

- `src/extension.ts:1-215`
- kustutatav `src/launcherView.ts:1-732`

Muudatused:

- loo/register'i ainult `DshChatView`;
- eemalda launcheri import, callback bundle, provider registration ning launcher refresh'id;
- säilita ready → theme sync → resilient workspace session → `loadSession` järjestus;
- suuna update/Doctor callback'id chat-view metadata refresh'i;
- `dshmux.openPanel` avab `chatView.shownSessionId` editor-tab'is;
- paneeli rename/archive callback'id jäävad ainsateks välisteks UI kõrvalmõjudeks.

### T5 — Parandada ühe API-instance'i ja restart'i jagatud blast radius

**Failid ja praegused piirkonnad**:

- `media/bridge-client.js:12-23`
- `src/dshPanel.ts:56-90,105-143,225-267`

Muudatused:

- loo/reuse'i §1.6 dokumendipõhine VS Code API singleton;
- paneeli status chrome kasutab sama instance'i;
- avatud editor-tab märgib non-ready üleminekul dokumendi vananenuks ja refresh'ib järgmise ready URL-i järel;
- transport, auth-cookie, CSP ja portMapping jäävad muutmata.

### T6 — Lokaliseerida uus UX ja eemaldada surnud copy

**Failid**:

- `src/i18nStrings.ts:1-817`
- vajadusel `src/i18n.ts:1-60` ainult juhul, kui olemasolev API ei kata parameetreid (eeldus on, et katab; ilma faktita seda ei muudeta)
- T1 olemasolevad manifesti `package.nls*.json` failid

Muudatused:

- lisa session search/filter/dialog, action aria-label, pending/error, stopping ja status-detail stringid kõigisse kümnesse runtime keelde;
- eemalda pärast `rg` call-site auditit ainult need `launcher.*`/upgrade UI võtmed, millel pole enam kasutajat;
- säilita Doctori ja `showUpgradeOptions` teenuste kasutatud võtmed;
- parity peab jääma automaattestiga tõendatuks.

### T7 — Asendada vanad layout-testid nõuetele vastava regressioonikattega

**Failid**:

- `test/chatViewLayout.test.js:1-115`
- `test/dshChatView.test.js:1-224`
- kustutatav `test/dshLauncher.test.js:1-191`
- uus `test/chatChrome.test.js`
- `test/bridgeClient.test.js:1-110+`
- vajadusel `test/dshPanel.test.js` olemasoleva paneeli restart-katte jaoks
- olemasolevad `test/i18n.test.js`, `test/documentAssembly.test.js`, `test/installService.test.js`, `test/serverManager.test.js`

Muudatused:

- layout-test kinnitab üht view'd, ≤44 px header'i olemasolu, puuduvat launcherit ning `retainContextWhenHidden` säilimist;
- chat-view testid katavad Doctor gate/handshake'i migratsiooni, header title/cache/pollingut, message validation'it, new-session dedupe'i, rename/archive callback'e ja stop→start reassembly't;
- pure chrome testid katavad filter/sort, active/archived, keyboard/focus, narrow-state DOM-i ning localStorage teavituse;
- bridge test kinnitab API singleton'i;
- launcher-test kustutatakse alles pärast samaväärse vajaliku coverage'i olemasolu;
- `npm test` ja `npm run compile` peavad läbima ning `verification.md`-s tehakse R1–R8, dead-code ja KISS audit koos nõutud visuaalsete tõenditega.

### T8 — Lisada DSH külgriba nähtavuse toggle

**Failid**: `src/chatChrome.ts`, `src/dshChatView.ts`, `src/i18nStrings.ts`, `media/chat-chrome.js`, `media/chat-chrome.css`, `test/chatChrome.test.js`

Muudatused:

- lisa overflow'sse lokaliseeritud Show/Hide tegevus ilma host message contract'i laiendamata;
- loe/kirjuta nähtavus olemasoleva VS Code webview state API kaudu, puuduv väärtus tähendab peidetud;
- kasuta F24–F26 ankrut ja säilita inline grid'i teine/kolmas track muutmata;
- jälgi pärast mount'i ainult frame'i enda style-muutusi ja taasta DSH viimane arvutatud template;
- lisa pure helper'i, HTML-struktuuri, CSS hook'i ja kümne keele parity kontroll.

## 6. KISS kontroll enne plaani

| Kontroll | Tulemus |
|---|---|
| Uus runtime dependency | Ei. |
| Uus UI framework | Ei. |
| Paralleelne vana launcher | Ei; fail, manifest entry, wiring ja test eemaldatakse. |
| Server/session backend ümberkirjutus | Ei; olemasolevad manageri meetodid jäävad. |
| Assemble/bridge protokolli lai ümbertegemine | Ei; olemasolev `chromeHtml` hook ja BridgeHost jäävad. |
| Uute moodulite põhjendus | Üks pure template boundary + üks staatiline CSS + üks staatiline browser behavior; host jääb ühte `DshChatView` klassi. |
| Spekulatiivne scope | Ei; ülesanded seostuvad ainult R1–R8-ga. |
| Netokoodi kontroll | Kohustuslik verification'is; uus kood võrreldakse kustutatud launcher/UI-testide mahuga. |

---

**Gate läbitud**: kasutaja kinnitas lahenduse 2026-09-13. Järgmine gate on `plan.md` kinnitamine; implementatsiooni enne seda ei alustata.

*Seotud dokumendid: [discussion.md](discussion.md) | [req.md](req.md) | plan.md*
