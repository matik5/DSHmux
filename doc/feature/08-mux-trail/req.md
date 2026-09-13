# Mux Trail — nõuded

**Kuupäev**: 2026-09-13

**Allikas**: [discussion.md](discussion.md)

**Staatus**: ✅ kasutaja kinnitatud (2026-09-13)

> See dokument määrab **mida** ehitatakse ja kuidas tulemust vastu võtta.
> Arhitektuur, failimuudatused ning tehniline teostus kuuluvad pärast nõuete
> kinnitamist `solution.md` faili.

## 1. Eesmärk

Lisada DSHmuxi väike vabatahtlik ooteajamäng **Mux Trail**, mida saab mängida
ainult nähtava sessiooni aktiivse AI-töö ajal. Mäng peab olema lõbus easter egg,
mitte uus põhitöövoog: see ei tohi takistada prompti, vastuse streamimist,
küsimusi, approval'e, sessioonivahetust ega tavalist chati kasutamist.

## 2. Põhinõuded

### R1 — Tagasihoidlik ja vabatahtlik avamine

- Tavalises idle-olekus ei ole mängu chromet, overlay'd ega püsivat mängupaneeli.
- Kui nähtava sessiooni AI-töö kestab vähemalt 3 sekundit, ilmub väike
  mänguikoon selgelt leitava tooltip'i ja ligipääsetava nimega.
- Ikoon ei tohi katta prompti composer'it, olulist chati sisu ega DSHmuxi
  küsimuse/approval'i toiminguid.
- Mäng ei avane ega hakka liikuma automaatselt. Voor saab alata ainult kasutaja
  teadliku aktiveerimise ja esimese suunasisendi järel.
- Ikooni ignoreerimine ei muuda olemasolevat ootekogemust.
- Kui töö lõpeb enne 3 sekundi täitumist, ei tohi ikoon korraks vilkuda.

### R2 — Mux Traili mängureeglid

- Mänguväljal juhib kasutaja kasvavat signaalirada ja korjab eristatavaid
  pakette.
- Juhtimine töötab nooleklahvide ja `WASD`-iga.
- Iga korjatud pakett kasvatab rada ja jooksva vooru skoori ühe võrra.
- Väljaku servast väljumine jätkab vastasservast; oma rajaga kokkupõrge lõpetab
  vooru.
- Uus pakett ei sünni raja sees ega väljaspool nähtavat ruudustikku.
- Vastassuuna sisend ühe sammu jooksul ei tohi tekitada ebaausat kohest
  enesekokkupõrget.
- Kiirus võib skooriga mõõdukalt kasvada, kuid mäng peab jääma kitsas
  külgribavaates juhitavaks.
- Vooru lõpp näitab skoori ning pakub ühe klahvi või nupuga uut vooru seni,
  kuni AI-töö kestab.
- Elus vooru current state ja current score salvestatakse sessioonipõhiselt
  VS Code'i webview state'i ning taastatakse järgmisel sobival ooteajal.
- Surm või võit eemaldab jätkatava vooru, kuid max score säilib ja kuvatakse
  jooksva skoori kõrval. Edetabelit ei ole.

### R3 — AI-töö lifecycle on alati ülimuslik

- Mängu saab pakkuda ainult tegelikult nähtava/avatud sessiooni AI-töö ajal;
  teise sessiooni või taustaagendi sündmus ei tohi mängu avamisikooni käivitada.
- AI vastus peab jätkama mängu ajal normaalselt streamimist ja salvestumist.
- Kui nähtava sessiooni töö lõpeb, lõpetatakse mäng, eemaldatakse ikoon ning
  suletakse mängukiht kohe, et valmis vastus oleks nähtav.
- Kui DSH küsib kasutajalt küsimust või approval'it, kehtib sama kohene
  sulgemine; mäng ei tohi varjata vajalikku inimvastust.
- Dubleeritud või eri allikatest saabuvad lõpusignaalid peavad olema ohutud ja
  idempotentsed.
- Sessiooni vahetamine, dokumendi reassemble, serveri peatumine/viga ja webview
  dispose lõpetavad vooru ega jäta listener'eid, timer'eid või vana overlay'd.
- Kui webview või aken pole nähtav, pausib mäng ega kuluta aktiivse animatsiooni
  ressursse; naasmisel võib pooleliolev voor jätkuda ainult siis, kui sama töö
  on endiselt aktiivne.

### R4 — Sisend, sulgemine ja ligipääsetavus

- Mängukihil on nähtav pealkiri, jooksva skoori tekst, lühike juhtimisjuhis ja
  sulgemisnupp.
- `Escape` sulgeb mängu igal hetkel. Vooru lõppedes saab `Enter`-i või selgelt
  märgitud nupuga uuesti alustada.
- Mäng püüab noole- ja täheklahve ainult siis, kui mängukiht on avatud. Suletud
  mäng ei tohi mõjutada composer'it, chati shortcut'e ega screen reader'i
  navigeerimist.
- Mängu avamisel liigub fookus mängukihile; käsitsi sulgemisel taastub fookus
  avamisikoonile või muule stabiilsele chati elemendile.
- Canvas'i või muu visuaalse renderduse kõrval peab assistive technology saama
  aru mängu eesmärgist, olekust, skoorist ja sulgemisviisist; skoorimuutused ei
  tohi tekitada pealetükkivat live-region'i spämmimist.
- Pakkumine ja mängukiht peavad toimima vähemalt 240 px, 320 px ja 480 px
  laiuses ilma horisontaalse scrollbar'i või lõigatud sulgemisnupuga.
- Värvid kasutavad aktiivse VS Code'i light-, dark- ja high-contrast teemat;
  rada, pakett ja taust on eristatavad ka ilma ainult värvile lootmata.
- `prefers-reduced-motion` korral ei ole ikoonil pulseerivat ega dekoratiivset
  animatsiooni. Tegelik gameplay liigub alles pärast kasutaja selget käsku.

### R5 — Originaalne, lokaalne ja sõltuvusteta sisu

- Kogu mängukood, nimi, tekst ja visuaalid luuakse selles repos nullist ning
  kuuluvad projekti olemasoleva MIT-litsentsi alla.
- Ühtegi kolmanda poole mängumootorit, npm-paketti, koodinäidet, sprite'i,
  helifaili, fonti ega muud mänguvara ei lisata.
- Toode ei kasuta `Tetris` nime, tetromino-esitlust ega mõne tuntud mängu
  äratuntava ekraani/kujunduse koopiat.
- Mäng kasutab ainult lihtsaid DSHmuxi-teemalisi geomeetrilisi elemente ning
  nime **Mux Trail**.
- Mäng ei tee võrgu-, faili- ega clipboard-päringuid, ei saada telemeetriat ja
  ei lisa kasutaja promptile või DSH sündmustele andmeid.

### R6 — Isolatsioon, jõudlus ja ühilduvus

- Mängu vea korral peab DSH chat, transport, streamimine, completion-sound,
  teemasünkroon ja clipboard jätkama töötamist.
- Mäng ei muuda ega peata DSH WebSocketi või HTTP relay kaadreid; ta võib
  kasutada ainult juba nähtud olekusignaale oma lifecycle'i juhtimiseks.
- Kui mäng pole avatud või webview pole nähtav, ei tööta pidev render-loop.
- Aktiivse mängu loogikakiirus on piiratud ja ei põhjusta märgatavat CPU kasvu
  tavalisel VS Code'i hostil.
- Funktsioon töötab nii primaarses külgriba chat-view's kui editor-tab paneelis.
- Olemasolev serveri/session-loading/error overlay jääb ülimuslikuks ning mängu
  ei pakuta, kui chat pole kasutusvalmis.
- Säilib praegu toetatud DSH sündmuste ühilduvus; tundmatu või vigane kaader
  jäetakse ohutult vahele ning see ei ava mängu.
- Kõik kasutajale nähtavad tekstid ja ligipääsetavad nimed on olemas kõigis
  DSHmuxi toetatud keeltes; mängu pärisnimi **Mux Trail** jääb tõlkimata.

### R6a — Vooru taastamine

- Salvestatud state sisaldab ainult mänguruudustikku, rada, suunda, packet'it,
  current score'i ja max score'i; prompti ega DSH event payload'e ei salvestata.
- State valideeritakse enne taastamist. Vigane, vana versiooniga või surnud
  voor jäetakse ohutult kõrvale.
- Mängu salvestus peab jagama VS Code'i webview state'i teiste kasutajatega:
  olemasolevaid tundmatuid state-välju ei tohi üle kirjutada.

### R7 — Kontrollitav kvaliteet

- Deterministlikud testid katavad vähemalt: 3 sekundi viite, lühikese töö puhul
  ikooni puudumise, ühe start-signaali, dubleeritud start/lõpp-signaalid,
  completion'i, question'i, approval'i, sessioonivahetuse ja dispose'i.
- Testid tõendavad, et taustsessiooni sündmus ei paku mängu nähtavas sessioonis.
- Mängureeglite testid katavad liikumise, keelatud vastassuuna, servast
  wrap'imise, paketi korjamise/kasvu, paketi lubatud asukoha, enesekokkupõrke,
  skoori ja restarti.
- Sisenditest tõendatakse, et suletud mäng ei püüa ühtegi gameplay-klahvi ning
  avatud mängu `Escape` sulgeb ja puhastab aktiivse loop'i.
- Renderdus või DOM-test kontrollib kitsast vaadet, semantilisi nimesid ja
  light/dark/high-contrast tokenite kasutust.
- Persistence-test katab elusa vooru taastamise samas sessioonis, surnud vooru
  eemaldamise, max score'i säilimise ja tundmatu webview state'i allesjätmise.
- Olemasolevad bridge-, document-assembly-, chat-view- ja panel-testid jäävad
  roheliseks; compile, kogu unit-test suite ja VSIX package kontroll läbivad.

## 3. Vastuvõtustsenaariumid

1. **Kiire vastus**: AI lõpetab 2 sekundiga; mänguikooni ei ilmu ja chat käitub
   täpselt nagu varem.
2. **Pikk vastus, mängu ei avata**: 3 sekundi järel ilmub väike ikoon, kuid
   stream ja sisend jätkavad tavaliselt; töö lõppedes ikoon kaob.
3. **Pikk vastus, mäng avatakse**: kasutaja avab Mux Traili, juhib seda
   klaviatuuriga ja näeb skoori; AI vastuse lõpp sulgeb mängu ning valmis vastus
   on kohe nähtav.
4. **Inimvastust vajav töö**: mängu ajal saabub question või approval; mäng
   sulgub ja vajalik DSH kontroll on kasutatav ilma lisasammuta.
5. **Kaks sessiooni**: taustsessioon töötab, nähtav sessioon on idle; mänguikooni
   ei ilmu. Nähtava sessiooni töö käivitamisel ilmub see pärast viidet.
6. **Jätkamine**: vastus sulgeb elusa vooru; sama sessiooni järgmisel pikemal
   ooteajal taastuvad rada, packet, current score ja max score.
7. **Lifecycle**: avatud mängu ajal vahetatakse sessiooni, peidetakse webview või
   peatatakse server; vana mäng ei jää nähtavaks ega tööta taustal.
8. **Kitsas/high-contrast vaade**: 240 px laiuses on mäng, skoor ja sulgemine
   kasutatavad ning rada/pakett on mustrite või kuju järgi eristatavad.

## 4. Selgelt scope'ist väljas

- Tetris või mõne muu konkreetse kommertsmängu kloon, nimi, varad või täpne
  visuaalne jäljendus.
- Multiplayer, globaalne edetabel, achievement'id, kontod või skoori
  sünkroonimine.
- Globaalne/online high-score tabel, analytics, telemetry või võrguteenused.
- Mobiili/touchi eraldi juhtpult, gamepad ja heli esimeses versioonis.
- Mängu eraldi VS Code command, setting, Activity Bar view või alati nähtav
  paneel.
- Upstream DSH Web UI sisemise loading-indikaatori või composeri ümbertegemine.

## 5. Kinnitusega tehtavad valikud

Käesoleva mustandi kinnitamine kiidab heaks järgmised soovitatud valikud:

1. mäng on originaalne snake-like **Mux Trail**, mitte langevate klotside mäng;
2. ikoon ilmub alles nähtava sessiooni 3 sekundi pikkuse AI-töö järel;
3. mäng avaneb ainult kasutaja soovil ja sulgub automaatselt vastuse,
   küsimuse või approval'i saabumisel;
4. funktsioon töötab nii külgriba chat-view's kui editor-tab paneelis;
5. esimeses versioonis puuduvad setting, mänguheli ja online-edetabel; lokaalne
   max score ja elusa vooru state säilivad.

2026-09-13 lisas kasutaja samasse feature-round'i nõude säilitada elusa vooru
current state/current score ning max score ja andis korralduse see samas
worktree's implementeerida, ilma eraldi feature-nõuet loomata.

Kasutaja andis 2026-09-13 korralduse kinnitada nõuded, kinnitada järgnev
`plan.md` ja feature implementeerida. Selle korralduse alusel võib pipeline
jätkuda ilma järgmise eraldi kinnitusküsimuseta, kuid lahendus ja plaan peavad
endiselt olema auditeeritud ning dokumenteeritud.

*Seotud dokumendid: [discussion.md](discussion.md)*
