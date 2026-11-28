// Step "fotojagt": a postcard from Sicily, taken at home with the real camera.
// Nothing runs while she aims: when she takes the photo it freezes, "Finn
// judges it" with an object detector (COCO-SSD, fully in the browser), and if
// something is missing she gets a score and a clue per missing thing. Every
// listed thing must be in the same photo to get the postcard.
//
//   { "type": "fotojagt", "by": "Sicilia", "titel": "Saluti dalla Sicilia",
//     "ting": [ { "klasse": "dog", "navn": "Finn", "emoji": "🐶", "ledetråd": "Hovedpersonen mangler!" },
//               { "klasse": "umbrella", "navn": "Paraply", "emoji": "☂️", "ledetråd": "…" } ],
//     "hilsen": "…", "til": "…", "adresse": "…" }
//
// The slots under the camera show "?" until a thing has been in a photo.
// "klasse" is one of the COCO names in CLASSES below; "grænse" (0–1) on a thing
// or on the step sets how sure the model must be (default 0.45). If the model
// keeps missing something, a way out appears after "nødudgang" seconds (240).

import { h, button, DEBUG } from "/felles.js";
import { camera } from "/kamera.js";
import { beep } from "/trin.js";
import { postcardView } from "/postkort.js";

const MODEL = "/vendor/coco-ssd/model.json";
// COCO ids (the model's class index is id - 1). Only the things you could have at home.
const CLASSES = {
  person: 1, bicycle: 2, cat: 17, dog: 18, backpack: 27, umbrella: 28, handbag: 31, tie: 32,
  suitcase: 33, frisbee: 34, "sports ball": 37, "tennis racket": 43, bottle: 44, "wine glass": 46,
  cup: 47, fork: 48, knife: 49, spoon: 50, bowl: 51, banana: 52, apple: 53, sandwich: 54,
  orange: 55, broccoli: 56, carrot: 57, pizza: 59, donut: 60, cake: 61, chair: 62, couch: 63,
  "potted plant": 64, bed: 65, "dining table": 67, tv: 72, laptop: 73, remote: 75,
  "cell phone": 77, book: 84, clock: 85, vase: 86, scissors: 87, "teddy bear": 88,
};

// Photos are judged at this size (snapshotCanvas).
const PHOTO_W = 900, PHOTO_H = 1200;

// The model is ~18 MB, and its first run compiles TensorFlow's WebGL shaders
// (seconds on a phone). So: download it in the background as soon as the week
// is open (preload, called by trin.js), and warm it up (one run on a blank photo
// of the real size) when the camera app opens. Her first photo is then judged
// as fast as the rest.
let ready = null;
function loadModel() {
  return (ready ??= (async () => {
    const { tf } = await import("/vendor/face-api/face-api.esm.js");
    await tf.ready();
    const model = await tf.loadGraphModel(MODEL);
    return { tf, model };
  })().catch((e) => {
    ready = null;
    throw e;
  }));
}
let warm = null;
function warmModel() {
  return (warm ??= loadModel().then(async ({ tf, model }) => {
    const blank = tf.zeros([1, PHOTO_H, PHOTO_W, 3], "int32");
    tf.dispose([await model.executeAsync(blank)].flat());
    blank.dispose();
    return { tf, model };
  }).catch((e) => {
    warm = null;
    throw e;
  }));
}

/** Download the model in the background (trin.js calls this when the week opens). */
export function preload() {
  loadModel().catch(() => {});
}

/** Best score and box (0–1, [y1, x1, y2, x2]) per wanted class in one picture (canvas/video). */
async function detect(tf, model, pixels, wanted) {
  const input = tf.tidy(() => tf.expandDims(tf.cast(tf.browser.fromPixels(pixels), "int32")));
  const out = await model.executeAsync(input);
  input.dispose();
  const list = [out].flat();
  const scoresT = list.find((t) => t.rank === 3);
  const boxesT = list.find((t) => t.rank === 4);
  const scores = await scoresT.data();
  const boxes = await boxesT.data();
  const [, n, k] = scoresT.shape;
  tf.dispose(list);
  return wanted.map((id) => {
    let best = 0, at = -1;
    if (!id) return { score: 0, box: null };
    for (let i = 0; i < n; i++) {
      const s = scores[i * k + id - 1];
      if (s > best) { best = s; at = i; }
    }
    return { score: best, box: at < 0 ? null : [...boxes.slice(at * 4, at * 4 + 4)] };
  });
}

export default function fotojagt(cfg, { done }) {
  const things = (cfg.ting ?? []).map((t) => ({
    ...t,
    id: CLASSES[t.klasse],
    limit: Number(t.grænse ?? cfg.grænse ?? 0.45),
    found: false, // been in a photo at some point (its slot is revealed)
  }));
  for (const t of things) if (!t.id) console.warn(`Fotojagt: ukendt klasse "${t.klasse}"`);
  const city = cfg.by ?? "Sicilia";

  const root = h("div", "app cam fj");
  const top = h("div", "cam-top");
  top.append(h("span", "cam-mode", "FOTO"), h("span", "cam-badge", "📍 " + city));

  const cam = camera({ shape: "wide", laser: false });
  cam.view.classList.add("fj-view");
  const shot = h("img", "fj-shot");
  shot.alt = "";
  shot.hidden = true;
  const boxes = h("div", "fj-boxes");
  const judging = h("div", "fj-judging");
  judging.append(h("span", "fj-judging-paw", "🐾"), h("span", null, cfg.bedømmer ?? "Finn bedømmer billedet…"));
  judging.hidden = true;
  // While Finn's eyes warm up (the first run of the model can stall the page,
  // and with it the live picture, for a few seconds on a phone): a spinner over
  // the camera, so it doesn't look like the page broke.
  const warming = h("div", "fj-judging fj-warming");
  warming.append(h("span", "fj-spinner"), h("span", null, "Finn gør sig klar… 🐾"), h("span", "fj-warming-sub", "Det tager kun et øjeblik"));
  const flash = h("div", "cam-flash");
  cam.view.append(shot, boxes, judging, warming, flash);

  // Slots: unknown ("?") until the thing has been in a photo.
  const chips = h("ul", "fj-list");
  const chip = new Map(things.map((t) => {
    const li = h("li", "fj-chip");
    chips.append(li);
    return [t, li];
  }));
  const drawChips = (inShot = new Set()) => {
    for (const t of things) {
      const li = chip.get(t);
      li.replaceChildren(h("span", "fj-emoji", t.found ? (t.emoji ?? "✓") : "?"), ...(t.found && t.navn ? [h("span", "fj-name", t.navn)] : []));
      li.classList.toggle("found", t.found);
      li.classList.toggle("on", inShot.has(t));
    }
  };
  drawChips();

  const intro = h("p", "fj-intro", cfg.besked ?? "Lav et postkort fra Sicilien, og tag billedet 📸 Finn bedømmer det.");
  const msg = h("div", "cam-msg fj-verdict");
  const shutter = button("", "cam-shutter", shoot);
  shutter.setAttribute("aria-label", "Tag billede");
  shutter.disabled = true;
  const again = button(cfg.igen ?? "Prøv igen 📸", "btn fj-again", () => backToCamera());
  again.hidden = true;
  const bar = h("div", "cam-bar");
  bar.append(h("span", "cam-bar-pad"), shutter, h("span", "cam-bar-pad"));
  const way = button("Kameraet kan ikke se det hele? Tag billedet alligevel", "fj-anyway", () => win(snapshot()));
  way.hidden = true;
  const debugLine = DEBUG ? h("p", "face-debug", "debug: genkendelsen kører først, når du tager et billede") : null;
  root.append(top, intro, cam.view, chips, bar, msg, again, way, ...(debugLine ? [debugLine] : []));

  let wayTimer = 0;
  let busy = false;

  // Load and warm up Finn's eyes as soon as the app opens (while the camera
  // starts); the shutter waits until he's ready, so no photo is slow.
  // The overlay is painted before the warm-up starts, so it's up while the page stalls.
  let finnReady = false;
  const painted = new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60)));
  const finnLoading = painted.then(warmModel).then(() => true, () => false).then((ok) => {
    finnReady = true;
    warming.classList.add("gone");
    setTimeout(() => (warming.hidden = true), 300);
    return ok;
  });

  cam.onLive(async () => {
    if (!finnReady) {
      shutter.disabled = true;
      await finnLoading;
    }
    shutter.disabled = false;
    clearTimeout(wayTimer);
    wayTimer = setTimeout(() => (way.hidden = false), Number(cfg.nødudgang ?? 240) * 1000);
  });

  /** A box (0–1 of the photo, [y1, x1, y2, x2]) on the frozen photo. */
  function placeBox(t, box) {
    const [y1, x1, y2, x2] = box;
    const b = h("div", "fj-box");
    b.append(h("span", "fj-tag", `${t.emoji ?? ""} ${t.navn ?? ""}`.trim()));
    b.style.left = `${x1 * 100}%`;
    b.style.top = `${y1 * 100}%`;
    b.style.width = `${(x2 - x1) * 100}%`;
    b.style.height = `${(y2 - y1) * 100}%`;
    boxes.append(b);
  }

  async function shoot() {
    if (busy || root.classList.contains("done")) return;
    busy = true;
    flash.classList.remove("go");
    void flash.offsetWidth;
    flash.classList.add("go");
    beep(2400, 25);
    setTimeout(() => beep(1600, 35), 60);
    navigator.vibrate?.(15);

    // Freeze the photo and let Finn judge it.
    const canvas = snapshotCanvas();
    const photo = canvas.toDataURL("image/jpeg", 0.85);
    shot.src = photo;
    shot.hidden = false;
    boxes.replaceChildren();
    judging.hidden = false;
    shutter.disabled = true;
    msg.className = "cam-msg fj-verdict";
    msg.replaceChildren();
    cam.stop(); // nothing runs while Finn thinks

    const t0 = performance.now();
    let res = null;
    try {
      const { tf, model } = await warmModel();
      res = await detect(tf, model, canvas, things.map((t) => t.id ?? 0));
    } catch (e) {
      console.error(e);
    }
    // A moment of suspense, even on a fast phone.
    await new Promise((r) => setTimeout(r, Math.max(0, 1300 - (performance.now() - t0))));
    judging.hidden = true;
    busy = false;

    if (!res) {
      msg.className = "cam-msg fj-verdict bad";
      msg.textContent = "Finn kunne ikke se billedet. Prøv igen 🐾";
      again.hidden = false;
      return;
    }
    const inShot = new Set();
    res.forEach((r, i) => {
      const t = things[i];
      if (t.id && r.score >= t.limit) {
        inShot.add(t);
        t.found = true;
        if (r.box) placeBox(t, r.box);
      }
    });
    drawChips(inShot);
    if (debugLine) debugLine.textContent = `debug: ${things.map((t, i) => `${t.emoji ?? t.klasse} ${res[i].score.toFixed(2)}`).join(" · ")} | ${Math.round(performance.now() - t0)} ms`;

    const missing = things.filter((t) => !inShot.has(t));
    if (!missing.length) return win(photo);

    // Not yet: a score and a clue per missing thing.
    navigator.vibrate?.(120);
    const score = Math.max(1, Math.round((10 * inShot.size) / things.length) - 1);
    msg.className = "cam-msg fj-verdict bad";
    const head = h("p", "fj-score", `Finn giver det ${score}/10 🐾`);
    const list = h("ul", "fj-clues");
    for (const t of missing) list.append(h("li", null, t.ledetråd ?? `Der mangler noget… ${t.emoji ?? "❓"}`));
    msg.append(head, list);
    again.hidden = false;
    shutter.hidden = true;
  }

  function backToCamera() {
    again.hidden = true;
    shutter.hidden = false;
    shot.hidden = true;
    boxes.replaceChildren();
    msg.replaceChildren();
    drawChips();
    cam.start();
  }

  function win(photo) {
    if (root.classList.contains("done")) return;
    msg.className = "cam-msg ok";
    msg.textContent = cfg.perfekt ?? "10/10 – Det perfekte postkort! 📸";
    navigator.vibrate?.([30, 50, 120]);
    setTimeout(() => {
      stop();
      root.replaceChildren(top, ...postcardView(photo, { ...cfg, by: city, titel: cfg.titel ?? "Saluti dalla Sicilia", lodret: true }, done));
      root.classList.add("done");
    }, 1400);
  }

  /** The current camera frame, cropped like the view (3:4, portrait). */
  function snapshotCanvas() {
    const video = cam.video;
    const VW = video.videoWidth, VH = video.videoHeight;
    const c = document.createElement("canvas");
    c.width = PHOTO_W;
    c.height = PHOTO_H;
    const ctx = c.getContext("2d");
    if (VW) {
      const s = Math.max(c.width / VW, c.height / VH);
      ctx.drawImage(video, (c.width - VW * s) / 2, (c.height - VH * s) / 2, VW * s, VH * s);
    } else {
      ctx.fillStyle = "#e9c46a";
      ctx.fillRect(0, 0, c.width, c.height);
    }
    return c;
  }
  const snapshot = () => (shot.hidden ? snapshotCanvas().toDataURL("image/jpeg", 0.85) : shot.src);

  function stop() {
    cam.stop();
    clearTimeout(wayTimer);
  }

  return {
    el: root,
    activate: () => { if (!root.classList.contains("done") && shot.hidden) cam.start(); },
    deactivate: stop,
  };
}
