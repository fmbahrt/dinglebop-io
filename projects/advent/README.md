# advent.dinglebop.io

Adventskalender: én kuvert pr. søndag i advent med en QR-kode, der åbner
ugens brev.

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
nummer og trykker "BESTIL" (uge 3: rød karry nr. 8 hos Den Hvide Elefant).

```json
{ "type": "bestilling", "svar": "8", "ret": "Rød karry i kokosmælk", "tal": "3",
  "bon": ["STED:  Hvidt. Stort. Har en\n       snabel. Bor i Holte.", "RET:   Rød karry."],
  "næsten": { "13": "Rød karry, ja… men ikke vores 😉" } }
```

`bon` er linjerne på bonen (`\n` = linjeskift). `ret` bliver printet på bonen,
når svaret er rigtigt. `næsten` giver en venligere besked ved bestemte forkerte
svar.

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
