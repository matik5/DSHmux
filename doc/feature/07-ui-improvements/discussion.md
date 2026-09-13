# UI improvements — arutelu

**Kuupäev**: 2026-09-13

**Allikad**: kasutaja tagasiside ja kaks lisatud ekraanipilti; käesoleva lähtekoodi audit

**Etapp**: Feature Pipeline'i lähtearutelu

> Kuna `req.md` on loodud, on see fail edaspidi nõuete allikana **read-only**. Uued või muudetud nõuded tuleb kanda otse `req.md` faili.

## 1. Kasutaja tagasiside

Praegune DSHmuxi külgriba kasutab liiga suure osa nähtavast pinnast laienduse enda, versioonide ja DSH protsessi juhtimise jaoks. Kasutaja põhitöö — aktiivne vestlus — algab seetõttu liiga madalalt ning sessioonide vahetamine on kohmakas.

Kasutaja tõi välja järgmised probleemid:

- DSHmuxi nimi, laienduse versioon ja DSH versioon on tavakasutuse ajal liiga esiplaanil;
- `New session` ei asu kõige mugavamas kohas;
- `Start DSH` / `Stop DSH` ei peaks terve DSH puhul olema põhitegevused ega võtma püsivalt ruumi;
- alati nähtav sessiooniloend on ebamugav ja surub chati alla;
- sessioonivalik võiks avaneda Codexi-laadse otsitava popup'i või overlay'na;
- ülaosas võiks olla aktiivse chati pealkiri ja väikesed ikoonnupud;
- chat peab kasutama kogu ülejäänud vertikaalse ruumi.

Teine ekraanipilt on interaktsiooni ja infotiheduse orientiir, mitte nõue Codexi UI-d pikslitäpselt kopeerida.

## 2. Probleemi sõnastus

Praegune infostruktuur asetab harva vajatava süsteemiinfo ja haldustoimingud samale tasemele aktiivse vestlusega. Tulemuseks on kaks konkureerivat pinda:

1. püsiv launcher koos staatuse, versioonide, toimingute ja sessioonidega;
2. eraldi chat, mis saab alles ülejäänud kõrguse.

Soovitud hierarhia on vastupidine:

1. aktiivne vestlus on alati põhipind;
2. aktiivse sessiooni nimi ja sagedased toimingud on ühes kompaktses reas;
3. sessioonide ajalugu avaneb ajutise kihina;
4. protsessi detailid, versioonid ja hooldustoimingud ilmuvad ainult siis, kui neid on vaja.

## 3. Lähtekoodist kontrollitud faktid

| ID | Fakt | Tõend |
|---|---|---|
| F1 | DSHmuxi activity-bar konteinerisse on lisatud kaks eraldi webview'd: `dshmux.view` ja `dshmux.chat`. VS Code kuvab need kahe vertikaalselt laotud sektsioonina. | `package.json:132-146`; järjekorda lukustav test `test/chatViewLayout.test.js:20-35` |
| F2 | Launcheri HTML lisab 16 px padding'u ja 16 px vahed ning kuvab püsivas header'is logo, `DSHmux` nime, extension-versiooni, DSH staatuse/versiooni, `New session`, `Stop` ja overflow-menüü. | `src/launcherView.ts:68-78,167-196` |
| F3 | Upgrade'id saavad eraldi rea ning sessioonide pealkiri ja loend renderdatakse launcheris alati chati kohal. | `src/launcherView.ts:198-211` |
| F4 | Sessiooniloendit uuendatakse ready-olekus iga 5 sekundi järel; loend sisaldab pealkirja, aktiivsusaega ning rename/archive toiminguid. | `src/launcherView.ts:15-16,669-717`; sessioonirea renderdus `src/launcherView.ts:292-423` |
| F5 | Sessioonil klõpsamine või uue sessiooni loomine laeb selle samasse ühte külgriba chat-view'sse. Editor-tab on eraldi, teisene pind. | `src/extension.ts:152-172,190-210` |
| F6 | Chat-view juba haldab stopped/starting/error/loading olekuid kogu chati katva overlay kaudu; stopped/error olekus saab sealt DSH käivitada. | `src/dshChatView.ts:41-190,254-288` |
| F7 | Chat-view teab aktiivse sessiooni ID-d, kuid DSHmuxi chrome ei kuva aktiivse sessiooni pealkirja. Contributed view nimi on staatiline `DSHmux Chat`. | `src/dshChatView.ts:201-205,300-323`; `package.json:139-145` |
| F8 | Olemasolevad hostipoolsed toimingud juba katavad vajaliku funktsionaalsuse: create, open, rename, archive, open in editor, settings, Doctor, start/stop ja kanalipõhised upgrade'id. UI ümberkujundus ei vaja nende toodete uuesti leiutamist. | `src/launcherView.ts:540-585`; `src/extension.ts:152-198` |
| F9 | Sessiooni vahetamine nõuab praegu DSH dokumendi uuesti assemble'imist; koodil on selleks loading-overlay ja race-kaitse. Uus UI peab selle tagasiside säilitama. | `src/dshChatView.ts:291-318,329-381` |
| F10 | DSHmux embed'ib upstream DSH Web UI tervikuna. Selle sisemise chati, tööriistariba või composeri ümbertegemine oleks eraldi ja palju laiem töö kui DSHmuxi enda chrome'i korrastamine. | `src/dshChatView.ts:346-365`; `src/documentAssembly.ts` |

## 4. Kavandatav UX-suund

### 4.1 Ready-olek

```text
┌────────────────────────────────────────────────────────────┐
│  Aktiivse sessiooni pealkiri       [ajalugu] [+] [···]    │
├────────────────────────────────────────────────────────────┤
│                                                            │
│                  embed'itud DSH chat                       │
│                                                            │
│                                              kogu vaba ruum │
└────────────────────────────────────────────────────────────┘
```

- üks kompaktne vestluse header;
- vasakul aktiivse sessiooni pealkiri;
- paremal väikesed ikoonnupud: sessioonid/ajalugu, uus sessioon ja overflow;
- logo, extension-versioon, DSH versioon, ready-tekst, roheline olekurida ning püsiv sessiooniloend puuduvad;
- embed'itud chat algab kohe header'i alt ja kasvab kogu ülejäänud kõrgusesse.

### 4.2 Sessioonivalik

```text
┌────────────────────────────────────────────────────────────┐
│  Aktiivse sessiooni pealkiri       [ajalugu] [+] [···]    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 🔎 Otsi sessioone                                    │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ Aktiivne vestlus                               3m  ● │  │
│  │ Paranda Windowsi sõltuvuste install             4h   │  │
│  │ Lisa DuckDuckGo web search MCP                  1d   │  │
│  │ ...                                                  │  │
│  └──────────────────────────────────────────────────────┘  │
│               chat jääb overlay taha alles                │
└────────────────────────────────────────────────────────────┘
```

- popup katab ajutiselt chati, kuid ei vähenda selle püsivat kõrgust;
- otsing saab kohe fookuse;
- aktiivne sessioon on selgelt märgitud ja hiljuti kasutatud sessioonid on eespool;
- rename/archive jäävad alles, kuid liiguvad rea kontekstitoiminguteks ega ole kogu aeg visuaalselt domineerivad;
- popup sulgub valiku, `Escape`-klahvi või väljaspool klõpsamise järel.

### 4.3 DSH ei ole kasutusvalmis

```text
┌────────────────────────────────────────────────────────────┐
│  DSHmux                                   [settings] [···] │
├────────────────────────────────────────────────────────────┤
│                                                            │
│                 DSH ei tööta / viga                        │
│                    [ Käivita DSH ]                          │
│             vajadusel [ Ava Doctor ]                       │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

Terve teenus võib olla nähtamatu infrastruktuur. Seisatud, käivituv, peatuv või vigane teenus vajab seevastu selget olekut ja taastamistoimingut samal põhipinnal.

## 5. Soovitatud interaktsioonid

### 5.1 Header

- Sessiooni pealkiri on primaarne tekst ning ellipsiseerub kitsas vaates.
- Pealkirjal või selle kõrval oleval ajaloonupul klõpsamine avab sessioonivaliku.
- `New session` muutub ikoonnupuks, millel on tooltip ja ligipääsetav nimi.
- Overflow sisaldab vähemalt `Open in editor`, `Settings`, `Doctor`, ready-olekus `Stop DSH` ning versiooni/update detaile.
- Update'i olemasolu võib märkida overflow-nupul või menüüreal vaikse badge'iga; eraldi püsivat update-riba ei ole.

### 5.2 Sessioonivalik

- Vaikimisi kuvatakse ainult praeguse IDE workspace'i aktiivsed sessioonid, et vältida kogemata teise projekti konteksti sattumist.
- Järjekord on viimati aktiivne esimesena; igal real on suhteline aeg.
- Otsing filtreerib kuvatava pealkirja järgi, tõstutundeta.
- Aktiivne sessioon on visuaalselt ja assistive-technology jaoks märgitud.
- Arhiveeritud sessioonid on eraldi suletavas jaotises või filtris; need ei koorma põhinimekirja.
- Rename ja archive on endiselt võimalikud hiire ja klaviatuuriga.
- Tühiolekus on selge `New session` tegevus.

### 5.3 Protsessi olek

- `ready`: püsivat `Start`/`Stop`, versiooniteksti ega terviserida ei kuvata.
- `starting`/`stopping`: kuvatakse ajutine progress ja blokeeritakse topeltkäivitus.
- `stopped`: chati alal on üks selge `Start DSH` CTA.
- `error` või puuduvad sõltuvused: näidatakse lühikest veateadet ning sobivat `Retry`/`Doctor` tegevust.
- `Stop DSH` jääb teadlikult overflow-menüüsse, sest see on harv haldustoiming, mitte chatitöö osa.

## 6. Piirid ja trade-off'id

- Eesmärk on DSHmuxi **chrome ja infostruktuur**, mitte upstream DSH Web UI visuaalne ümberkirjutamine.
- Visuaalselt ühe pinna saavutamine võib lahenduses tähendada kahe praeguse webview rollide ühendamist või teistsugust hostimist. Seda ei otsustata nõuetes enne täielikku call-site auditit.
- VS Code'i enda activity-bar/container chrome ei ole laienduse kontrolli all. Mõõdetav eesmärk käib DSHmuxi enda renderdatud pinna kohta.
- VS Code QuickPick oleks tehniliselt lihtsam, kuid kasutaja toodud Codexi näide eelistab chati sees paiknevat rikast popup'i; seetõttu on soovitus in-view popup.
- Kõik olemasolevad sessiooni-, Doctor-, update-, editor-tab- ja protsessihaldusvõimed peavad jääma leitavaks ka siis, kui need ei ole enam püsivalt nähtavad.

## 7. Otsused, mida `req.md` kinnitamine heaks kiidab

| ID | Küsimus | Soovitatud otsus |
|---|---|---|
| D1 | Kas launcher jääb eraldi püsivaks pinnaks? | Ei. Ready-olekus on üks chat-first pind ja üks kompaktne header. |
| D2 | Kuidas sessioone vahetada? | Header'ist avanev otsitav in-view popup/overlay. |
| D3 | Kus on `New session`? | Püsiv kompaktne header'i ikoon + popup'i tühioleku tegevus. |
| D4 | Kus on `Stop DSH`? | Ainult overflow-menüüs, kui DSH töötab. |
| D5 | Kus on versioonid ja update'id? | Versioonid overflow/About/Doctor detailides; update ainult tagasihoidliku indikaatori või menüüreana. |
| D6 | Milliseid sessioone vaikimisi näidata? | Praeguse workspace'i aktiivsed sessioonid, uusimad ees; arhiiv eraldi. |
| D7 | Kas editor-tab jääb alles? | Jah, teisese `Open in editor` toiminguna. |
| D8 | Kas upstream DSH sisemine UI kuulub scope'i? | Ei; säilib olemasoleva embed'itud tootena. |

## 8. Peamised riskid, mida lahenduses kontrollida

- Sessioonide loogika ja chat elavad täna eri provider'ites; ümberpaigutamisel ei tohi kaduda state-handshake, polling ega lifecycle cleanup.
- Sessioonivahetus vahetab kogu webview dokumendi. DSHmuxi header/popup peab seetõttu olema kas dokumendi osa või taastuma ilma nähtava topelthüppeta.
- Popup peab töötama kitsal külgribal, suure sessioonihulgaga ja nii heledas, tumedas kui high-contrast teemas.
- Olemasolev layout-test nõuab otseselt launcheri paiknemist chati kohal; uue lahenduse puhul tuleb see nõue teadlikult asendada, mitte lihtsalt test eemaldada.
- Hover'i taha peidetud rename/archive toimingud peavad olema ka klaviatuuri ja screen reader'iga leitavad.

*Seotud dokumendid: [req.md](req.md) | [02-session-management](../02-session-management/summary.md)*
