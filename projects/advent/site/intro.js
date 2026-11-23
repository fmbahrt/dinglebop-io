// The escape room's intro, at its own secret URL /0-<random> (the QR code she
// scans in real life):
//
//   1. Finn's ransom note (INTRO_LETTER in brev.js) is "played": an envelope,
//      then the letter line by line. (The front page has its own letter.)
//   2. "Videre" starts the camera (a tap, so phones allow it).
//   3. She must find the Kusama poster on the wall (the letter's clue: "Kunsten
//      gemmer på en hemmelighed"; no text on the camera, only "Læs brevet
//      igen"). While it's in view a magic portal opens on it (following the
//      poster in perspective); keep it in view for `hold` seconds. Lose it for
//      more than ~1 s and it starts over.
//   4. Fully open, it blooms (a ring of light) and stays open, breathing, with
//      a glowing "tap here" dot. The camera stays live: it keeps following the poster, and fades
//      while the poster is out of view (but never closes again).
//   5. A tap on the portal: a flash, the portal sound, and on to the front page.
//      (A tap beside it makes it wobble.)
//
// Done once = remembered (localStorage), so scanning the QR code again goes
// straight to the front page. ?forfra plays it again; ?debug adds a skip button.
//
// The front page's path is only in /0-<random>/intro.json, never in this file.
// The poster is found by plakat.js running in a Web Worker (plakat-worker.js),
// so OpenCV never blocks the animation.

import { h, button, DEBUG, link, mediaError } from "/felles.js";
import { letterParts, INTRO_LETTER } from "/brev.js";
import { portalSound, bloomSound, unlockAudio, paperSound, typeSound } from "/lyd.js";
import { NEEDS } from "/plakat.js";
import { startGyro, warpPoints } from "/gyro.js";

const DONE_KEY = "advent:intro-klaret";
const NEED = NEEDS.orb;
const GRACE = 1000;   // ms without the poster before the portal closes again
const SIDE = 1280;    // frames to the worker: long side in px
const params = new URLSearchParams(location.search);
// ?tracking: the gyroscope moves the portal with the phone between (slow)
// detections, see gyro.js. ?tracking=70 sets the camera's field of view (long
// side, degrees) if the default doesn't fit the phone.
const TRACKING = params.has("tracking");
const FOV = (Number(params.get("tracking")) || 67) * (Math.PI / 180);
const LAG = 50;       // ms: the camera picture on screen is this old (both grabbed and shown frames)
let gyro = null;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const root = document.getElementById("intro");
const sleep = (ms) => new Promise((r) => setTimeout(r, reducedMotion ? 0 : ms));

async function main() {
  const path = decodeURIComponent(location.pathname.replace(/^\/+|\/+$/g, ""));
  let cfg = null;
  try {
    const r = await fetch(`/${path}/intro.json`, { cache: "no-cache" });
    if (r.ok) cfg = await r.json();
  } catch { /* below */ }
  if (!cfg?.hjem) {
    root.replaceChildren(h("p", "intro-nothing", "Her er ikke noget 🐾"));
    return;
  }
  const home = link(`/${cfg.hjem}`);
  if (params.has("forfra")) { try { localStorage.removeItem(DONE_KEY); } catch { /* ignore */ } }
  let done = false;
  try { done = localStorage.getItem(DONE_KEY) === "1"; } catch { /* private mode */ }
  if (done) return location.replace(home);

  document.title = "Det store juleescaperoom";
  // Start loading the detector while she reads (opencv.js is ~10 MB).
  const finder = startFinder();
  await playLetter();
  await findPoster(finder, Number(cfg.hold ?? 3.5) * 1000);
  try { localStorage.setItem(DONE_KEY, "1"); } catch { /* ignore */ }
  location.replace(home);
}

// ---------- 1. Finn's letter ----------

function playLetter() {
  return new Promise((resolve) => {
    const scene = h("section", "intro-letter");
    const env = button("", "intro-envelope", () => open());
    env.append(h("span", "intro-flap"), h("span", "intro-seal", "🐾"), h("span", "intro-env-label", "Til Anne"));
    const hint = h("p", "intro-taphint", "Du har fået post 🐾 Tryk for at åbne");
    scene.append(env, hint);
    root.replaceChildren(scene);

    let opened = false;
    async function open() {
      if (opened) return;
      opened = true;
      env.classList.add("open");
      unlockAudio(); // her tap: from now on the page may make sound (the bloom comes without a tap)
      paperSound("open");
      hint.remove();
      navigator.vibrate?.(30);
      await sleep(700);
      const letter = h("article", "ransom intro-paper");
      letter.setAttribute("open", "");
      const parts = letterParts(INTRO_LETTER);
      letter.append(...parts);
      const lines = [...parts[0].querySelector(".ransom-body").children];
      lines.forEach((p) => p.classList.add("intro-line"));
      env.replaceWith(letter);
      paperSound("unfold");
      await sleep(650);
      // Line by line, typed letter by letter with a key sound; a tap shows the rest at once.
      let fast = reducedMotion;
      letter.addEventListener("click", () => { fast = true; });
      for (const p of lines) {
        p.classList.add("show");
        await typeLine(p, () => fast);
        if (!fast) await sleep(450);
      }
      const next = button("Videre →", "btn intro-next", () => {
        unlockAudio();
        if (TRACKING) gyro ??= startGyro(); // her tap: iPhone only asks for motion access on a tap
        resolve();
      });
      scene.append(next);
      next.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest" });
    }
  });
}

const graphemes = (text) => (Intl.Segmenter
  ? [...new Intl.Segmenter("da", { granularity: "grapheme" }).segment(text)].map((x) => x.segment)
  : Array.from(text));

/** Type out an element's text letter by letter (keeping its markup), a key click per letter. */
async function typeLine(el, isFast) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push([walker.currentNode, walker.currentNode.textContent]);
  for (const [node] of nodes) node.textContent = "";
  for (const [node, text] of nodes) {
    let typed = "";
    for (const c of graphemes(text)) {
      if (isFast()) break;
      typed += c;
      node.textContent = typed;
      if (c.trim()) typeSound();
      await sleep(/[.,!?:]/.test(c) ? 180 : 24 + Math.random() * 20);
    }
    node.textContent = text;
  }
}

// ---------- 2–3. Find the poster ----------

/** The detector in a worker. → { ready: Promise, detect(imageData): Promise<result> } */
function startFinder() {
  const worker = new Worker("/plakat-worker.js");
  let id = 0;
  const waiting = new Map();
  let readyOk, readyFail;
  const ready = new Promise((ok, fail) => { readyOk = ok; readyFail = fail; });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === "ready") readyOk();
    else if (m.type === "result") { waiting.get(m.id)?.(m); waiting.delete(m.id); }
    else if (m.type === "error") { readyFail(new Error(m.message)); for (const fn of waiting.values()) fn(null); waiting.clear(); }
  };
  worker.onerror = (e) => readyFail(new Error(e.message || "workeren kunne ikke starte"));
  fetch("/plakat/orb.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then((ref) => worker.postMessage({ type: "init", ref }))
    .catch((e) => readyFail(e));
  return {
    ready,
    detect(image) {
      return new Promise((resolve) => {
        const n = ++id;
        waiting.set(n, resolve);
        worker.postMessage({ type: "frame", id: n, image }, [image.data.buffer]);
      });
    },
    stop: () => worker.terminate(),
  };
}

function findPoster(finder, HOLD) {
  return new Promise((resolve) => {
    const scene = h("section", "intro-cam");
    const video = h("video", "intro-video");
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    const fx = h("canvas", "intro-fx");
    // No text on the camera: the letter is the clue. Only a way to read it again
    // (and messages if the camera or the detector fails).
    const status = h("p", "intro-status", "");
    const bottom = h("div", "intro-cam-bottom");
    const reread = button("📜 Læs brevet igen", "intro-reread", () => showLetter());
    const start = button("📷 Start kameraet", "btn intro-start", () => begin());
    start.hidden = true;
    const anyway = button("Driller kameraet? Gå ind alligevel →", "intro-anyway", () => finish(false));
    anyway.hidden = true;
    bottom.append(status, reread, start, anyway);
    if (DEBUG) bottom.append(button("⏭ Spring over (debug)", "debug-skip", () => finish(false)));
    const debugLine = DEBUG ? h("p", "intro-debug", "") : null;
    if (debugLine) bottom.append(debugLine);
    scene.append(video, fx, bottom);
    root.replaceChildren(scene);
    document.documentElement.classList.add("intro-camera");

    let stream = null, running = false, finished = false;
    let progress = 0;          // 0…1: how far the portal has opened
    let lastSeen = 0;          // when the poster was last found
    let foundNow = false;      // was it in the latest frame?
    let quad = null, target = null; // the poster's corners on screen (smoothed / latest)
    let crop = null;           // the part of the video she sees (object-fit: cover)
    let paused = false;        // the letter is open on top
    let bloomed = 0;           // when the portal was fully open (0 = not yet); then it waits for a tap
    let vis = 0;               // after blooming: fades the portal out/in as the poster leaves/returns
    let nudged = -1;           // a tap beside the portal: it wobbles
    const sparks = [];
    const t0 = performance.now();

    // A way in if the camera won't cooperate.
    const anywayTimer = setTimeout(() => { anyway.hidden = false; }, 120000);

    /** Finn's letter again, on top of the camera (detection pauses meanwhile). */
    function showLetter() {
      paused = true;
      const layer = h("div", "intro-reread-layer");
      const paper = h("article", "ransom intro-paper");
      paper.setAttribute("open", "");
      paper.append(...letterParts(INTRO_LETTER));
      paperSound("unfold");
      const close = button("Tilbage til kameraet ✕", "btn intro-next", () => { layer.remove(); paused = false; });
      layer.append(paper, close);
      scene.append(layer);
    }

    async function begin() {
      start.hidden = true;
      status.textContent = "";
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        video.srcObject = stream;
        await video.play();
      } catch (e) {
        if (debugLine) debugLine.textContent = `debug: ${e?.name}: ${e?.message}`;
        status.textContent = mediaError(e, "kameraet");
        start.hidden = false;
        anyway.hidden = false;
        return;
      }
      try {
        await finder.ready;
      } catch (e) {
        status.textContent = "Magien ville ikke starte 😿";
        anyway.hidden = false;
        if (debugLine) debugLine.textContent = `debug: ${e.message}`;
        return;
      }
      status.textContent = "";
      running = true;
      loop();
    }

    /** The camera as seen on screen: [focal length px, centre x, centre y] (for gyro.js). */
    function lens() {
      const vw = video.videoWidth || 1, vh = video.videoHeight || 1;
      const W = video.clientWidth, H = video.clientHeight;
      const k = Math.max(W / vw, H / vh);
      return [((Math.max(vw, vh) / 2) / Math.tan(FOV / 2)) * k, W / 2, H / 2];
    }

    /** The part of the video that's on screen (object-fit: cover crops it). */
    function visible() {
      const vw = video.videoWidth, vh = video.videoHeight;
      const W = video.clientWidth, H = video.clientHeight;
      const k = Math.max(W / vw, H / vh);
      const w = W / k, h2 = H / k;
      return { x: (vw - w) / 2, y: (vh - h2) / 2, w, h: h2 };
    }

    // Detection: one frame at a time to the worker (only what she sees).
    const grab = document.createElement("canvas");
    const gctx = grab.getContext("2d", { willReadFrequently: true });
    async function loop() {
      while (running) {
        if (!video.videoWidth || paused) { await sleep(150); continue; }
        crop = visible();
        const grabT = performance.now();
        const k = Math.min(1, SIDE / Math.max(crop.w, crop.h));
        grab.width = Math.round(crop.w * k);
        grab.height = Math.round(crop.h * k);
        gctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, grab.width, grab.height);
        const image = gctx.getImageData(0, 0, grab.width, grab.height);
        const r = await finder.detect(image);
        if (!running) return;
        foundNow = !!(r && r.inliers >= NEED && r.quad);
        if (foundNow) {
          lastSeen = performance.now();
          // grab px → screen px
          const sx = video.clientWidth / grab.width, sy = video.clientHeight / grab.height;
          target = r.quad.map(([x, y]) => [x * sx, y * sy]);
          // The answer is old: move it by how the phone has turned since the frame was grabbed.
          // (Up to the last animation frame; frame() moves it on from there.)
          if (gyro?.active) target = warpPoints(target, gyro.between(grabT - LAG, lastGyro - LAG), ...lens());
          // (re)appearing: start where the poster is, don't glide in from the old spot
          if (!quad || (bloomed && vis < 0.1)) quad = target.map((p) => [...p]);
        }
        if (debugLine && r) debugLine.textContent = `debug: ${r.inliers} inliers${r.why ? ` (afvist: ${r.why})` : ""} · spredning ${Math.round(r.spread * 100)} % · ${Math.round(r.ms)} ms · ${grab.width}×${grab.height} · ${Math.round(progress * 100)} %${TRACKING ? ` · gyro ${gyro?.active ? `${gyro.hz} Hz` : "slukket"}` : ""}`;
      }
    }

    // ---- the magic, at 60 fps
    let lastT = performance.now(), lastGyro = lastT;
    let flash = 0;
    function frame(now) {
      if (finished && flash >= 1) return;
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      // Opens only while the poster is in the latest frame; a short miss (a
      // blurry frame, a hand) just pauses it; gone longer than GRACE closes it.
      const seen = !!target && now - lastSeen < GRACE;
      if (!seen && target) target = null;
      if (!finished && !bloomed) {
        if (seen && foundNow) progress = Math.min(1, progress + (dt * 1000) / HOLD);
        else if (!seen) progress = Math.max(0, progress - dt * 2.2); // closes in under half a second
        if (progress >= 1) bloom(now);
      }
      // Once bloomed it stays open; it only fades while the poster is out of view.
      if (bloomed) vis += ((seen ? 1 : 0) - vis) * Math.min(1, dt * 6);
      // With ?tracking the gyro moves the portal (and the last answer) as the phone turns.
      if (gyro?.active && video.videoWidth) {
        const R = gyro.between(lastGyro - LAG, now - LAG), L = lens();
        if (quad) quad = warpPoints(quad, R, ...L);
        if (target) target = warpPoints(target, R, ...L);
      }
      lastGyro = now;
      // follow the poster smoothly between detections
      if (target && quad) quad = quad.map((p, i) => [p[0] + (target[i][0] - p[0]) * Math.min(1, dt * 10), p[1] + (target[i][1] - p[1]) * Math.min(1, dt * 10)]);
      draw(now / 1000, dt);
      if (DEBUG) window.introPortal = { quad, bloomed: !!bloomed, vis, progress };
    }
    requestAnimationFrame(frame);

    function draw(t, dt) {
      const dpr = Math.min(2, devicePixelRatio || 1);
      const W = fx.clientWidth, H = fx.clientHeight;
      if (fx.width !== Math.round(W * dpr)) { fx.width = Math.round(W * dpr); fx.height = Math.round(H * dpr); }
      const g = fx.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      const p = progress;
      const now = t * 1000;
      g.globalAlpha = bloomed && !finished ? vis : 1;
      if (quad && p > 0 && g.globalAlpha > 0.01) {
        const path = () => { g.beginPath(); quad.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
        const cx = quad.reduce((a, q) => a + q[0], 0) / 4, cy = quad.reduce((a, q) => a + q[1], 0) / 4;
        const R = Math.max(...quad.map(([x, y]) => Math.hypot(x - cx, y - cy)));
        // a tap beside it: a little wobble
        if (nudged >= 0 && now - nudged < 450) {
          const k = 1 - (now - nudged) / 450;
          g.save();
          g.translate(Math.sin((now - nudged) / 28) * 9 * k, 0);
        } else g.save();
        // the room dims around the poster
        g.save();
        g.beginPath();
        g.rect(0, 0, W, H);
        quad.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath();
        g.fillStyle = `rgba(5, 10, 20, ${0.55 * p})`;
        g.fill("evenodd");
        g.restore();
        // inside: a swirling portal
        g.save();
        path();
        g.clip();
        const glow = g.createRadialGradient(cx, cy, 0, cx, cy, R);
        glow.addColorStop(0, `rgba(255, 236, 170, ${0.55 * p})`);
        glow.addColorStop(0.45, `rgba(160, 110, 255, ${0.35 * p})`);
        glow.addColorStop(1, `rgba(40, 200, 220, ${0.15 * p})`);
        g.fillStyle = glow;
        g.fillRect(0, 0, W, H);
        g.lineCap = "round";
        for (let arm = 0; arm < 6; arm++) {
          g.beginPath();
          for (let s = 0; s <= 1; s += 0.04) {
            const a = arm * (Math.PI / 3) + t * 1.6 + s * 5.5;
            const r = s * R * (0.3 + 0.7 * p);
            const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
            s ? g.lineTo(x, y) : g.moveTo(x, y);
          }
          g.strokeStyle = `rgba(255, 245, 210, ${0.5 * p})`;
          g.lineWidth = 2 + 3 * p;
          g.stroke();
        }
        g.restore();
        // the golden frame, traced as it opens
        const sides = quad.map((q, i) => Math.hypot(quad[(i + 1) % 4][0] - q[0], quad[(i + 1) % 4][1] - q[1]));
        const per = sides.reduce((a, b) => a + b, 0);
        path();
        g.setLineDash([per * p, per]);
        g.lineWidth = 5;
        g.strokeStyle = "#ffd27f";
        g.shadowColor = "#ffcf6b";
        g.shadowBlur = 18 + 14 * Math.sin(t * 6);
        g.stroke();
        g.setLineDash([]);
        g.shadowBlur = 0;
        if (bloomed && !finished) {
          // Bloom: a ring of light shoots out, then the portal breathes and waits for a tap.
          const since = (now - bloomed) / 1000;
          if (since < 1.1) {
            const k = since / 1.1;
            g.beginPath();
            g.arc(cx, cy, R * (0.6 + 1.8 * k), 0, Math.PI * 2);
            g.lineWidth = 14 * (1 - k) + 1;
            g.strokeStyle = `rgba(255, 236, 170, ${0.9 * (1 - k)})`;
            g.shadowColor = "#ffe9a8";
            g.shadowBlur = 30;
            g.stroke();
            g.shadowBlur = 0;
          }
          const breath = 0.5 + 0.5 * Math.sin(t * 3.2);
          path();
          g.lineWidth = 3 + 5 * breath;
          g.strokeStyle = `rgba(255, 245, 210, ${0.35 + 0.4 * breath})`;
          g.shadowColor = "#fff2c4";
          g.shadowBlur = 20 + 25 * breath;
          g.stroke();
          g.shadowBlur = 0;
          // "Tap here": a glowing dot in the middle with two ripples (drawn, not
          // an emoji, so it looks the same on every phone).
          for (const off of [0, 0.5]) {
            const ripple = (t * 0.8 + off) % 1;
            g.beginPath();
            g.arc(cx, cy, R * 0.06 + R * 0.3 * ripple, 0, Math.PI * 2);
            g.lineWidth = 3;
            g.strokeStyle = `rgba(255, 255, 255, ${0.8 * (1 - ripple)})`;
            g.stroke();
          }
          g.beginPath();
          g.arc(cx, cy, R * (0.045 + 0.01 * breath), 0, Math.PI * 2);
          g.fillStyle = "#fffbea";
          g.shadowColor = "#fff2c4";
          g.shadowBlur = 25;
          g.fill();
          g.shadowBlur = 0;
        }
        g.restore();
        // sparks fly off the frame
        const n = Math.round(p * (bloomed ? 3 : 6));
        for (let k = 0; k < n; k++) {
          const i = (Math.random() * 4) | 0, f = Math.random();
          const a = quad[i], b = quad[(i + 1) % 4];
          const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
          const ang = Math.atan2(y - cy, x - cx) + (Math.random() - 0.5);
          const v = 40 + Math.random() * 120;
          sparks.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 30, life: 1, hue: 40 + Math.random() * 30 });
        }
      }
      g.globalAlpha = 1;
      for (let k = sparks.length - 1; k >= 0; k--) {
        const s = sparks[k];
        s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 60 * dt; s.life -= dt * 1.3;
        if (s.life <= 0) { sparks.splice(k, 1); continue; }
        g.fillStyle = `hsla(${s.hue}, 100%, ${60 + 30 * s.life}%, ${s.life})`;
        g.beginPath();
        g.arc(s.x, s.y, 1 + 2.5 * s.life, 0, Math.PI * 2);
        g.fill();
      }
      // the end: light floods out of the portal and fills the screen
      if (finished && flash < 1) {
        flash = Math.min(1, flash + dt * 1.4);
        const cx = quad ? quad.reduce((a, q) => a + q[0], 0) / 4 : W / 2, cy = quad ? quad.reduce((a, q) => a + q[1], 0) / 4 : H / 2;
        const r = Math.hypot(W, H) * flash;
        const light = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, r));
        light.addColorStop(0, "rgba(255, 250, 230, 1)");
        light.addColorStop(0.7, `rgba(255, 228, 160, ${0.9 * flash + 0.1})`);
        light.addColorStop(1, "rgba(255, 210, 127, 0)");
        g.fillStyle = light;
        g.fillRect(0, 0, W, H);
        if (flash > 0.6) { g.fillStyle = `rgba(255, 250, 235, ${(flash - 0.6) / 0.4})`; g.fillRect(0, 0, W, H); }
      }
    }

    /** Fully open: stop counting, burst, and wait for her to tap the portal. */
    function bloom(now) {
      bloomed = now;
      vis = 1;
      progress = 1;
      clearTimeout(anywayTimer);
      navigator.vibrate?.([20, 40, 60]);
      bloomSound();
      for (let k = 0; k < 60 && quad; k++) {
        const cx = quad.reduce((a, q) => a + q[0], 0) / 4, cy = quad.reduce((a, q) => a + q[1], 0) / 4;
        const ang = Math.random() * Math.PI * 2, v = 120 + Math.random() * 260;
        sparks.push({ x: cx, y: cy, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, life: 1, hue: 35 + Math.random() * 40 });
      }
    }

    /** Is (x, y) on the portal (a little generous around the edge)? */
    function onPortal(x, y) {
      if (!quad) return false;
      const cx = quad.reduce((a, q) => a + q[0], 0) / 4, cy = quad.reduce((a, q) => a + q[1], 0) / 4;
      const q = quad.map(([qx, qy]) => [cx + (qx - cx) * 1.15, cy + (qy - cy) * 1.15]);
      let inside = false;
      for (let i = 0, j = 3; i < 4; j = i++) {
        const [xi, yi] = q[i], [xj, yj] = q[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }

    // Tapping the open portal is the way in.
    scene.addEventListener("click", (e) => {
      if (!bloomed || finished || e.target.closest("button, .intro-reread-layer")) return;
      const box = fx.getBoundingClientRect();
      if (vis > 0.5 && onPortal(e.clientX - box.left, e.clientY - box.top)) finish(true);
      else nudged = performance.now();
    });

    async function finish(magic) {
      if (finished) return;
      finished = true;
      running = false;
      clearTimeout(anywayTimer);
      progress = 1;
      reread.hidden = true;
      portalSound(true);
      navigator.vibrate?.([30, 50, 140]);
      if (!magic) flash = 0;
      await sleep(magic ? 1100 : 600);
      stream?.getTracks().forEach((tr) => tr.stop());
      finder.stop();
      gyro?.stop();
      resolve();
    }

    begin();
  });
}

main();
