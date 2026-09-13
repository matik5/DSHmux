# UI session controls — arutelu

**Kuupäev**: 2026-09-13

**Allikad**: kasutaja tagasiside; DSHmuxi ja kohaliku DeepSeek Harnessi lähtekoodi audit

**Etapp**: Feature Pipeline'i lähtearutelu

> Kuna `req.md` on loodud, on see fail edaspidi nõuete allikana **read-only**. Uued või muudetud nõuded tuleb kanda otse `req.md` faili.

## 1. Kasutaja soov

Jätkata feature 07 chat-first UI parandamist viie väikese, kuid igapäevast kasutust mõjutava täiendusega:

- aktiivse sessiooni header'i nime topeltklõps peab võimaldama ümbernimetamist;
- sessioonivalikusse tuleb `Pinned` jaotis enne `Active` ning `Archived` ja sessioone peab saama pinnida;
- pealkirjaotsingu kõrval peab olema `Full text search` märkeruut, mis otsib sessioonide logide sisust;
- sessioonivaliku vertikaalne paigutus peab olema kompaktsem;
- overflow-menüü viimane protsessitoiming peab olema olekupõhine: töötava DSH korral `Stop DSH`, peatatud DSH korral `Start DSH`.

## 2. Lähtekoodist kontrollitud faktid

| ID | Fakt | Tõend |
|---|---|---|
| F1 | Header kuvab aktiivse sessiooni nime tavalises `div` elemendis; sellele ei ole rename-interaktsiooni lisatud. | `src/chatChrome.ts:84-97`; `media/chat-chrome.js:97-125` |
| F2 | Sessioonirea rename kasutab juba sama hostipoolset `rename-session` sõnumit ja `DshServerManager.renameSession()` kutsub DSH `session.rename` RPC-d. | `media/chat-chrome.js:318-353`; `src/dshChatView.ts:309-313,400-415`; `src/serverManager.ts:1121-1125` |
| F3 | Popup'il on praegu ainult kaks vaadet: `Active` ja `Archived`. Kliendiolekus ning snapshot'is eraldi pinned-andmeid ei ole. | `src/chatChrome.ts:99-113`; `media/chat-chrome.js:103-126,283-287`; `src/dshChatView.ts:41-46,84-85,486-493` |
| F4 | DSHmuxi koodibaasis puudub DSH pin/unpin RPC või muu sessiooni pinni salvestus. Extension kasutab juba workspace-põhiste eelistuste jaoks VS Code `workspaceState` salvestust. | `src/serverManager.ts:1073-1134`; `src/extension.ts:20-21,45-67` |
| F5 | Tavaline otsing filtreerib praegu ainult valitud vaate sessioonide kuvatavat pealkirja brauseris. | `media/chat-chrome.js:355-367,542-545` |
| F6 | DSH host pakub `session.search` RPC-d. Sisend on üks `query`; väljund sisaldab kuni 20 unikaalset sessiooni koos `sessionId` ja kuni 240 Unicode code point'i pikkuse `snippet`-iga. | DeepSeek Harness `packages/api/session-controller/src/types.ts:174-184,251-260`; `src/index.ts:227-235`; `src/list.ts:166-258` |
| F7 | DSH full-text otsing kasutab ainult aktiivse pinna kasutaja- ja assistendisõnumeid ning ei aktiveeri leitud sessiooni. RPC ise otsib kõiki hostile nähtavaid sessioone, seega DSHmux peab tulemused oma workspace'i sessioonidega ristama. | DeepSeek Harness `packages/api/session-controller/src/list.ts:160-208,233-258` |
| F8 | DSHmuxi sessioonisnapshot sisaldab praeguse IDE workspace'i aktiivseid ja arhiveeritud sessioone; seega on olemas ID-hulk full-text tulemuste workspace-põhiseks piiramiseks. | `src/serverManager.ts:1067-1104`; `src/dshChatView.ts:464-493` |
| F9 | Sessioonipopup on vertikaalselt suhteliselt hõre: dialoogi padding on 10 px, otsing 32 px kõrge, tab'ide ümber on 9/7 px vahed ja read vähemalt 36 px kõrged. | `media/chat-chrome.css:142-153,155-208,225-250` |
| F10 | Overflow sisaldab eraldi `Stop DSH` nuppu, mis peidetakse alati, kui olek pole `ready`. `Start DSH` eksisteerib ainult stopped/error overlay'l, kuigi host juba käsitleb `start` sõnumit. | `src/chatChrome.ts:115-138`; `media/chat-chrome.js:111-119,438-497,552-573`; `src/dshChatView.ts:297-302,358-367` |

## 3. Soovitatud käitumine

### 3.1 Header'i rename

- topeltklõps aktiivse sessiooni nimel asendab nime samas reas input'iga;
- olemasolev nimi on valitud, `Enter` salvestab ja `Escape` tühistab;
- tühja nime ega muutmata väärtust ei saadeta serverisse;
- hosti viga jätab vana nime alles ja annab kasutajale olemasoleva toast'i kaudu tagasiside;
- popup'i rea rename jääb alles klaviatuuriga kasutatavaks alternatiiviks.

### 3.2 Pinned

- vaadete järjestus on `Pinned`, `Active`, `Archived`;
- vaikimisi avaneb `Pinned`, kui seal on kirjeid, vastasel juhul `Active`;
- pin on DSHmuxi workspace-põhine UI-eelistus, sest DSH sessioonimudelil vastavat operatsiooni ei ole;
- pinnida ja unpinnida saab nii aktiivset kui arhiveeritud sessiooni;
- pinned-vaade võib seega sisaldada mõlemat tüüpi sessioone; `Active` ja `Archived` säilitavad oma tavalise elutsüklipõhise sisu, mistõttu pinned sessioon jääb nähtavaks ka oma algses vaates;
- kustunud või enam workspace'i mittekuuluvad ID-d koristatakse nähtavast pinned-vaatest.

### 3.3 Full-text search

- otsingurea lõpus on ligipääsetav märkeruut `Full text search`;
- väljalülitatult jääb alles kiire lokaalne pealkirjafilter valitud vaates;
- sisselülitatult otsitakse DSH `session.search` kaudu praeguse IDE workspace'i kõigi pinned-, aktiivsete ja arhiveeritud sessioonide sõnumisisust sõltumata valitud tab'ist;
- tulemused näitavad pealkirja, aega ja vastekatket ning on grupeeritud järjestuses `Pinned`, `Active`, `Archived`;
- tulemuspiirang ja võimalik lisatulemuste olemasolu tehakse kasutajale arusaadavaks; otsingu viga ei lõhu olemasolevat sessiooniloendit;
- kiiresti muutuv päring ei tohi kuvada vana päringu hilinenud tulemust.

### 3.4 Tihedus ja protsessimenüü

- popup'i padding, kontrollide vahed ja sessioonirea kõrgus vähenevad mõõdukalt, säilitades klaviatuuri fookuse ja klikitavuse;
- menüü viimane rida on `ready` korral `Stop DSH`, `stopped`/`error` korral `Start DSH` või `Retry DSH`;
- `starting`/`stopping` ajal ei tohi menüü lubada vastandlikku topelttoimingut;
- stopped/error overlay põhitegevus jääb samuti alles, sest see on peamine taastamistee.

## 4. Piirid ja KISS

- Muudatus täiendab olemasolevat DSHmuxi chrome'i; upstream DSH UI-d ega DSH andmemudelit ei muudeta.
- Uut otsinguindeksit ega logiparserit DSHmuxi ei ehitata: kasutatakse olemasolevat `session.search` RPC-d.
- Pinni jaoks ei lisata uut teenust ega sõltuvust; vaja on ainult väikest workspace-põhist ID-de loendit.
- Full-text otsingu esimene versioon kasutab hosti olemasolevat 20 tulemuse piiri; lõputut scroll'i ega eraldi pagination-raamistikku ei lisata.
- Visuaalne kompaktsemaks tegemine piirdub sessioonipopup'i ja selle kontrollidega.

## 5. Otsused, mida `req.md` kinnitamine heaks kiidab

| ID | Küsimus | Soovitatud otsus |
|---|---|---|
| D1 | Kas pinned sessioon dubleeritakse tema Active/Archived vaates? | Jah. `Pinned` on kiire lisavaade, mitte uus elutsükli olek. |
| D2 | Kas arhiveeritud sessiooni saab pinnida? | Jah; pin ja archive on sõltumatud. |
| D3 | Mis on full-text otsingu ulatus? | Kõik praeguse IDE workspace'i aktiivsed ja arhiveeritud sessioonid, mitte teised projektid. |
| D4 | Kuidas full-text tulemusi esitada? | Kõik vasted ühes tulemuses, grupeerituna `Pinned → Active → Archived`, koos snippet'iga. |
| D5 | Kus pinne hoida? | VS Code workspace-põhises DSHmuxi olekus. |
| D6 | Kas ehitada oma logiindeks/pagination? | Ei; kasutada DSH olemasolevat otsingut ja selle 20 tulemuse piiri. |
| D7 | Mis on overflow viimane tegevus? | Olekupõhine üks rida: ready=`Stop`, stopped=`Start`, error=`Retry`; ülemineku ajal disabled. |

## 6. Riskid järgmisele etapile

- Header'i rename ei tohi lasta 5-sekundilisel pollingul input'i keset muutmist asendada.
- Full-text päringud vajavad debounce'i või muud lihtsat piiramist ja hilinenud vastuste eiramist.
- DSH võib käivituda ilma session-query provider'ita; see peab andma lokaalse ja taastatava otsinguvea.
- Pinni ID-de salvestus peab säilitama järjekorra ning vältima vanade ID-de lõputut kogunemist.
- Kolm tab'i, checkbox ja kitsas vaade peavad mahtuma ilma horisontaalse overflow'ta.

*Seotud dokumendid: [req.md](req.md) | [07-ui-improvements](../07-ui-improvements/summary.md)*
