# UI improvements — nõuded

**Kuupäev**: 2026-09-13

**Allikad**: [discussion.md](discussion.md), kasutaja tagasiside ja kaks lisatud ekraanipilti

**Staatus**: ✅ kasutaja kinnitatud (2026-09-13)

> See dokument määrab **mida** kasutajale ehitatakse ja kuidas tulemust vastu võtta. Arhitektuur, failimuudatused ning tehniline teostus kuuluvad pärast nõuete kinnitamist `solution.md` faili.

## 1. Eesmärk

DSHmuxi külgriba peab olema chat-first tööpind: aktiivne vestlus kasutab peaaegu kogu saadaolevat kõrgust, sagedased tegevused asuvad kompaktses vestluse header'is ning sessioonide, protsessi ja versioonide haldus ilmub ainult vajadusel.

## 2. Põhinõuded

### R1 — Üks chat-first põhipind

Ready-olekus peab DSHmux esitama ühe visuaalselt tervikliku pinna: üks kompaktne header ja kohe selle all embed'itud DSH chat.

Nõuded:

- eraldi püsiv launcher'i plokk ei tohi võtta chati kohal ruumi;
- kasutajale ei tohi tekkida DSHmuxi enda UI-s järjest kahte sektsiooniheader'it (`DSHmux` ja `DSHmux Chat`);
- logo, tootenimi, extension-versioon, DSH versioon, ready-tekst ja püsiv sessiooniloend ei kuulu normaalse ready-oleku põhipinnale;
- kui ükski popup ega veaseisund pole avatud, võib DSHmuxi enda chrome enne embed'itud chati võtta maksimaalselt ühe kompaktse rea (kuni 44 CSS px; VS Code'i enda native container-header ei lähe selle arvestuse sisse);
- vertikaalse resize'i lisaruum peab minema chatile, mitte tühjale launcher'i alale.

Vastuvõtt:

- DSH ready, üks sessioon avatud: native DSHmux container-header'i järel on ainult aktiivse chati kompaktne header ja chat;
- `DSHmux Chat` eraldusriba ega püsivat sessiooniloendit ei ole;
- vähemalt 700 px kõrguses külgribas algab embed'itud DSH sisu hiljemalt 44 px pärast DSHmuxi enda webview-pinna algust;
- külgriba kõrguse suurendamisel suureneb chatiala samas ulatuses.

### R2 — Aktiivse vestluse kompaktne header

Header peab andma esmase konteksti ja kiire juurdepääsu sagedastele tegevustele ilma tekstinuppude reata.

Nõuded:

- vasakul kuvatakse aktiivse sessiooni tegelik pealkiri; pealkirja puudumisel kasutatakse olemasolevat arusaadavat fallback-nime;
- pealkiri uueneb sessiooni vahetamisel, uue sessiooni loomisel ja ümbernimetamisel;
- pikk pealkiri ellipsiseerub ega lükka tegevusi nähtavalt alalt välja;
- paremal on vähemalt kolm kompaktset, VS Code'i visuaalse keelega ikoontegevust:
  1. sessioonide/ajaloo avamine;
  2. uue sessiooni loomine;
  3. overflow-menüü;
- igal ikoonil on tooltip, ligipääsetav nimi, hover-, active- ja focus-visible olek;
- `Open in editor`, `Settings` ja `Doctor` jäävad overflow-menüüst leitavaks.

Vastuvõtt:

- aktiivse sessiooni vahetamisel vastab header'i nimi nähtavale chatile;
- 240 px laiuses vaates jäävad kõik kolm põhitegevust kasutatavaks, pealkiri ellipsiseerub ja horisontaalset scrollbar'i ei teki;
- kõigi tegevusteni saab jõuda ainult klaviatuuriga ning screen reader saab nende eesmärgist aru.

### R3 — Codexi-laadne sessioonivaliku popup

Sessioonide ajalugu peab avanema header'ist ajutise popup'i või overlay'na, mitte olema kogu aeg chati kohal nähtav.

Nõuded:

- popup avaneb ilma aktiivset chati sulgemata või selle püsivat layout-kõrgust vähendamata;
- avanemisel saab otsinguväli fookuse;
- otsing filtreerib sessioone kuvatava pealkirja järgi tõstutundeta;
- vaikimisi kuvatakse praeguse IDE workspace'i aktiivsed sessioonid, viimati aktiivne esimesena;
- iga rida näitab vähemalt sessiooni pealkirja ja suhtelist aktiivsusaega;
- praegu avatud sessioon on nii visuaalselt kui semantiliselt märgitud;
- rea valimine sulgeb popup'i ja laeb valitud sessiooni samasse chatipinda;
- sessiooni laadimise ajal on selge progress ning eelmise ja uue sessiooni sisu ei tohi eksitavalt seguneda;
- rename ja archive jäävad sessioonirea kontekstitoimingutena kättesaadavaks hiire, klaviatuuri ja assistive technology kaudu;
- arhiveeritud sessioonid ei koorma põhiloendit, kuid on popup'is eraldi suletava jaotise või filtri kaudu leitavad;
- popup sulgub sessiooni valimisel, `Escape`-klahviga ja väljaspool klõpsamisel; fookus taastub avamisnupule;
- suurema sessioonihulga korral scroll'ib popup'i loend, mitte kogu chatipind.

Vastuvõtt:

- popup'is saab otsida, nooleklahvidega liikuda, `Enter`-iga valida ja `Escape`-iga sulgeda;
- valitud sessioon muutub header'is ja chatipinnal samaks sessiooniks;
- rename kajastub kohe reas ning aktiivse sessiooni puhul ka header'is;
- archive eemaldab sessiooni aktiivsest nimekirjast ja säilitab senise arhiveerimise semantika;
- popup töötab vähemalt 240 px, 320 px ja 480 px laiuses ilma horisontaalse overflow'ta.

### R4 — Uue sessiooni kiire loomine

Uue sessiooni loomine peab olema ühe sammu kaugusel nii tavalises töövoos kui tühioleku korral.

Nõuded:

- ready-olekus loob header'i `New session` ikoon ühe klõpsu või klahvivajutusega praegusesse workspace'i uue sessiooni ja avab selle samas chatipinnas;
- toimingu ajal on nupp pending/disabled olekus, et vältida tahtmatuid duplikaate;
- uus sessioon saab kohe header'is sobiva fallback-pealkirja;
- kui sessioone pole, pakub popup'i tühiolek samuti selget `New session` tegevust;
- loomise viga ei asenda ega riku eelmist aktiivset vestlust ning kasutaja saab arusaadava veateate.

Vastuvõtt:

- üks aktiveerimine tekitab täpselt ühe sessiooni;
- loodud sessioon on kohe valitud nii header'is kui chatipinnal;
- topeltklõps või aeglane vastus ei tekita mitut sessiooni;
- veast taastudes jääb eelmine sessioon kasutatavaks.

### R5 — Protsessi olek ja versioonid nõudmisel

DSH protsess peab ready-olekus käituma nähtamatu infrastruktuurina, kuid probleemse oleku korral andma selge taastamistee.

Nõuded:

- `ready`: eraldi `Start DSH`, `Stop DSH`, ready-tekst, roheline täpp ning extension/DSH versioonid ei ole põhipinnal püsivalt nähtavad;
- `Stop DSH` on ready-oleku overflow-menüüs;
- `stopped`: chatipind kuvab selge `Start DSH` põhitegevuse;
- `starting` ja `stopping`: chatipind kuvab ajutist, ligipääsetavat progress-olekut ning ei luba sama toimingut dubleerida;
- `error`: chatipind kuvab lühikese veateate ning vähemalt sobiva retry/start või `Open Doctor` tegevuse;
- puuduvate sõltuvuste korral on `Doctor`/repair tegevus esmane, mitte katkine start-tsükkel;
- extension- ja DSH-versioon on overflow'st avatavas detailis, About-vaates või Doctoris leitav;
- saadaval update ei tekita täislaiuses püsiriba: seda näidatakse tagasihoidliku badge'i, ikoonioleku või overflow-menüü kirjena; olemasolev latest/next valik ja terminali eeltäitmise ohutus jäävad alles.

Vastuvõtt:

- ready-screenshot ei sisalda versioonitekste ega `Start`/`Stop` tekstinuppe;
- `Stop DSH` on kuni kahe kasutajatoimingu kaugusel ja peatab teenuse senise semantikaga;
- stopped/error olekust saab kasutaja teenuse käivitada või Doctori avada ilma Command Palette'i kasutamata;
- mõlema update-kanali tegevused on vajadusel leitavad ja ükski upgrade ei käivitu automaatselt.

### R6 — Visuaalne kvaliteet, responsive käitumine ja ligipääsetavus

Uus chrome peab nägema välja nagu loomulik osa VS Code'ist ning jääma kasutatavaks eri mõõtudes ja teemades.

Nõuded:

- kasutatakse VS Code'i theme tokeneid ja Codiconi-laadset ühtset ikoonikeelt; uus fikseeritud brand-värv ei tohi olla põhihierarhia kandja;
- light, dark ja high-contrast teemas peavad tekst, valik, hover, focus, border ja overlay olema eristatavad;
- mouse hover ei tohi olla ühegi toimingu ainus avastamis- või kasutusviis;
- reduced-motion eelistust austatakse;
- kasutajale nähtavad uued/muudetud stringid on kõigis projekti toetatud keeltes ning i18n parity säilib;
- header ja popup ei tekita toetatud külgribalaiustes horisontaalset scrollbar'i ega kata üksteise põhitegevusi;
- popup'i avamisel ja sulgemisel on korrektne fookuse liikumine ning dialoogi/listbox'i semantika.

Vastuvõtt:

- visuaalne kontroll light, dark ja high-contrast teemas laiustel 240/320/480 px;
- ainult klaviatuuriga saab avada popup'i, otsida, valida sessiooni, luua uue sessiooni ning kasutada rea- ja overflow-toiminguid;
- automaattest kinnitab i18n võtmete võrdsuse ja põhilised layout/interaction state'id.

### R7 — Olemasoleva funktsionaalsuse regressioonikaitse

UI ümberkujundus ei tohi vähendada DSHmuxi olemasolevaid põhivõimeid.

Nõuded:

- embed'itud DSH Web UI, transport bridge, streaming, clipboard, theme sync, completion sound ja session switching jäävad toimima;
- workspace'i automaatne sessioonivalik ning reload/auto-restart käitumine jäävad toimima;
- rename, archive, open session, new session, `Open in editor`, settings, Doctor, stop/start ja latest/next upgrade jäävad kasutajale leitavaks;
- editor-tab jääb teisese pinnana alles;
- UI uuendamine ei muuda sessiooni arhiveerimise ega DSH protsessi peatamise semantikat.

Vastuvõtt:

- kõik olemasolevad asjakohased testid kas läbivad muutmata kujul või asendatakse uue nõudega samaväärse testiga;
- vana testi, mis nõuab launcheri paiknemist chati kohal, ei eemaldata ilma uue chat-first layout'i kontrollita;
- `npm test` ja `npm run compile` läbivad;
- käsitsi kontrollitakse vähemalt: start → ready → new session → switch → rename → archive → open in editor → stop → start.

### R8 — KISS: võimalikult lihtne ja väike teostus

UI uuendus peab lahendama R1–R7 minimaalse põhjendatud keerukusega. Feature ei tohi kasvatada paralleelset UI-arhitektuuri ega muutuda üheks uueks monoliitseks „megakoodi” failiks.

Nõuded:

- olemasolevat sessiooni-, protsessi-, Doctori-, upgrade'i-, bridge'i ja chat-view loogikat taaskasutatakse seal, kus selle leping sobib;
- sama oleku või toimingu jaoks peab pärast muudatust olema üks autoriteetne andme- ja sündmuste voog, mitte vana ja uus paralleelne implementatsioon;
- asendatud launcher'i UI, surnud message-handler'id, kasutamata stiilid, i18n võtmed ja aegunud layout-testid eemaldatakse samas feature'is;
- selle feature'i jaoks ei lisata uut UI framework'i ega runtime dependency't ilma kasutaja eraldi kinnituseta;
- ei ehitata spekulatiivseid abstraktsioone, üldist disainisüsteemi ega tulevaste teadmata vajaduste extension point'e;
- lihtsust ei saavutata ühe hiiglasliku HTML/CSS/JavaScript template-stringi või kõiki vastutusi koondava faili abil: kood jagatakse ainult selgete olemasolevate vastutuspiiride järgi;
- `solution.md` peab iga uue mooduli või abstraktsiooni vajalikkuse põhjendama ning näitama, milline vana kooditee eemaldatakse või millist olemasolevat osa taaskasutatakse;
- neto-koodikasv peab olema otseselt seotud kinnitatud nõuetega; mugavus- või tulevikufunktsioone scope'i juurde ei lisata.

Vastuvõtt:

- koodiaudit ei leia sama kasutajatoimingu jaoks kahte konkureerivat UI- või state-management rada;
- vana püsiva launcheri renderdus ja selle kasutamata juhtmestik ei jää uue chat-first UI kõrvale peidetud legacy-koodina alles;
- dependency manifestis pole selle feature'i tõttu uut runtime-paketti, kui kasutaja pole seda eraldi kinnitanud;
- `verification.md` sisaldab lühikest KISS-auditit: taaskasutatud osad, eemaldatud osad, lisatud abstraktsioonide põhjendus ja põhjendamata koodikasvu puudumine.

## 3. Kinnitatavad tooteotsused

Selle `req.md` kinnitamine kinnitab ühtlasi järgmised valikud:

| ID | Otsus |
|---|---|
| D1 | Ready-olekus ei ole eraldi püsivat launcher'i pinda; chat on üks põhivaade. |
| D2 | Sessioonivalik on chati kohal avanev otsitav in-view popup/overlay, mitte VS Code QuickPick ega püsiloend. |
| D3 | Header'is on aktiivse sessiooni pealkiri ning kompaktsed session-history, new-session ja overflow ikoonid. |
| D4 | `Stop DSH`, versioonid, update'id ja harvad haldustoimingud liiguvad overflow/detailvaatesse. |
| D5 | Sessioonivalik on vaikimisi piiratud aktiivse workspace'iga; arhiiv on eraldi teisene jaotis. |
| D6 | Olemasolev editor-tab säilib `Open in editor` teisese võimalusena. |
| D7 | Feature muudab DSHmuxi chrome'i; upstream DSH Web UI sisemine ümberkujundus ei kuulu scope'i. |

## 4. Mitte-eesmärgid

| ID | Ei kuulu sellesse feature'isse |
|---|---|
| N1 | Upstream DSH Web UI sisemise navigatsiooni, chati, composeri, workspace'i või pluginate UI ümberkirjutamine. |
| N2 | Uus sessiooni backend, sessioonide kustutamine, taastamine või sünkroonimissemantika. |
| N3 | Kõigi workspace'ide globaalne sessioonibrauser; vaikimisi jäädakse aktiivse IDE workspace'i piiresse. |
| N4 | Editor-tab'i eemaldamine või mitme editor-paneeli orkestreerimise ümbertegemine. |
| N5 | DSH installi, Doctori või upgrade'i äriloogika muutmine peale nende UI paigutuse. |
| N6 | Codexi visuaali pikslitäpne kopeerimine või Codexi brändielementide kasutamine. |

## 5. Piirangud

- **C1 — turve**: olemasolevat CSP-d, loopback binding'ut, auth-cookie't ega `/api` trust boundary't ei nõrgendata.
- **C2 — VS Code/fork ühilduvus**: lahendus peab toimima projekti toetatud VS Code'i versioonis ja Antigravitys; native chrome'i, mida laiendus juhtida ei saa, ei arvestata DSHmuxi 44 px eelarvesse.
- **C3 — i18n**: uued kasutajale nähtavad stringid lisatakse projekti kõigisse toetatud keeltesse.
- **C4 — ligipääsetavus**: klaviatuur, screen reader, high contrast ja reduced motion kuuluvad valmiskriteeriumisse, mitte järelparandusse.
- **C5 — jõudlus**: suletud sessioonipopup ei tohi tekitada nähtavat pidevat renderdust ega chati streaming'ut häirida; värskendusstrateegia määratakse `solution.md`-s.
- **C6 — protsess**: pärast kasutaja kinnitust tehakse koodifaktidel põhinev `solution.md`, call-site audit ja iseseisev `plan.md`; enne kinnitust implementatsiooni ei alustata.

## 6. Feature'i valmiskriteerium

Feature on valmis ainult siis, kui R1–R8 vastuvõtud on täidetud, nõuete ja plaani RTTM on verifitseeritud ning `TODO.md` ütleb `No outstanding tasks.`. Visuaalse tulemuse kohta lisatakse `verification.md`-sse vähemalt ready-, session-popup-, stopped/error- ja narrow-width oleku ekraanipildid või renderdatud tõendid.

---

**Gate läbitud**: kasutaja kinnitas nõuded 2026-09-13. Järgmine gate on `solution.md` kinnitamine.

*Seotud dokumendid: [discussion.md](discussion.md) | solution.md | plan.md*
