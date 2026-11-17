# advent.dinglebop.io

Adventskalender: én kuvert pr. søndag i advent med en QR-kode, der åbner
ugens brev.

## Forsiden

Forsiden (`https://advent.dinglebop.io/`) er en adventskalender med fire låger,
én pr. søndag. En låge låses op på sin søndag (`SUNDAYS` i `site/app.js`) og
fører til ugens side; løste låger står på klem med ugens tal. Der er kun én
QR-kode: den til forsiden. Tilføj `?debug` til adressen for at låse alle op.

## Ugerne

Hver uge er en mappe i `site/` med et tilfældigt navn (så man ikke kan gætte
næste uges link). Tallet foran er ugenummeret. Links og QR-koder ligger i `qr/`.

```
site/1-28B4Dct3RWPD/brev.txt   ->  https://advent.dinglebop.io/1-28B4Dct3RWPD
```

`brev.txt`:

- første linje = overskrift
- resten = brevet (tom linje = nyt afsnit, linjeskift bevares)
- billeder: læg filen i mappen og skriv filnavnet (`foto.jpg`) på en linje for
  sig selv. Hold dem små, fx `sips -Z 1600 foto.jpg`

## Ugens opgave (valgfri)

Læg en `opgave.json` i uge-mappen. Flowet er så:

1. Hun trykker på kuverten, og hint-videoen afspilles (med lyd).
2. Når videoen er slut, vises opgaven (fx scanneren, og kameraet starter selv).
3. "Se hintet igen" afspiller videoen igen, og bagefter kommer opgaven tilbage.
4. Når opgaven er løst, vises tallet. Telefonen husker det til næste gang.

### Fælles felter

- `type`: hvilken gåde (se nedenfor).
- `hint`: videofil i samme mappe. Brug **MP4 (H.264)** så den virker på alle
  telefoner (iPhone: Indstillinger → Kamera → Formater → "Mest kompatibel").
- `tal`: det tal, der låses op.
- `løst`: teksten under tallet.
- `overskrift` / `tekst` (valgfri): vises over gåden. Udelad dem for ikke at
  afsløre noget.
- `knaphint` (valgfri): en lille "💡 Hint"-knap, der skal holdes inde i 1,5 s.
  - `{ "type": "konfetti", "emoji": "🐼" }` regner emojien ud over skærmen
    (`"antal"` styrer hvor mange, standard 80)
  - `{ "type": "tekst", "tekst": "Kig i køkkenet 👀" }` viser en kort tekst

  Nye typer tilføjes i `site/hints.js`.
- Står der tekst i `brev.txt` under overskriften, vises den som et brev øverst.

### Gåde-typer

**`stregkode`**: scan den rigtige stregkode med kameraet (uge 1).

```json
{ "type": "stregkode", "hint": "hint.mp4", "stregkode": "4037400716206", "tal": "9" }
```

`stregkode` er tallene under stregkoden (mellemrum er ligegyldige). Virker
kameraet ikke, kan koden tastes ind.

**`kryds`**: lille kryds og tværs (uge 2).

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

`klaret` på et trin er teksten, der vises når det er løst. Trin-typerne:

- `wolt` (`site/wolt.js`): madbestilling. `besked` vises øverst; hver restaurant
  har `retter`. Den rigtige ret har `"rigtig": true` (kurven må kun indeholde
  den, gerne flere styk). `nej` på en restaurant eller ret er beskeden, hvis den
  bestilles i stedet.
- `tv` (`site/tv.js`): "hvad skal vi se?". `krav` er listen af krav, `serier`
  har `genre`, `min`, `land`, `set`, `emoji`, `farve` (to farver) og `nej`.
  Præcis én serie skal opfylde alle krav og have `"rigtig": true`. `afspil` er
  teksten, når den rigtige afspilles.
- `kryds` (`site/kryds.js`): samme krydsord som gåde-typen `kryds` (uge 2),
  med valgfri `overskrift`.
- `duolingo` (`site/duolingo.js`): sproglektion (uge 2, italiensk). `sprog`
  (fx `it-IT`) bruges til oplæsning. `opgaver` er en liste af:
  `vælg` (billedkort, `valg` med `tekst`/`emoji`/`rigtig`), `byg` (sæt ord
  sammen: `sætning`, `ord`, `svar` = liste af godkendte svar; `"læs": false` hvis
  sætningen er dansk), `par` (`par` = [["il mare", "havet"], …]) og `udfyld`
  (`før`, `efter`, `valg`, `svar`). Forkerte svar kommer igen til sidst.
- `innercise` (`site/innercise.js`): book den rigtige gus i en booking-app (uge
  1). `besked` (sedlen øverst), `mål` (`dag`, `mester`, `efter` = tidligst
  time, `personer`), `dage`, `hold` (`dag`, `tid`, `titel`, `mester`, `ledige`,
  `tekst`; `nej` overstyrer svaret) og `billet` (teksten efter booking).
- `qr` (`site/qrscan.js`): scan en QR-kode med kameraet (uge 1: billetten).
  `kode` er teksten i QR-koden, `hemmelig` er koden, der kan tastes i stedet.
  Billetten til print ligger i `qr/uge-1-gus-billet.png` (og `.svg`).
- `gus` (`site/gus.js`): lille tegnefilm i saunaen med gusmester Brian, tre
  runder med kold dukkert imellem, hver sværere: `rytme` (tryk VIFT! i takt;
  `slag`, `takt` i ms), `duft` (gentag rækkefølgen af dufte; `fra`/`til` antal)
  og `helikopter` (kør fingeren rundt, hold farten i det grønne; `sekunder`,
  `min`/`max` i grader pr. sekund). `replikker` ændrer Brians replikker
  (`hej`, `r1`–`r3`, `øsninger` (når runden næsten er slut), `pause`, `ind`,
  `varmt`, `plask`, `tak`). I runde 3 sætter Brian Disturbed på 🤘.
- `bil` (`site/bil.js`): bilen på vej hjem (uge 4). Drej nøglen, og løs så i
  vilkårlig rækkefølge: den rigtige sang i Spotify og hendes adresse i Google
  Maps (begge i en CarPlay-skærm) og sædevarmen. `spotify` og `saedevarme` er
  konfigurationen til de to trin herunder; `kort` har `adresse`, `by`, `tid`,
  `afstand`, `hjem` (svaret på "🏠 Hjem") og `forslag` (forkerte adresser med
  `nej`).
- `spotify` (`site/spotify.js`): find den rigtige sang i en spilleliste (uge 4).
  `spilleliste`, `beskrivelse`, `sange` (`titel`, `kunstner`, `billede` eller
  `emoji` + `farve`, `rigtig`, `nej`) og `afspil` (linjer der vises, mens den
  spiller).
- `saedevarme` (`site/saedevarme.js`): start bilen og skru op for sædevarmen i
  passagersiden (uge 4). `niveau` (standard 3), `ude` (udetemperatur) og
  `beskeder` for at ændre svarene fra de andre knapper.
- `ansigter` (`site/ansigter.js`): samme ansigtsgenkendelse som gåde-typen
  `ansigter`, med `overskrift`/`tekst` og `personer`.
- `panorama` (`site/panorama.js`): stå inde i et 360°-foto og tag det perfekte
  postkort ved at holde telefonen op som et kamera (gyroskop; ellers træk).
  `billede` (2:1 equirektangulært 360°-foto i uge-mappen), `mål` og `start`
  (`yaw` = retning i grader, 0 = midten af fotoet; `pitch` = op/ned; `fov` =
  zoom), `hilsen`, `til`/`adresse`, og `reserve` (et `postkort`-trin, der bruges
  hvis telefonen ikke kan WebGL). Tilføj `?debug` til adressen for at se
  retning/zoom, når `mål` skal justeres. Panoramaet i uge 2 (`palermo-360.jpg`)
  er "Quattro Canti" af Andreas Mischok via Poly Haven, CC0.
- `postkort` (`site/postkort.js`): tag det perfekte postkort (uge 2, Noto).
  `billede` (foto i uge-mappen), `mål` (`x`/`y` = punktet 0–1 i fotoet, der skal
  være i midten, og `zoom`), `start` (`x`, `y`, `zoom`, `drej` i grader),
  `hilsen` (bagsiden), `til`/`adresse`. Fotoet i uge 2 (`noto.jpg`) er
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

## Se det lokalt

```sh
node tools/serve.mjs   # http://localhost:5173/1-28B4Dct3RWPD
```

## Deploy

1. Merge til `main`. `.github/workflows/advent.yml` bygger
   `ghcr.io/fmbahrt/advent:sha-<commit>`.
2. Ret image-tagget i `gitops/apps/k8s.dingle.bop/advent/advent.yaml` og merge.

Første gang: opret DNS-recorden `advent.dinglebop.io` (proxied, som apex) og
sørg for at GHCR-pakken `advent` er public.
