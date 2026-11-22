# advent.dinglebop.io

**Det store juleescaperoom:** Finn (hund) har stjålet adventsgaven og låst den inde
i en kiste med en 4-cifret hængelås. Hver søndag i advent åbner et rum med en
prøve, der giver ét ciffer. Historien og personerne står i [LORE.md](LORE.md).

## Forsiden

Forsiden (`https://advent.dinglebop.io/`) har en escape room-adventskrans
(kæde, gran, timeglas, kompas og et nøglehul i midten), hvor de fire portaler
er lysene: en åben portal har en flamme, en låst kun en væge. Kransen er 3D
(den ligger på skrå, og portalerne står op på den), svajer lidt og kan drejes
med fingeren. Portalerne har
intet navn, kun ugens titel. Over kransen ligger Finns afpresningsbrev, foldet
sammen og med et rødt "1", indtil hun har åbnet det. Hver låst portal har sin
egen nedtælling. Under kransen er kodelåsen "Finns kiste", der viser de cifre,
hun har fundet. En portal er tåget og låst indtil sin søndag
(`SUNDAYS` i `site/app.js`). Derefter hvirvler den med ugens emoji og titel
(fra `overskrift` i `opgave.json`) og suger hende ind på ugens side. Når
ugen er klaret, bliver portalen gylden med ✓. Der er kun én QR-kode: den
til forsiden. Tilføj `?debug` til adressen for at låse alle op. I debug kan ugens gåde
altid startes forfra med "↺ Start forfra".

## Introen: QR-koden → Finns brev → find plakaten (`/0-nun8bGHjmO4x73BKgnNA`)

QR-koden (`qr/forside.png`) peger på introen, som har sin egen hemmelige
adresse. `0` betyder "før uge 1". Introen består af `site/intro.html` og
`site/intro.js`, og `site/0-…/intro.json` har forsidens sti og `hold`
(sekunder):

1. Finns brev "afspilles": en kuvert, og så brevet linje for linje (tryk = resten
   med det samme). Brevet står i `site/brev.js` og er det samme som "Brev fra
   Finn" på forsiden, som derefter tæller som læst.
2. "Videre" starter kameraet i fuld skærm. Hun skal finde Kusama-plakaten.
   Genkendelsen kører kun på den del af billedet, hun selv ser.
3. Mens plakaten er i billedet, åbner en portal oven på den: en gylden ramme
   der tegnes rundt, en hvirvel indeni, gnister, og stuen bliver mørkere. Den
   følger plakaten i perspektiv. Plakaten skal være i billedet i `hold` sekunder.
   Et kort udfald (op til 1 sekund) sætter den bare på pause. Er den væk
   længere, lukker portalen, og hun starter forfra.
4. Når portalen er helt åben, fylder lyset skærmen, portallyden spiller, og hun
   sendes videre til forsiden.

Det huskes (`advent:intro-klaret`), så en ny scanning går direkte til forsiden.
`?forfra` spiller introen igen. `?debug` giver en spring-over-knap og en
debug-linje. Hints undervejs: efter 25 sekunder "det hænger på en væg 🖼️",
efter 50 sekunder "Bjerge, en flod og græsmarker. Japan 🗻". Efter 2 minutter
kommer et link "Gå ind alligevel".

Genkendelsen (`site/plakat.js`, ORB) kører i en Web Worker
(`site/plakat-worker.js`), så OpenCV aldrig får animationen til at hakke.
Introen og workeren får `'unsafe-eval'` og `'wasm-unsafe-eval'` i CSP (se
`nginx.conf`). Resten af sitet har den stramme CSP.

## Forsiden (hemmelig adresse)

Forsiden ligger ikke på `/`, men på en tilfældig sti:
`https://advent.dinglebop.io/qvqdH8iwVaf9EJalg2AF`. Hun kommer dertil via introen. Mappen `site/qvqdH8iwVaf9EJalg2AF/` har
`portaler.json` med ugernes mapper i rækkefølge. `app.js` er offentlig og
indeholder derfor hverken forsidens sti eller ugernes links. `/` og alle andre
stier giver 404 (nginx og `tools/serve.mjs`), og ugens "← Alle portaler" bruger
den forside, hun sidst har åbnet. Ny adresse: omdøb mappen, og lav QR-koden om.

## Fuld skærm (⛶)

På ugens side sidder en ⛶-knap nederst til højre. Den skjuler sidehoved, krans
og tilbage-link, så opgaven fylder hele skærmen (`html.fs` i `style.css`,
`fullscreenToggle()` i `app.js`):

- Mock-iPhonen mister ramme og falsk statuslinje og *er* skærmen.
- Bil-telefonen beholder sin ramme, så USB-kablet kan være under den.
- Tegnefilm, melodilås og kameraer fylder bredden, og tegnefilmene også højden.
- Hint, "Læs Finns beskeder igen" og "Start forfra" ligger under opgaven.

Hvor browseren tillader det (Android, desktop, iPad), skjuler Fullscreen API'et
også browserens egne bjælker. iPhone tillader det ikke for websider, så der er
det kun CSS. Valget huskes på enheden (`advent:fuldskærm`). ✕ lukker fuld skærm.

## Ugerne

Hver uge er en mappe i `site/` med et tilfældigt navn (så man ikke kan gætte
næste uges link). Tallet foran er ugenummeret. Links og QR-koder ligger i `qr/`.

```
site/1-1bCcfjnGB7cO/brev.txt   ->  https://advent.dinglebop.io/1-1bCcfjnGB7cO
```

`brev.txt`:

- første linje = overskrift
- resten = brevet (tom linje = nyt afsnit, linjeskift bevares)
- billeder: læg filen i mappen og skriv filnavnet (`foto.jpg`) på en linje for
  sig selv. Hold dem små, fx `sips -Z 1600 foto.jpg`

## Ugens opgave (valgfri)

Læg en `opgave.json` i uge-mappen. Flowet er så:

1. Hun trykker på en portal, og hendes telefon står på låseskærmen. Det er den
   samme telefon, hun bagefter løser gåden på: telefonen med apps (uge 1–3) og
   telefonen, der skal i bilen (uge 4). Efter et øjeblik kommer en notifikation
   fra "Finn 🐾". Når hun trykker på den, åbner tråden i Beskeder, og Finns
   beskeder tikker ind én ad gangen med "…", mens han skriver (`site/sms.js`).
   Et tryk i tråden springer ventetiden over.
   - Den første besked er et "foto" af første linje i `brev.txt` i udklippede
     bogstaver (som afpresningsbrevet på forsiden).
   - Hvert afsnit i `brev.txt` bliver én besked; lange afsnit deles ved
     punktum. En linje med kun et filnavn bliver et billede i tråden.
   - Sidens store overskrift er `overskrift` fra `opgave.json`.
2. Når alle beskeder er kommet, viser "Gå hjem" telefonens hjemmeskærm med
   apps (eller kablet i bilen), og gåden går i gang. Har hun læst beskederne
   før (eller løst en app), springer telefonen dem over næste gang
   (`advent:<uge>:sms-læst`). "Start forfra" viser dem igen. En uge uden telefon får en telefon
   alene til beskederne og en "Videre →"-knap.
3. Finns beskeder kan læses igen ved at åbne **Beskeder** i telefonens dock
   (eller med "💬 Læs Finns beskeder igen" under gåden). "‹" eller "Gå hjem"
   fører tilbage til hjemmeskærmen. Telefonen har altid samme størrelse, og
   apps scroller indeni.
4. Når gåden er løst, vises tallet. Telefonen husker det, og næste gang går
   den direkte til tallet.

### Fælles felter

- `type`: hvilken gåde (se nedenfor).
- `tal`: det tal, der låses op.
- `løst`: teksten under tallet.
- `overskrift` / `tekst` (valgfri): vises over gåden. Udelad dem for ikke at
  afsløre noget.
- `knaphint` (valgfri): en lille "💡 Hint"-knap, der skal holdes inde i 1,5 s.
  - `{ "type": "konfetti", "emoji": "🐼" }` regner emojien ud over skærmen
    (`"antal"` styrer hvor mange, standard 80)
  - `{ "type": "tekst", "tekst": "Kig i køkkenet 👀" }` viser en kort tekst

  Nye typer tilføjes i `site/hints.js`.
- Står der tekst i `brev.txt` under overskriften, er det Finns beskeder, som vises før gåden.

### Gåde-typer

**`stregkode`**: scan den rigtige stregkode med kameraet (uge 2).

```json
{ "type": "stregkode", "stregkode": "4037400716206", "tal": "9" }
```

`stregkode` er tallene under stregkoden (mellemrum er ligegyldige). Virker
kameraet ikke, kan koden tastes ind.

**`kryds`**: lille kryds og tværs (uge 1).

```json
{ "type": "kryds", "tal": "4", "ord": [
  { "svar": "PANDA", "ledetråd": "Sort og hvidt dyr", "række": 1, "kolonne": 1, "retning": "vandret" },
  { "svar": "NISSE", "ledetråd": "Bor på loftet",     "række": 1, "kolonne": 3, "retning": "lodret" }
] }
```

Række/kolonne starter ved 1 og er hvor ordet begynder. Ord, der krydser, skal
have samme bogstav i krydset (står i browser-konsollen hvis ikke). Numrene
sættes automatisk. Æ, Ø og Å virker.

**`svar`**: skriv det rigtige svar (placeholder til uge 3).

```json
{ "type": "svar", "spørgsmål": "Hvad hedder rensdyret med den røde næse?", "svar": ["rudolf", "rudolph"], "tal": "2" }
```

Store/små bogstaver, mellemrum og tegn ignoreres.

**`bestilling`**: en bon med en gåde og en kasseterminal, hvor hun taster et
nummer og trykker "BESTIL".

```json
{ "type": "bestilling", "svar": "8", "ret": "Rød karry i kokosmælk", "tal": "3",
  "bon": ["STED:  Hvidt. Stort. Har en\n       snabel. Bor i Holte.", "RET:   Rød karry."],
  "næsten": { "13": "Rød karry, ja… men ikke vores 😉" } }
```

`bon` er linjerne på bonen (`\n` = linjeskift). `ret` bliver printet på bonen,
når svaret er rigtigt. `næsten` giver en venligere besked ved bestemte forkerte
svar.

**`trin`**: flere små gåder efter hinanden med et fælles tema (uge 3:
hyggeaften). Hvert trin skal løses før det næste vises; telefonen husker, hvor
langt hun er nået. Tallet kommer, når sidste trin er klaret.

```json
{ "type": "trin", "overskrift": "Hyggeaften 🛋️", "tal": "8", "trin": [
  { "type": "wolt", "navn": "Mad",  "ikon": "🍛", … },
  { "type": "rema", "navn": "Slik", "ikon": "🍬", … },
  { "type": "tv",   "navn": "TV",   "ikon": "📺", … }
] }
```

Med `"visning": "telefon"` (uge 1: Sicilien, uge 3: hyggeaften) vises trinene
som apps på hendes iPhone og kan løses i vilkårlig rækkefølge. Det er den samme
telefon hver uge (`PHONE_APPS` i `trin.js`): ugens apps har et rødt badge, de
andre siger bare `nej` ("Ikke nu – vi er på ferie 🍋").
Uge 2 (saunagus) bruger den også: `"efter": "innercise"` på check-in (appen Bruce) holder
den lukket ("Du skal booke først 😉") til der er booket, og `"udenfor": true`
på gussen gør, at telefonen lægges væk (`væk`-teksten), når alle apps er klaret,
og gussen så kommer bagefter i det normale kort.

Med `?debug` er der en "Spring over"-knap på hvert trin. Debug bliver ved, mens
fanen er åben (også på tværs af links); `?nodebug` slår det fra.

`klaret` på et trin er teksten, der vises når det er løst. Trin-typerne:

- `wolt` (`site/wolt.js`): madbestilling. `besked` vises øverst; hver restaurant
  har `retter`. Den rigtige ret har `"rigtig": true` (kurven må kun indeholde
  den, gerne flere styk). `nej` på en restaurant eller ret er beskeden, hvis den
  bestilles i stedet.
- `tv` (`site/tv.js`): "hvad skal vi se?". `krav` er listen af krav, `serier`
  har `genre`, `min`, `land`, `set`, `emoji`, `farve` (to farver) og `nej`.
  Præcis én serie skal opfylde alle krav og have `"rigtig": true`. `afspil` er
  teksten, når den rigtige afspilles.
- `kryds` (`site/kryds.js`): samme krydsord som gåde-typen `kryds` (uge 1),
  med valgfri `overskrift`. Med `ordjagt` får appen en ekstra fane med en
  ordjagt (`site/ordjagt.js`), og appen er først klaret, når begge er løst:
  `"ordjagt": { "navn": "Find ordene", "overskrift": "…", "ord": ["ETNA", …], "størrelse": 10, "baglæns": true }`.
  Ordene ligger vandret, lodret og på skrå (og baglæns, medmindre
  `"baglæns": false`). Gitteret laves ud fra en fast seed, så det er ens hver
  gang. Hun trækker fingeren hen over ordet eller trykker på første og sidste bogstav.
- `fotojagt` (`site/fotojagt.js`): "lav et postkort derhjemme" med det rigtige
  kamera. Mens hun sigter, kører der ingenting. Først når hun tager billedet,
  fryser det, og der står "Finn bedømmer billedet…", mens en
  objektgenkendelsesmodel (COCO-SSD, `site/vendor/coco-ssd`, Apache-2.0)
  kigger på billedet i browseren. Er alle `ting` med på samme billede, bliver
  det til et postkort. Ellers giver Finn en karakter og en `ledetråd` for hver
  ting, der mangler, og hun kan prøve igen. Pladserne under kameraet viser "?",
  indtil tingen har været med på et billede. `ting` er en liste af
  `{ "klasse": "dog", "navn": "Finn", "emoji": "🐶", "ledetråd": "…" }`, hvor
  `klasse` er et COCO-navn (se `CLASSES` i filen, fx `dog`, `umbrella`,
  `suitcase`, `wine glass`, `orange`, `cup`, `book`). `grænse` (0–1, standard
  0.45) styrer, hvor sikker modellen skal være. Efter `nødudgang` sekunder
  (standard 240) kommer et link: "Tag billedet alligevel". Med `?debug` står
  scorerne for sidste billede under kameraet.
- `duolingo` (`site/duolingo.js`): sproglektion (uge 1, italiensk). `sprog`
  (fx `it-IT`) bruges til oplæsning. `opgaver` er en liste af:
  `vælg` (billedkort, `valg` med `tekst`/`emoji`/`rigtig`), `byg` (sæt ord
  sammen: `sætning`, `ord`, `svar` = liste af godkendte svar; `"læs": false` hvis
  sætningen er dansk), `par` (`par` = [["il mare", "havet"], …]) og `udfyld`
  (`før`, `efter`, `valg`, `svar`). Forkerte svar kommer igen til sidst, men en
  opgave med `"sidst": true` er altid den allersidste (uge 1: lortepapiret 🧻).
- `innercise` (`site/innercise.js`): book den rigtige gus i en booking-app (uge
  1). `besked` (sedlen øverst), `mål` (`dag`, `mester`, `efter` = tidligst
  time, `personer`), `dage`, `hold` (`dag`, `tid`, `titel`, `mester`, `ledige`,
  `tekst`; `nej` overstyrer svaret) og `billet` (teksten efter booking).
- `qr` (`site/qrscan.js`): scan en QR-kode med kameraet (uge 2: billetten).
  `kode` er teksten i QR-koden, `hemmelig` er koden, der kan tastes i stedet.
  Billetten til print ligger i `qr/uge-2-gus-billet.png` (og `.svg`).
- `gus` (`site/gus.js`): lille tegnefilm i saunaen med gusmester Brian, tre
  runder med kold dukkert imellem, hver sværere: `rytme` (tryk VIFT! i takt;
  `slag`, `takt` i ms), `duft` (gentag rækkefølgen af dufte; `fra`/`til` antal)
  og `helikopter` (kør fingeren rundt, hold farten i det grønne; `sekunder`,
  `min`/`max` i grader pr. sekund). `replikker` ændrer Brians replikker
  (`hej`, `r1`–`r3`, `øsninger` (når runden næsten er slut), `pause`, `ind`,
  `varmt`, `plask`, `tak`). I runde 3 sætter Brian Disturbed på 🤘.
- `bil` (`site/bil.js`): bilen på vej hjem (uge 4). Først skal hendes telefon
  (samme hjemmeskærm som de andre uger) tilsluttes med USB-kablet (`site/usb.js`):
  træk stikket op i telefonen, eller tryk på det, og tryk "Tillad" til CarPlay.
  Så glider telefonen væk, og dashboardet toner frem. `telefon` kan have
  `tekst`, `nej`, `spørgsmål`, `tillad`, `afvis` og `ikkenu`; `"telefon": false`
  springer det over. Drej så nøglen, og løs i
  vilkårlig rækkefølge: den rigtige sang i Spotify og hendes adresse i Google
  Maps (begge i en CarPlay-skærm) og sædevarmen. `spotify` og `saedevarme` er
  konfigurationen til de to trin herunder; `kort` har `adresse`, `by`, `tid`,
  `afstand`, `hjem` (svaret på "🏠 Hjem") og `forslag` (forkerte adresser med
  `nej`).
- `film` (`site/film.js`): en lille tegnefilm mellem to gåder (uge 4: mellem
  ansigterne og melodilåsen). Det er samme køretur som Fitness World-scenen
  (`site/koretur.js`), men med `"mål": "hus"` (huset med den låste bagdør,
  `hus` er skiltet), `køretid` (sekunder), `passagerer` (Frederik og Finn i
  vinduerne), `noder` (musiknoder ud af vinduet) og `bobler`
  (`{ "fra": "frederik" | "finn", "tekst": "…", "ved": sekunder }`). `boble`
  er den sidste replik, når bilen holder, og `knap` er knappen videre.
  `"direkte": true` springer "Klaret ✓"-skærmen over efter filmen.
- `sang` (`site/sang.js`): Finns melodilås (uge 4, sidste trin). Hver lås er en
  julesang som emoji-gåde: `runder` er en liste af
  `{ "emoji": "🔔🔔🔔 🛷💨", "titel": "Jingle Bells", "toner": [0, 3, -4, …] }`.
  Hun gætter sangen og nynner en bid af den, hvor som helst i sangen og så
  længe hun vil. Mikrofonen lytter (tonehøjden findes i browseren), og for hver
  tone sammenligner Finn de seneste 12 spring med alle sangene i trinnet (fuzzy,
  som "hum to search"). Låsen åbner, så snart ca. 8 toner passer, og en måler
  ("Finn genkender… 60 %") viser, hvor tæt hun er. Noderne lyser op med måleren som i Guitar Hero (blå → grøn → guld, gnister ved 75 %+). En pause starter bare et
  nyt forsøg. Toneart og oktav er ligegyldig, og lidt falsk er fint. Brug et
  helt vers eller omkvæd som `toner`. Nynner hun en anden af sangene, siger Finn, hvilken den lød
  som. `toner` er halvtoner i forhold til første tone, med gentagne toner slået
  sammen. Lav dem fra en MIDI-fil med
  `node tools/midi2toner.mjs sang.mid --spor N --antal 40` (uden `--spor`
  listes sporene). `grænse` (standard 1.1) er, hvor langt fra nynnet må være.
  Mens hun nynner, vises hver tone som en bjælke på sin halvtone med nodenavn
  (H = B på engelsk), og de hørte toner står som brikker under. Med `?debug`
  vises scorerne, "↺ Genstart melodilåsen" starter forfra fra lås 1, og
  "🎙 Optag melodi" giver `toner` for det, du nynner.
  Efter `nødudgang` sekunder (standard 300) kommer et link, så Finn kan åbne låsen.
  Melodierne kommer fra frie MIDI-filer (Wikimedia Commons, CC0, og Mutopia,
  public domain); kilden står i `_kilde`.
- `spotify` (`site/spotify.js`): find den rigtige sang i en spilleliste (uge 4).
  `spilleliste`, `beskrivelse`, `sange` (`titel`, `kunstner`, `billede` eller
  `emoji` + `farve`, `rigtig`, `nej`) og `afspil` (linjer der vises, mens den
  spiller).
- `saedevarme` (`site/saedevarme.js`): start bilen og skru op for sædevarmen i
  passagersiden (uge 4). `niveau` (standard 3), `ude` (udetemperatur) og
  `beskeder` for at ændre svarene fra de andre knapper.
- `ansigter` (`site/ansigter.js`): samme ansigtsgenkendelse som gåde-typen
  `ansigter`, med `tekst` og `personer`. Den vises som en kamera-app (som
  postkortet i uge 1): topbar med `mode` (standard "ANSIGTER") og `sted`
  (standard "Fitness World"), søgeren og de fundne ansigter nedenunder.
- `panorama` (`site/panorama.js`): stå inde i et 360°-foto og tag det perfekte
  postkort ved at holde telefonen op som et kamera (gyroskop; ellers træk).
  `billede` (2:1 equirektangulært 360°-foto i uge-mappen), `mål` og `start`
  (`yaw` = retning i grader, 0 = midten af fotoet; `pitch` = op/ned; `fov` =
  zoom), `hilsen`, `til`/`adresse`, og `reserve` (et `postkort`-trin, der bruges
  hvis telefonen ikke kan WebGL). Tilføj `?debug` til adressen for at se
  retning/zoom, når `mål` skal justeres. Panoramaet i uge 1 (`palermo-360.jpg`)
  er "Quattro Canti" af Andreas Mischok via Poly Haven, CC0.
- `postkort` (`site/postkort.js`): tag det perfekte postkort (uge 1, Noto).
  `billede` (foto i uge-mappen), `mål` (`x`/`y` = punktet 0–1 i fotoet, der skal
  være i midten, og `zoom`), `start` (`x`, `y`, `zoom`, `drej` i grader),
  `hilsen` (bagsiden), `til`/`adresse`. Fotoet i uge 1 (`noto.jpg`) er
  "Cathedral of San Nicolò, Noto, Sicily" af VanSky Studio, CC BY-SA 4.0
  (Wikimedia Commons). Byt det gerne ud med jeres eget.
- `rema` (`site/rema.js`): scan selv. Samme scanner som `stregkode`, med
  `stregkode`, `vare`, `pris`, `liste` (indkøbssedlen) og `tak` (på bonen).

**`ansigter`**: find ansigterne på nogle personer med kameraet (uge 4).

```json
{ "type": "ansigter", "tal": "1", "personer": [
  { "navn": "Kendis 1", "billede": "kendis-1.jpg" },
  { "navn": "Kendis 2", "billede": "kendis-2.jpg" },
  { "navn": "Kendis 3", "billede": "kendis-3.jpg" }
] }
```

Læg et referencebillede af hver person i uge-mappen: ét tydeligt ansigt set
forfra, gerne et andet billede end det, hun skal scanne. Genkendelsen kører i
browseren (face-api, ~8 MB, hentes kun på den side). Hver fundet person vises
med billede og navn; når alle er fundet, kommer tallet.

Kameraet virker kun over HTTPS (eller `localhost`), så test kamera-gåderne på
telefonen efter deploy. På Mac'en virker de på `localhost` med webcam'et.

## Plakat-genkendelsen (`site/plakat.js`, testside: `/plakat-poc.html`)

Introen finder Kusama-plakaten (Japanese Grasslands) med klassisk genkendelse
af et fladt billede med OpenCV.js (`site/vendor/opencv/`, Apache-2.0).
`/plakat-poc.html` er en testside, der viser punkter, inliers og
afvisningsgrunde:

- ORB-punkter i hvert kamerabillede (skaleret til 1280 px) matches mod plakatens
  punkter i `site/plakat/orb.json`. Lowes ratio-test smider usikre match væk.
- RANSAC finder den homografi (plakaten set i perspektiv), som flest match er
  enige om. Mindst 20 inliers to billeder i træk betyder, at plakaten er fundet.
  Den fundne plakat tegnes som en grøn firkant.
- `?algo=akaze` bruger AKAZE i stedet (cirka 3× langsommere). `?side=960` gør
  den hurtigere. `?norm=clahe` normaliserer lyset. SIFT findes ikke i den
  færdigbyggede opencv.js.
- Referencen er lavet ud fra et foto af *vores* plakat på væggen, rettet ud med
  `window.plakat.rectify()`. Den rammer den rigtige print, lyset og glasset bedre
  end butikkens produktbillede.
- Plakaten er beskyttet af ophavsret, så selve billedet er **ikke** i repoet. Kun
  punkterne (positioner og descriptors) er. Lav dem igen med
  `/plakat-poc.html?lav`: vælg et beskåret, lige-på billede af plakaten, og læg de
  downloadede JSON-filer i `site/plakat/`.
- OpenCV.js kræver `'wasm-unsafe-eval'` og `'unsafe-eval'` i CSP. Det har kun
  denne side (se `nginx.conf`).
- Test på fotos fra stuen (dæmpet lys, genskin i glasset, planten foran):

  | Plakaten | Inliers (grænse 20) |
  |---|---|
  | Tæt på | 1074 |
  | Skråt, langt væk | 130 |
  | Planten foran | 157 og 185 |
  | Stuen uden plakaten (dør, loft, tv, kurv) | 0–4 |

  Hvert billede tager cirka 65 ms på en Mac. Billedstørrelsen betød mest: ved 640
  px var plakaten på afstand for lille (4–20 inliers).

## Se det lokalt

```sh
node tools/serve.mjs   # http://localhost:5173/qvqdH8iwVaf9EJalg2AF (forsiden)
```

## Deploy

1. Merge til `main`. `.github/workflows/advent.yml` bygger
   `ghcr.io/fmbahrt/advent:sha-<commit>`.
2. Ret image-tagget i `gitops/apps/k8s.dingle.bop/advent/advent.yaml` og merge.

Første gang: opret DNS-recorden `advent.dinglebop.io` (proxied, som apex) og
sørg for at GHCR-pakken `advent` er public.
