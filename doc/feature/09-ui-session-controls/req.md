# UI session controls — nõuded

**Kuupäev**: 2026-09-13

**Allikad**: [discussion.md](discussion.md), kasutaja tagasiside

**Staatus**: ✅ kasutaja kinnitatud (2026-09-13; R1–R7)

> See dokument määrab **mida** ehitatakse ja kuidas tulemust vastu võtta. Arhitektuur ning konkreetsed failimuudatused kuuluvad pärast nõuete kinnitamist `solution.md` faili.

## 1. Eesmärk

Muuta DSHmuxi aktiivse sessiooni ümbernimetamine, oluliste vestluste leidmine ja DSH protsessi juhtimine kiiremaks, hoides olemasoleva chat-first kujunduse kompaktse ja lihtsana.

## 2. Põhinõuded

### R1 — Aktiivse sessiooni ümbernimetamine header'is

- Aktiivse sessiooni nime topeltklõps header'is peab avama inline rename-režiimi.
- Input peab algama praeguse nimega ja tekst peab olema valitud.
- `Enter` salvestab trimmitud, mittetühja ja muutunud nime olemasoleva DSH rename-toimingu kaudu.
- `Escape` tühistab muudatuse; tühi või muutmata nimi ei käivita rename-toimingut.
- Rename'i ajal ei tohi sessioonide taustauuendus edit-režiimi katkestada.
- Edu korral peab uus nimi ilmuma nii header'is kui sessiooniloendis; vea korral jääb vana nimi alles ja kasutaja näeb veateadet.
- Kui aktiivsel pinnal pole konkreetset sessiooni või DSH pole valmis, ei tohi header'i rename käivituda.
- Sessioonirea olemasolev rename jääb alternatiivse hiire- ja klaviatuuritee jaoks alles.

**Vastuvõtt**:

- nimel topeltklõps → uus nimi → `Enter` uuendab sama sessiooni header'is ja popup'is;
- `Escape`, tühi nimi ja muutmata nimi ei saada rename-päringut;
- polling rename'i sisestamise ajal ei kaota input'i ega kasutaja teksti;
- serverivea korral ei jää UI ekslikult uut nime kuvama.

### R2 — Pinned-vaade ja pin/unpin

- Sessioonivalikus peavad vaated olema järjekorras `Pinned`, `Active`, `Archived`.
- Popup avaneb `Pinned` vaates, kui vähemalt üks nähtav sessioon on pinnitud; muidu avaneb `Active` vaates.
- Aktiivset ja arhiveeritud sessiooni peab saama sessioonirea ligipääsetava kontekstitoiminguga pinnida ning unpinnida.
- Pin on workspace-põhine DSHmuxi eelistus ja säilib VS Code'i reload'i järel.
- Pinned-vaade näitab kõiki praeguse workspace'i pinnitud sessioone, sõltumata nende active/archive olekust, kasutaja määratud pinni järjekorras.
- Pinnitud sessioon jääb nähtavaks ka oma `Active` või `Archived` vaates; pin ei muuda sessiooni archive-olekut.
- Kui sessioon ei kuulu enam praegusesse workspace'i või seda pole enam DSH loendis, ei kuvata seda Pinned-vaates.
- Pin/unpin ei tohi sessiooni avada, ümber nimetada ega arhiveerida.

**Vastuvõtt**:

- sessiooni pin lisab selle kohe `Pinned` vaatesse ja unpin eemaldab selle;
- pinned olek säilib webview ning VS Code'i akna reload'i järel;
- arhiveeritud pinned sessioon on leitav nii `Pinned` kui `Archived` vaates;
- teise workspace'i pinnid ei ilmu praegusesse workspace'i.

### R3 — Valitav full-text otsing sessioonilogidest

- Otsingurea lõpus peab olema märkeruut tekstiga `Full text search` ja selge checked/unchecked olek.
- Märkeruut peab olema hiire ja klaviatuuriga kasutatav ning screen reader'ile korrektselt nimetatud.
- Märkeruut väljas: otsing filtreerib senisel viisil valitud vaate sessioonide pealkirju tõstutundeta ja ilma serveripäringuta.
- Märkeruut sees: mittetühi päring otsib DSH olemasoleva full-text otsingu kaudu praeguse IDE workspace'i kõigi aktiivsete ning arhiveeritud sessioonide kasutaja- ja assistendisõnumitest, sõltumata valitud vaatest.
- Full-text tulemused kuvatakse järjestuses `Pinned`, `Active`, `Archived`; pinned sessiooni ei dubleerita sama tulemuse Active/Archived grupis.
- Iga full-text tulemus näitab sessiooni pealkirja, suhtelist aega ja DSH tagastatud vastekatket.
- Tulemuse valimine avab õige sessiooni olemasoleva sessioonivahetuse kaudu.
- Tühi full-text päring ei käivita serveriotsingut ja kuvab valitud tavavaate.
- Kiire sisestamise korral ei tohi varasema päringu hiline vastus uuema päringu tulemusi üle kirjutada.
- Otsingu ajal on tagasihoidlik loading-olek; vea korral kuvatakse arusaadav teade ning popup jääb kasutatavaks.
- DSH otsingu 20 sessiooni piiri saavutamisel ja lisatulemuste olemasolul peab UI ütlema, et tulemusi on rohkem; selle feature'i raames pagination'it ei lisata.

**Vastuvõtt**:

- sõna, mida ei ole sessioonide pealkirjades, kuid leidub ühe praeguse workspace'i vestluse sõnumis, leiab õige sessiooni ja näitab snippet'it;
- otsing leiab nii aktiivse kui arhiveeritud sessiooni sisu;
- teise workspace'i vasteid ei kuvata;
- checkbox'i väljalülitamine taastab kohe lokaalse pealkirjafiltri;
- aeglasema vana päringu vastus ei asenda uuema päringu tulemust.

### R4 — Kompaktsem sessioonivalik

- Sessioonivaliku dialoogi välisvahed, otsingurida, tab'id ning sessiooniread peavad olema praegusest vertikaalselt kompaktsemad.
- Tavarea kõrgus peab vähenema praeguselt vähemalt 36 CSS px-lt sihini kuni 32 CSS px.
- Otsingukontrollide ja tab'ide kogukõrgus peab vähenema, kuid tekst, checked-olek, focus ring ning rea kontekstitoimingud ei tohi kattuda ega ära lõikuda.
- 320 px laiuses vaates peavad `Pinned`, `Active`, `Archived` ja full-text checkbox mahtuma ilma kogu popup'i horisontaalse scrollbar'ita.
- Kompaktsus ei tohi vähendada loetavust, klaviatuuriga kasutatavust ega VS Code'i high-contrast toe kvaliteeti.

**Vastuvõtt**:

- sama popup'i kõrguse juures mahub nähtavale vähemalt üks sessioonirida rohkem kui enne;
- 240 px, 320 px ja 480 px laiuses ei teki popup'ile horisontaalset overflow'd;
- kõik tab'id, checkbox ja rea tegevused on klaviatuuriga fokuseeritavad ning fookus nähtav.

### R5 — Olekupõhine Start/Stop overflow-menüüs

- Overflow-menüü kõige viimane tegevusrida juhib DSH protsessi.
- DSH `ready` olekus on see `Stop DSH` ja kasutab senist stop-toimingut.
- DSH `stopped` olekus on see `Start DSH` ja kasutab senist start-toimingut.
- DSH `error` olekus on viimane rida `Retry DSH` ning käivitab sama ohutu start/retry voo; kui Doctor on nõutud, peab tegevus selle asemel Doctori avama või olema selgelt asendatud Doctori tegevusega.
- `starting` ja `stopping` olekus on viimane rida vastava progress-tekstiga ning disabled, et vältida topelt- või vastandlikku toimingut.
- Serveri oleku muutudes peab sama avatud menüü rida uuenema ilma webview reload'ita.
- Stopped/error overlay praegune peamine `Start`/`Retry` ja `Doctor` taastamistee jääb alles.

**Vastuvõtt**:

- `Stop DSH` järel overflow uuesti avades on viimane tegevus `Start DSH`;
- `Start DSH` viib olemasoleva state machine'i kaudu ready-olekusse ning menüü viimane tegevus muutub `Stop DSH`-ks;
- kiire korduv aktiveerimine starting/stopping olekus ei tekita dubleerivat protsessitoimingut.

### R6 — KISS ja scope'i kontroll

- Rakendus peab järgima KISS-põhimõtet: kasutada olemasolevat chrome'i, sõnumisilda, DSH RPC-sid ja VS Code'i workspace-state'i.
- DSHmuxi ei lisata uut full-text indeksit, logifailide parserit, otsinguteenust, state-management raamistikku ega kolmanda osapoole runtime-sõltuvust.
- Upstream DSH UI-d, DSH sessiooniandmete formaati ja DSH serverit ei muudeta.
- Full-text otsing kasutab olemasolevat DSH tulemuspiiri; pagination või lõputu scroll ei kuulu sellesse round'i.
- Extension'i versioon tõstetakse patch-versioonina `0.4.7` pealt `0.4.8` peale ning `package.json` ja `package-lock.json` jäävad omavahel kooskõlla.
- Olemasolevad sessiooni loomise, avamise, rename'i, archive'i, DSH sidebar'i peitmise/näitamise, editor-tab'i, Doctori, settings'i ja upgrade-kanalite töövood peavad säilima.

**Vastuvõtt**:

- package manifestis ei lisandu runtime-sõltuvust ning nii `package.json` kui `package-lock.json` näitavad versiooni `0.4.8`;
- lahendus kasutab DSH `session.search` ja `session.rename` operatsioone, mitte paralleelset logi- või rename-mehhanismi;
- olemasolevate UI töövoogude regressioonitestid läbivad.

### R7 — Reload ei varasta külgriba fookust

- DSHmuxi extension'i aktiveerimine, VS Code'i akna reload või extension host'i restart ei tohi DSHmuxi vaadet automaatselt avada ega fookusesse tuua.
- Kui enne reload'i oli aktiivne Codex, Copilot Chat või mõni muu külgriba vaade, peab DSHmux laskma VS Code'il selle vaate loomulikult taastada.
- DSHmuxi view provider peab taustal registreeruma ning vajaduse korral võib DSH protsess automaatselt käivituda, kuid kumbki tegevus ei tohi külgriba valikut muuta.
- Kasutaja otsene DSHmuxi avamine peab endiselt toimima.
- Kasutaja otsene `DSHmux: Start` käsk võib pärast edukat käivitamist DSHmuxi chati avada, sest see on teadlik fookust muutev toiming.
- Parandus peab järgima KISS-põhimõtet: eraldi aktiivse külgriba state'i, taastamisloogikat ega uut API-kihti ei lisata.

**Vastuvõtt**:

- kui Codex või Copilot Chat on aktiivne, siis `Developer: Reload Window` ei too DSHmuxi esiplaanile;
- sama kehtib siis, kui DSH oli enne reload'i käimas ja käivitatakse taustal automaatselt uuesti;
- DSHmuxi ikooni/vaate valimine avab chati tavapäraselt;
- otsene `DSHmux: Start` käsk säilitab senise DSHmuxi chati avamise käitumise;
- automaatset fookuse taastamise state'i ega uut sõltuvust ei lisandu.

## 3. Üldised kvaliteedinõuded

- Kõik uued nähtavad tekstid peavad kasutama olemasolevat i18n mehhanismi vähemalt eesti ja inglise keeles.
- Kasutaja või DSH tagastatud tekst paigutatakse DOM-i ohutult tekstina, mitte HTML-ina.
- Uued async toimingud peavad olema veataluvad ega tohi jätta UI-d püsivalt pending-olekusse.
- Lisada tuleb proportsionaalsed unit-/DOM-testid header rename'i, pinni püsivuse, full-text otsingu race'i ja workspace-filtri, Start/Stop menüü olekute ning aktiveerimisel fookuse säilitamise jaoks.
- `npm test` ja `npm run compile` peavad läbima.

## 4. Scope'ist väljas

- vestluste sisu või snippet'ide muutmine;
- full-text otsingu reitingu, tokenizer'i või indeksi ümbertegemine;
- otsing üle teiste IDE workspace'ide;
- pinni sünkroniseerimine DSH serveri, teiste masinate või VS Code Settings Synci kaudu;
- sessiooni unarchive/delete või pinned sessioonide drag-and-drop järjestamine;
- täiendav major/minor versioonimuutus peale nõutud patch bump'i `0.4.8` peale.

## 5. Valmiskriteerium

Feature on valmis, kui R1–R7 vastuvõtukriteeriumid on kontrollitud, regressioonitestid ja compile läbivad, `verification.md` ei sisalda lahendamata nõudelünka ning automaatselt koostatud `TODO.md` ütleb `No outstanding tasks.`

*Seotud dokumendid: [discussion.md](discussion.md) | solution.md | plan.md*
