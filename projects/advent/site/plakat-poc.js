// POC: unlock by pointing the camera at the Kusama poster on the wall.
//
// Classic planar object recognition with OpenCV.js: keypoints + descriptors
// (ORB by default, or ?algo=akaze; ?algo=sift only if the opencv.js build has
// it, which the prebuilt one does not) in every camera frame are
// matched against precomputed ones from the poster (site/plakat/<algo>.json),
// Lowe's ratio test throws out unsure matches, and a RANSAC homography counts
// how many matches agree on ONE flat poster seen in perspective (inliers).
// Enough inliers two frames in a row = unlocked.
//
// The poster itself is copyrighted, so the repo only holds its features (points
// and descriptors), not the image. Make them with ?lav: pick a cropped photo or
// scan of the poster, and the JSON files are downloaded. The current ones come
// from a photo of OUR poster on the wall, straightened with rectify() (the real
// print, light and glass match better than the shop's product picture).
//
// Debug hooks for tests: window.plakat.test(imageDataUrl) and .make(imageDataUrl).

import { OPT, NEEDS, ALGOS, loadCv, grey, makeRef, loadRef, match } from "/plakat.js";

const params = new URLSearchParams(location.search);
const ALGO = ["orb", "sift", "akaze"].includes(params.get("algo")) ? params.get("algo") : "orb";
// Tunables live in plakat.js (OPT); ?side= and ?norm= override them here.
if (params.get("side")) OPT.side = Number(params.get("side"));
if (["eq", "clahe"].includes(params.get("norm"))) OPT.norm = params.get("norm");
const NEED = NEEDS[ALGO]; // inliers to count as found
const STREAK = 2;        // …this many frames in a row

const $ = (s) => document.querySelector(s);
const video = $(".pp-video"), overlay = $(".pp-overlay"), msg = $(".pp-msg");
const meterFill = $(".pp-meter-fill"), meterText = $(".pp-meter-text"), debug = $(".pp-debug");
const startBtn = $(".pp-start");

// ---------- UI ----------

function setMeter(inliers) {
  const p = Math.min(1, inliers / NEED);
  meterFill.style.transform = `scaleX(${p.toFixed(3)})`;
  meterText.textContent = `${inliers} / ${NEED} punkter passer`;
  meterFill.classList.toggle("hot", p >= 1);
}

function drawQuad(q, scale, found) {
  const W = overlay.clientWidth, Hh = overlay.clientHeight;
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (overlay.width !== W * dpr) { overlay.width = W * dpr; overlay.height = Hh * dpr; }
  const g = overlay.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, Hh);
  if (!q) return;
  // video is object-fit: cover → map video px to element px
  const vw = video.videoWidth, vh = video.videoHeight;
  const k = Math.max(W / vw, Hh / vh), ox = (W - vw * k) / 2, oy = (Hh - vh * k) / 2;
  g.beginPath();
  q.forEach(([x, y], i) => { const X = ox + (x / scale) * k, Y = oy + (y / scale) * k; i ? g.lineTo(X, Y) : g.moveTo(X, Y); });
  g.closePath();
  g.lineWidth = 4;
  g.strokeStyle = found ? "#5be38a" : "rgba(255, 210, 127, .8)";
  g.fillStyle = found ? "rgba(91, 227, 138, .18)" : "rgba(255, 210, 127, .08)";
  g.fill();
  g.stroke();
}

async function main() {
  const cv = await loadCv().catch((e) => { msg.textContent = `❌ ${e.message}`; throw e; });
  const algos = ALGOS(cv).map((a) => `<a href="?algo=${a}"${a === ALGO ? ' class="on"' : ""}>${a.toUpperCase()}</a>`).join(" · ");
  $(".pp-algos").innerHTML = `Algoritme: ${algos} · <a href="?lav">lav features</a>`;
  window.plakat = { cv, makeRef: (img, algo = ALGO) => makeRef(cv, algo, img) };
  // Experiments: refs made from images with options, then frames matched against them.
  window.plakat.lab = async ({ refs, frames, opts = {}, algo = ALGO }) => {
    Object.assign(OPT, opts);
    const load = async (u) => { const i = new Image(); i.src = u; await i.decode(); return i; };
    const R = [];
    for (const u of refs) { const j = makeRef(cv, algo, await load(u)); R.push(loadRef(cv, j)); }
    const out = {};
    for (const [name, u] of Object.entries(frames)) {
      const { mat } = grey(cv, await load(u), OPT.side);
      const res = R.map((ref) => match(cv, ref, mat));
      mat.delete();
      const best = res.reduce((a, b) => (b.inliers > a.inliers ? b : a));
      out[name] = { inliers: best.inliers, per: res.map((x) => x.inliers), good: best.good, ms: Math.round(res.reduce((a, b) => a + b.ms, 0)) };
    }
    R.forEach((x) => x.descMat.delete());
    return out;
  };
  // Straighten the poster in a photo: find it with `refUrl`, then warp the photo
  // into the reference's frame (a flat, front-on picture of the real print).
  window.plakat.rectify = async (refUrl, photoUrl, opts = {}, algo = ALGO) => {
    Object.assign(OPT, opts);
    const load = async (u) => { const i = new Image(); i.src = u; await i.decode(); return i; };
    const ref = loadRef(cv, makeRef(cv, algo, await load(refUrl)));
    const photo = await load(photoUrl);
    const { mat, scale } = grey(cv, photo, OPT.side);
    const res = match(cv, ref, mat);
    mat.delete();
    ref.descMat.delete();
    if (!res.H) return null;
    // colour photo at the same scale
    const c = document.createElement("canvas");
    c.width = Math.round(photo.naturalWidth * scale);
    c.height = Math.round(photo.naturalHeight * scale);
    c.getContext("2d").drawImage(photo, 0, 0, c.width, c.height);
    const src = cv.imread(c), dst = new cv.Mat();
    const H = cv.matFromArray(3, 3, cv.CV_64F, res.H);
    // H maps reference → photo, so warp with the inverse map; render at 2× the reference size.
    const S = cv.matFromArray(3, 3, cv.CV_64F, [0.5, 0, 0, 0, 0.5, 0, 0, 0, 1]);
    const HS = new cv.Mat();
    cv.gemm(H, S, 1, new cv.Mat(), 0, HS);
    cv.warpPerspective(src, dst, HS, new cv.Size(ref.w * 2, ref.h * 2), cv.INTER_LINEAR | cv.WARP_INVERSE_MAP);
    const outC = document.createElement("canvas");
    cv.imshow(outC, dst);
    for (const m of [src, dst, H, S, HS]) m.delete();
    return { inliers: res.inliers, url: outC.toDataURL("image/jpeg", 0.92) };
  };

  if (params.has("lav")) return makeMode(cv);

  let ref;
  try {
    const r = await fetch(`/plakat/${ALGO}.json`, { cache: "no-cache" });
    if (!r.ok) throw new Error();
    ref = loadRef(cv, await r.json());
  } catch {
    msg.textContent = `Mangler site/plakat/${ALGO}.json – lav den med ?lav`;
    return;
  }
  window.plakat.test = async (url) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const { mat, scale } = grey(cv, img, OPT.side);
    const r = match(cv, ref, mat);
    mat.delete();
    return { ...r, scale };
  };
  msg.textContent = `Klar (${ALGO.toUpperCase()}, ${ref.pts.length} punkter på plakaten).`;
  startBtn.hidden = false;
  startBtn.onclick = () => run(cv, ref);
  if (params.has("auto")) run(cv, ref);
}

async function run(cv, ref) {
  startBtn.hidden = true;
  try {
    video.srcObject = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
    await video.play();
    // Show exactly what the detector sees: the box takes the camera's shape (a
    // laptop webcam is 16:9 landscape; cover-cropping hid over half of it).
    $(".pp-cam").style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
  } catch {
    startBtn.hidden = false;
    msg.textContent = "Jeg fik ikke lov at bruge kameraet.";
    return;
  }
  msg.textContent = "Peg på plakaten 🗻";
  let streak = 0, frames = 0, sum = 0;
  const loop = () => {
    if (!video.videoWidth) return setTimeout(loop, 100);
    const { mat, scale, canvas: frame } = grey(cv, video, OPT.side);
    const r = match(cv, ref, mat);
    mat.delete();
    frames++;
    sum += r.ms;
    const ok = r.inliers >= NEED;
    streak = ok ? streak + 1 : 0;
    setMeter(r.inliers);
    drawQuad(r.quad, scale, ok);
    debug.textContent = `${ALGO} ${video.videoWidth}×${video.videoHeight}: ${r.kps} punkter · ${r.good} gode match · ${r.inliers} inliers${r.why ? ` (afvist: ${r.why}, ${r.rawInliers} rå)` : ""} · spredning ${Math.round((r.spread ?? 0) * 100)} % · ${Math.round(r.ms)} ms (snit ${Math.round(sum / frames)} ms)`;
    if (streak >= STREAK) {
      // Freeze the exact frame it matched (not the video, which has moved on),
      // with the quad on top, so you can see what it found.
      const snap = $(".pp-snap");
      snap.width = frame.width;
      snap.height = frame.height;
      snap.getContext("2d").drawImage(frame, 0, 0);
      snap.hidden = false;
      video.pause();
      $(".pp-unlocked").hidden = false;
      msg.textContent = "Plakaten er fundet – forsiden ville låse op nu 🎉 (billedet er frosset: den grønne firkant er det, den fandt)";
      navigator.vibrate?.([30, 50, 120]);
      startBtn.textContent = "↺ Prøv igen";
      startBtn.hidden = false;
      startBtn.onclick = () => {
        $(".pp-unlocked").hidden = true;
        $(".pp-snap").hidden = true;
        startBtn.hidden = true;
        msg.textContent = "Peg på plakaten 🗻";
        streak = 0;
        video.play();
        loop();
      };
      return;
    }
    setTimeout(loop, 60);
  };
  loop();
}

function makeMode(cv) {
  $(".pp-make").hidden = false;
  $(".pp-cam").hidden = true;
  $(".pp-meter").hidden = true;
  msg.textContent = "";
  $(".pp-file").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();
    const out = $(".pp-make-out");
    out.textContent = "";
    for (const algo of ALGOS(cv)) {
      const json = makeRef(cv, algo, img);
      out.textContent += `${algo}: ${json.pts.length} punkter (${json.w}×${json.h})\n`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(json)], { type: "application/json" }));
      a.download = `${algo}.json`;
      a.click();
    }
    out.textContent += "Læg filerne i site/plakat/";
  };
}

main();
