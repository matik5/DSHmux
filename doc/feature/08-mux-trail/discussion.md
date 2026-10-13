# Mux Trail — arutelu

**Kuupäev**: 2026-09-13

**Allikad**: kasutaja idee; käesoleva lähtekoodi audit; U.S. Copyright Office'i
üldjuhis mängude autoriõiguse kohta

**Etapp**: Feature Pipeline'i lähtearutelu

> Kuna `req.md` on loodud, on see fail edaspidi nõuete allikana **read-only**.
> Uued või muudetud nõuded tuleb kanda otse `req.md` faili.

## 1. Kasutaja soov

Lisada DSHmuxi lihtne ja lõbus easter egg, mida kasutaja saab mängida ajal,
mil AI promptile vastab. Esialgsete näidetena nimetati Tetrise- või ussimängu
laadset JavaScripti minimängu. Lahendus ei tohi kopeerida kolmanda poole koodi,
graafikat, heli ega muud kaitstud teost.

## 2. Soovitus: Mux Trail

Soovitatud mäng on **Mux Trail**: väike ruudustikumäng, kus kasutaja juhib
kasvavat signaalirada ja korjab pakette. Mehaanika meenutab üldisel tasemel
klassikalist ussimängu, kuid nimi, visuaalne keel, tekstid, reeglite täpne
kombinatsioon ja kogu lähtekood on DSHmuxi jaoks originaalsed.

Soovitatud esimese versiooni reeglid:

- suunda saab muuta nooleklahvide või `WASD`-iga;
- paketi korjamine kasvatab rada ja skoori;
- väljaku servast liikumine toob signaali vastasservast tagasi;
- oma raja puudutamine lõpetab vooru;
- mäng algab alles esimese suunaklahviga ning lõppenud vooru saab ühe
  klahvivajutusega uuesti alustada;
- püsivat edetabelit, kontot, võrguühendust ega eraldi helisid ei ole.

See on sobivam kui langevate klotside mäng, sest seda on lihtsam teha hästi
kitsas VS Code'i külgribas ning selle nimi ja kujundus ei pea meenutama ühtegi
konkreetset tuntud toodet.

## 3. Kaalutud variandid

| Variant | Pluss | Miinus | Otsus |
|---|---|---|---|
| **Mux Trail** | Väike reeglistik, sobib kitsasse vaatesse, ainult geomeetrilised kujundid | Vajab korrektset klaviatuuri- ja lifecycle-haldust | **Soovitatud** |
| Packet Pong | Väga tuttav ja lihtne | Füüsika ning automaatse vastase tunnetus lisavad rohkem häälestamist | Varuvariant |
| Ühe nupuga Mux Runner | Kõige lihtsam sisend | Töötab kitsas vertikaalses külgribas halvemini | Varuvariant |
| Langevad klotsid | Kohe arusaadav | Suurem teostus, rohkem äratuntava nime/kujunduse riski | Mitte esimene valik |

## 4. Soovitatud kasutuskogemus

Tavaline chat ei muutu. Kui nähtava sessiooni AI-töö on kestnud vähemalt kolm
sekundit, ilmub chati serva väike tagasihoidlik mänguikoon. Mäng ei avane ega
käivitu automaatselt.

```text
AI töötab…                                      [◇]

                    kasutaja avab ikooni
                              ↓

┌─────────────────────────────────────┐
│ Mux Trail              Skoor 04  [×]│
│                                     │
│       · · · · · · · · · ·           │
│       · · ■ ■ ■ ● · · · ·           │
│       · · · · · · · ◆ · ·           │
│       · · · · · · · · · ·           │
│                                     │
│ Nooled / WASD · Esc sulgeb           │
└─────────────────────────────────────┘
```

- Ikoon ei võta fookust ega kata composer'it enne, kui kasutaja selle valib.
- Mäng avaneb chati kohal ajutise kihina ja on alati suletav `Escape`-klahvi
  või nähtava sulgemisnupuga.
- AI vastus jätkab mängu taga laadimist; mäng ei muuda prompti ega sessiooni.
- Kui vastus valmib või DSH vajab küsimusele/permission-promptile kasutaja
  vastust, lõpetatakse voor ja mängukiht suletakse kohe, et päris töö oleks
  taas esiplaanil.
- Sessiooni vahetus, serveri peatumine või webview peitmine lõpetab või pausib
  mängu puhtalt.

## 5. Lähtekoodist kontrollitud faktid

| ID | Fakt | Tõend |
|---|---|---|
| F1 | DSHmux ei renderda chatti ise, vaid assemble'ib jooksva DSH serveri HTML-i ja süstib sellesse oma bridge-skripti enne DSH shell-bundle'it. | `src/documentAssembly.ts:23,199-200,260-274` |
| F2 | Sama `media/bridge-client.js` süstitakse nii primaarsesse külgriba chatti kui ka teisesesse editor-tab paneeli. | `src/dshChatView.ts:334-360`; `src/dshPanel.ts:243-262` |
| F3 | Bridge näeb juba kõiki relay kaudu saabunud WebSocketi kaadreid enne, kui need DSH kliendile edasi antakse. | `media/bridge-client.js:542-547` |
| F4 | Praegune completion-sound loogika tunneb nii DSH >= 0.1.2 multipleksitud kaadreid kui ka vanemat payload-kuju. | `media/bridge-client.js:211-238,377-484` |
| F5 | AI töö algust saab olemasolevas voos tuvastada `turn/start` sündmusest ja `api-session/status` väärtusest `true`; lõppu `turn/end` sündmusest või running `true → false` servast. | `media/bridge-client.js:400-433,447-484` |
| F6 | Küsimuse ja approval'i sündmused on juba eristatavad ning neid kasutatakse “ask” heli jaoks. | `media/bridge-client.js:410-431,460-483` |
| F7 | Praegune bridge hoiab running-olekut sessiooni/agent-ID järgi, kuid follow-streami `event` väärtus ei kanna alati sessiooni ID-d. Nähtava sessiooni täpne piiramine vajab lahenduse etapis eraldi kontrolli. | `media/bridge-client.js:244-245,444-484` |
| F8 | Webview saab VS Code'i teema CSS-muutujad ning bridge rakendab DSH semantilistele värvidele VS Code'i tokenid. | `media/bridge-client.js:43-120` |
| F9 | Praegused bridge'i testid käivitavad skripti isoleeritud fake-window keskkonnas ja katavad start/done/ask kaadrite mõlemad protokollikujud. | `test/bridgeClient.test.js:1-92,291-630` |
| F10 | Sessiooni vahetus asendab kogu webview dokumendi ja lähtestab vanad socketid; minimängu voor ei saa ega pea dokumendivahetust üle elama. | `src/dshChatView.ts:291-318,329-381`; `src/dshPanel.ts:243-274` |

## 6. Intellektuaalomandi piir

U.S. Copyright Office eristab mängu ideed ja mängumeetodit nende konkreetsest
tekstilisest, visuaalsest ning programmilisest väljendusest: üldine idee või
mängimisviis ei ole autoriõiguse objekt, aga kood ja graafika võivad olla
kaitstud. See ei ole jurisdiktsioonideülene õigusarvamus, vaid konservatiivse
tootedisaini lähtekoht.

Seetõttu peab Mux Trail:

- olema kirjutatud nullist selles repos ja litsentsitud koos projektiga MIT all;
- kasutama ainult oma nime, tekste ja lihtsaid geomeetrilisi kujundeid;
- mitte importima mängukoodi, sprite'e, muusikat, fonte ega muid varasid;
- mitte kasutama `Tetris` nime, äratuntavaid tetromino-esitlusi ega mõne teise
  mängu ekraanipaigutuse pikslitäpset koopiat.

Allikas: [U.S. Copyright Office — Games](https://www.copyright.gov/register/tx-games.html).

## 7. Toote- ja tehnilised riskid

- **Vale sessioon**: globaalne status-sündmus võib kirjeldada muud agenti kui
  nähtav chat. Mängu affordance ei tohi ilmuda taustsessiooni tõttu.
- **Võistlevad lõpusignaalid**: `turn/end` ja status-edge võivad saabuda sama
  töö kohta mõlemad. Sulgemine peab olema idempotentne.
- **Sisendikonflikt**: suunaklahve ja `WASD`-i ei tohi püüda, kui mäng pole
  avatud; pärast sulgemist peab fookus naasma arusaadavasse kohta.
- **Jõudlus**: peidetud või suletud mäng ei tohi jätta aktiivset timer'it ega
  render-loop'i. Webview peitumisel peab mäng pausima.
- **Upstream DOM**: DSH UI klassinimed ja struktuur võivad versiooniti muutuda.
  Lahendus ei tohiks sõltuda sisemise spinneri või composeri CSS-selectorist.
- **Oleku-overlay'd**: serveri/session-loading overlay on olemas ja kasutab
  kõrget z-index'i; mäng ei tohi ilmuda käivitamise, vea ega sessioonivahetuse
  peale.
- **Paralleelne feature 07**: chat-first UI ümberkorraldus on eraldi worktree's
  pooleli. `solution.md` peab enne teostust auditeerima selleks hetkeks
  tegelikult merge'itud UI ning vältima sama chrome'i dubleerimist.

## 8. Otsused, mida `req.md` kinnitamine heaks kiidab

| ID | Küsimus | Soovitatud otsus |
|---|---|---|
| D1 | Milline mäng? | Originaalne snake-like **Mux Trail**, mitte Tetrise kloon. |
| D2 | Millal pakkumine ilmub? | Ainult nähtava sessiooni vähemalt 3 s kestva AI-töö ajal. |
| D3 | Kas mäng avaneb ise? | Ei; ainult väikesest ikoonist või klaviatuuriga aktiveerimisel. |
| D4 | Mis juhtub vastuse valmides? | Mäng peatub ja sulgub kohe; chat/vastus saab fookuse. |
| D5 | Millistel pindadel? | Nii külgriba chat kui editor-tab, sest neil on ühine bridge. |
| D6 | Kas salvestada rekord? | Ei; ainult jooksva vooru skoor, ilma storage'i ja telemeetriata. |
| D7 | Kas lisada setting või heli? | Esimeses versioonis ei; affordance on vaikne ja vabatahtlik. |

*Seotud dokumendid: [req.md](req.md)*
