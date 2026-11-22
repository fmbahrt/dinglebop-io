// The escape room's intro, at its own secret URL /0-<random> (the QR code she
// scans in real life):
//
//   1. Finn's letter is "played": an envelope, then the letter line by line.
//   2. "Videre" starts the camera (a tap, so phones allow it).
//   3. She must find the Kusama poster on the wall. While it's in view a magic
//      portal opens on it (following the poster in perspective); keep it in
//      view for `hold` seconds. Lose it for more than ~1 s and it starts over.
//   4. A flash, the portal sound, and on to the front page.
//
// Done once = remembered (localStorage), so scanning the QR code again goes
// straight to the front page. ?forfra plays it again; ?debug adds a skip button.
//
// The front page's path is only in /0-<random>/intro.json, never in this file.
// The poster is found by plakat.js running in a Web Worker (plakat-worker.js),
// so OpenCV never blocks the animation.

import { h, button, DEBUG, link } from "/felles.js";
import { letterParts, markLetterSeen } from "/brev.js";
import { portalSound } from "/lyd.js";
import { NEEDS } from "/plakat.js";

const DONE_KEY = "advent:intro-klaret";
const NEED = NEEDS.orb;
const GRACE = 1000;   // ms without the poster before the portal closes again
const SIDE = 1280;    // frames to the worker: long side in px
const params = new URLSearchParams(location.search);
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
  markLetterSeen();
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
      hint.remove();
      navigator.vibrate?.(30);
      await sleep(700);
      const letter = h("article", "ransom intro-paper");
      letter.setAttribute("open", "");
      const [title, body, stamp] = letterParts();
      letter.append(title, body, stamp);
      const lines = [...body.children];
      lines.forEach((p) => p.classList.add("intro-line"));
      env.replaceWith(letter);
      // Line by line; a tap shows the rest at once.
      let fast = false;
      letter.addEventListener("click", () => { fast = true; });
      for (const p of lines) {
        p.classList.add("show");
        if (!fast) await sleep(Math.min(2600, 500 + p.textContent.length * 28));
      }
      const next = button("Videre →", "btn intro-next", () => resolve());
      scene.append(next);
      next.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest" });
    }
  });
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
    const top = h("div", "intro-cam-top");
    top.append(h("p", "intro-cam-title", "Finn har gemt indgangen 🐾"), h("p", "intro-cam-sub", "Den er gemt i et kunstværk derhjemme. Find det med kameraet 🔍"));
    const status = h("p", "intro-status", "Starter kameraet…");
    const bottom = h("div", "intro-cam-bottom");
    const start = button("📷 Start kameraet", "btn intro-start", () => begin());
    start.hidden = true;
    const anyway = button("Driller kameraet? Gå ind alligevel →", "intro-anyway", () => finish(false));
    anyway.hidden = true;
    bottom.append(status, start, anyway);
    if (DEBUG) bottom.append(button("⏭ Spring over (debug)", "debug-skip", () => finish(false)));
    const debugLine = DEBUG ? h("p", "intro-debug", "") : null;
    if (debugLine) bottom.append(debugLine);
    scene.append(video, fx, top, bottom);
    root.replaceChildren(scene);
    document.documentElement.classList.add("intro-camera");

    let stream = null, running = false, finished = false;
    let progress = 0;          // 0…1: how far the portal has opened
    let lastSeen = 0;          // when the poster was last found
    let foundNow = false;      // was it in the latest frame?
    let quad = null, target = null; // the poster's corners on screen (smoothed / latest)
    let crop = null;           // the part of the video she sees (object-fit: cover)
    const sparks = [];
    const t0 = performance.now();

    // Hints while she's looking, and a way in if the camera won't cooperate.
    const hints = [
      [25000, "Psst… det hænger på en væg 🖼️"],
      [50000, "Bjerge, en flod og græsmarker. Japan 🗻"],
    ];
    const hintTimers = hints.map(([ms, text]) => setTimeout(() => { if (!target && !finished) status.textContent = text; }, ms));
    const anywayTimer = setTimeout(() => { anyway.hidden = false; }, 120000);

    async function begin() {
      start.hidden = true;
      status.textContent = "Starter kameraet…";
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        video.srcObject = stream;
        await video.play();
      } catch (e) {
        if (debugLine) debugLine.textContent = `debug: ${e?.name}: ${e?.message}`;
        status.textContent = "Jeg fik ikke lov at bruge kameraet. Tryk igen og vælg \"Tillad\" 📷";
        start.hidden = false;
        anyway.hidden = false;
        return;
      }
      status.textContent = "Henter Finns magi…";
      try {
        await finder.ready;
      } catch (e) {
        status.textContent = "Magien ville ikke starte 😿";
        anyway.hidden = false;
        if (debugLine) debugLine.textContent = `debug: ${e.message}`;
        return;
      }
      status.textContent = "Find kunstværket 🔍";
      running = true;
      loop();
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
        if (!video.videoWidth) { await sleep(100); continue; }
        crop = visible();
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
          quad ??= target.map((p) => [...p]);
        }
        if (debugLine && r) debugLine.textContent = `debug: ${r.inliers} inliers${r.why ? ` (afvist: ${r.why})` : ""} · spredning ${Math.round(r.spread * 100)} % · ${Math.round(r.ms)} ms · ${grab.width}×${grab.height} · ${Math.round(progress * 100)} %`;
      }
    }

    // ---- the magic, at 60 fps
    let lastT = performance.now();
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
      if (!finished) {
        if (seen && foundNow) progress = Math.min(1, progress + (dt * 1000) / HOLD);
        else if (!seen) progress = Math.max(0, progress - dt * 2.2); // closes in under half a second
        if (progress >= 1) finish(true);
        if (running) {
          status.textContent = seen
            ? progress < 0.98 ? `Hold den i billedet… ✨ ${Math.round(progress * 100)} %` : "Portalen åbner! ✨"
            : progress > 0 ? "Hov, den forsvandt 🙈" : status.textContent.startsWith("Hold") || status.textContent.startsWith("Hov") ? "Find kunstværket 🔍" : status.textContent;
        }
      }
      // follow the poster smoothly between detections
      if (target && quad) quad = quad.map((p, i) => [p[0] + (target[i][0] - p[0]) * Math.min(1, dt * 10), p[1] + (target[i][1] - p[1]) * Math.min(1, dt * 10)]);
      draw(now / 1000, dt);
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
      if (quad && p > 0) {
        const path = () => { g.beginPath(); quad.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
        const cx = quad.reduce((a, q) => a + q[0], 0) / 4, cy = quad.reduce((a, q) => a + q[1], 0) / 4;
        const R = Math.max(...quad.map(([x, y]) => Math.hypot(x - cx, y - cy)));
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
        // sparks fly off the frame
        const n = Math.round(p * 6);
        for (let k = 0; k < n; k++) {
          const i = (Math.random() * 4) | 0, f = Math.random();
          const a = quad[i], b = quad[(i + 1) % 4];
          const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
          const ang = Math.atan2(y - cy, x - cx) + (Math.random() - 0.5);
          const v = 40 + Math.random() * 120;
          sparks.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 30, life: 1, hue: 40 + Math.random() * 30 });
        }
      }
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

    async function finish(magic) {
      if (finished) return;
      finished = true;
      running = false;
      hintTimers.forEach(clearTimeout);
      clearTimeout(anywayTimer);
      progress = 1;
      status.textContent = magic ? "Portalen er åben! ✨" : "Ind i escape roomet…";
      portalSound(true);
      navigator.vibrate?.([30, 50, 140]);
      if (!magic) flash = 0;
      await sleep(magic ? 1100 : 600);
      stream?.getTracks().forEach((tr) => tr.stop());
      finder.stop();
      resolve();
    }

    begin();
  });
}

main();
