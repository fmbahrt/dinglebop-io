// Finding the Kusama poster in a camera frame (OpenCV.js, ORB by default).
// Used by the intro (intro.js) and the POC page (plakat-poc.js).
//
// Keypoints + descriptors in the frame are matched against precomputed ones
// from the poster (site/plakat/<algo>.json), Lowe's ratio test throws out unsure
// matches, and a RANSAC homography counts how many matches agree on ONE flat
// poster seen in perspective (inliers). The found quad must also look like our
// poster (implausible()) and the inliers must be spread over it.

// Tested on photos of the real poster on the wall (dim light, glass glare, the
// plant in front): resolution matters most. At 640 px the poster across the room
// is too small (4–20 inliers); at 1280 px it's 130–1074, with ≤4 on the room
// without it. Light normalisation helped little, so it's off.
export const OPT = {
  side: 1280,    // camera frames are scaled to this (long side)
  refSide: 800,  // the poster reference, long side
  norm: "none",  // "eq" (histogram) | "clahe" (local contrast)
  nfeat: 2500,   // ORB points per frame
  ratio: 0.78,   // Lowe's ratio test
};
export const NEEDS = { orb: 20, sift: 18, akaze: 18 }; // inliers to count as found

// ---------- OpenCV ----------

export async function loadCv() {
  const G = globalThis; // the page, or a worker (which loads opencv.js with importScripts first)
  if (!G.cv) {
    if (typeof document === "undefined") throw new Error("opencv.js er ikke indlæst i workeren");
    await new Promise((ok, fail) => {
      const s = document.createElement("script");
      s.src = "/vendor/opencv/opencv.js";
      s.onload = ok;
      s.onerror = () => fail(new Error("opencv.js kunne ikke hentes"));
      document.head.append(s);
    });
  }
  // The Emscripten module is itself "thenable" and resolves to itself, so it
  // must never be awaited directly (that loops forever).
  const cv = G.cv;
  if (cv instanceof Promise) return (G.cv = await cv);
  if (!cv.Mat) {
    await new Promise((resolve) => {
      if (typeof cv.then === "function") cv.then(() => resolve());
      else cv.onRuntimeInitialized = resolve;
    });
  }
  if (typeof cv.then === "function") delete cv.then;
  return cv;
}

export function detector(cv, algo, n) {
  if (algo === "sift") return cv.SIFT ? new cv.SIFT(n) : cv.SIFT_create(n);
  if (algo === "akaze") return new cv.AKAZE();
  return new cv.ORB(n);
}
export const isFloat = (algo) => algo === "sift";
export const ALGOS = (cv) => ["orb", "akaze", ...(cv.SIFT || cv.SIFT_create ? ["sift"] : [])];

/** Grey Mat from an image/video/canvas (or the `crop` of it), scaled so its long side is `side`. */
export function grey(cv, source, side, norm = OPT.norm, crop = null) {
  const W0 = source.videoWidth || source.naturalWidth || source.width;
  const H0 = source.videoHeight || source.naturalHeight || source.height;
  const { x = 0, y = 0, w: w0 = W0, h: h0 = H0 } = crop ?? {}; // crop: only the part she sees
  const k = Math.min(1, side / Math.max(w0, h0));
  const c = document.createElement("canvas");
  c.width = Math.round(w0 * k);
  c.height = Math.round(h0 * k);
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(source, x, y, w0, h0, 0, 0, c.width, c.height);
  return { mat: greyMat(cv, g.getImageData(0, 0, c.width, c.height), norm), scale: k, canvas: c };
}

/** Grey (and optionally light-normalised) Mat from ImageData. Works in a worker. */
export function greyMat(cv, imageData, norm = OPT.norm) {
  const rgba = cv.matFromImageData(imageData);
  const out = new cv.Mat();
  cv.cvtColor(rgba, out, cv.COLOR_RGBA2GRAY);
  rgba.delete();
  if (norm === "eq") cv.equalizeHist(out, out);
  if (norm === "clahe") {
    const clahe = new cv.CLAHE(2.5, new cv.Size(8, 8));
    const tmp = new cv.Mat();
    clahe.apply(out, tmp);
    clahe.delete();
    out.delete();
    return tmp;
  }
  return out;
}

export function detect(cv, algo, mat, n) {
  const d = detector(cv, algo, n);
  const kps = new cv.KeyPointVector();
  const desc = new cv.Mat();
  const none = new cv.Mat();
  d.detectAndCompute(mat, none, kps, desc);
  none.delete();
  d.delete();
  const pts = [];
  for (let i = 0; i < kps.size(); i++) {
    const p = kps.get(i);
    pts.push([p.pt.x, p.pt.y, p.response]);
  }
  kps.delete();
  return { pts, desc };
}

// ---------- reference (the poster) ----------

const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Features of the poster image → JSON (keeps the strongest `keep`). */
export function makeRef(cv, algo, img) {
  const { mat } = grey(cv, img, OPT.refSide);
  const { pts, desc } = detect(cv, algo, mat, 3000);
  const keep = Math.min(pts.length, algo === "sift" ? 1200 : 1500);
  const order = pts.map((p, i) => i).sort((a, b) => pts[b][2] - pts[a][2]).slice(0, keep);
  const cols = desc.cols;
  const bytes = new Uint8Array(keep * cols);
  order.forEach((idx, row) => {
    for (let c = 0; c < cols; c++) {
      bytes[row * cols + c] = isFloat(algo) ? Math.max(0, Math.min(255, Math.round(desc.floatAt(idx, c)))) : desc.ucharAt(idx, c);
    }
  });
  const json = {
    algo, w: mat.cols, h: mat.rows, cols,
    pts: order.map((i) => [Math.round(pts[i][0] * 10) / 10, Math.round(pts[i][1] * 10) / 10]),
    desc: b64(bytes),
  };
  mat.delete();
  desc.delete();
  return json;
}

export function loadRef(cv, json) {
  const bytes = unb64(json.desc);
  const rows = json.pts.length;
  const desc = isFloat(json.algo)
    ? cv.matFromArray(rows, json.cols, cv.CV_32F, Array.from(bytes))
    : cv.matFromArray(rows, json.cols, cv.CV_8U, Array.from(bytes));
  return { ...json, descMat: desc };
}

// ---------- matching ----------

/** Match one frame against the poster. → { inliers, good, quad (frame px), ms } */
export function match(cv, ref, mat) {
  const t0 = performance.now();
  const { pts, desc } = detect(cv, ref.algo, mat, ref.algo === "orb" ? OPT.nfeat : 0);
  const res = { inliers: 0, good: 0, kps: pts.length, quad: null, ms: 0 };
  if (pts.length < 8 || desc.rows < 2) { desc.delete(); res.ms = performance.now() - t0; return res; }
  const matcher = new cv.BFMatcher(isFloat(ref.algo) ? cv.NORM_L2 : cv.NORM_HAMMING, false);
  const knn = new cv.DMatchVectorVector();
  matcher.knnMatch(desc, ref.descMat, knn, 2);
  const src = [], dst = [];
  for (let i = 0; i < knn.size(); i++) {
    const m = knn.get(i);
    if (m.size() < 2) continue;
    const a = m.get(0), b = m.get(1);
    if (a.distance < OPT.ratio * b.distance) {
      const r = ref.pts[a.trainIdx], f = pts[a.queryIdx];
      src.push(r[0], r[1]);
      dst.push(f[0], f[1]);
    }
  }
  knn.delete();
  matcher.delete();
  desc.delete();
  res.good = src.length / 2;
  if (res.good >= 8) {
    const s = cv.matFromArray(res.good, 1, cv.CV_32FC2, src);
    const d = cv.matFromArray(res.good, 1, cv.CV_32FC2, dst);
    const mask = new cv.Mat();
    const H = cv.findHomography(s, d, cv.RANSAC, 6, mask);
    if (!H.empty()) {
      // Where on the poster do the inliers sit? (Random matches clump together.)
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < mask.rows; i++) {
        if (!mask.ucharAt(i, 0)) continue;
        res.inliers++;
        const x = src[2 * i], y = src[2 * i + 1];
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
      res.spread = res.inliers ? ((x1 - x0) * (y1 - y0)) / (ref.w * ref.h) : 0;
      const h = H.data64F;
      res.H = Array.from(h);
      const proj = ([x, y]) => { const w = h[6] * x + h[7] * y + h[8]; return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]; };
      res.quad = [[0, 0], [ref.w, 0], [ref.w, ref.h], [0, ref.h]].map(proj);
      res.why = implausible(res.quad, mat.cols, mat.rows, ref) ?? (res.spread < 0.15 ? `punkterne klumper (${Math.round(res.spread * 100)} %)` : null);
      if (res.why) { res.rawInliers = res.inliers; res.inliers = Math.min(res.inliers, 4); }
    }
    for (const m of [s, d, mask, H]) m.delete();
  }
  res.ms = performance.now() - t0;
  return res;
}

/**
 * Does the found quad look like OUR poster seen in perspective? Returns why not
 * (or null): convex and not mirrored, corners not too sharp, opposite sides of
 * similar length, roughly the poster's proportions, a sensible size.
 */
export function implausible(q, W, H, ref) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const len = (v) => Math.hypot(v[0], v[1]);
  for (let i = 0; i < 4; i++) {
    const a = q[(i + 3) % 4], b = q[i], c = q[(i + 1) % 4];
    const u = sub(a, b), v = sub(c, b);
    // corners go clockwise on screen like on the poster (else: folded or mirrored)
    const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (!(z > 0)) return "ikke konveks/spejlvendt";
    const angle = (Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (len(u) * len(v))))) * 180) / Math.PI;
    if (angle < 40 || angle > 140) return `skæv vinkel (${Math.round(angle)}°)`;
  }
  const top = len(sub(q[1], q[0])), right = len(sub(q[2], q[1])), bottom = len(sub(q[3], q[2])), left = len(sub(q[0], q[3]));
  const ratio = (a, b) => Math.max(a, b) / Math.min(a, b);
  if (ratio(top, bottom) > 2.2 || ratio(left, right) > 2.2) return "for meget perspektiv";
  const aspect = (top + bottom) / (left + right) / (ref.w / ref.h); // 1 = the poster's own shape
  if (aspect < 0.45 || aspect > 2.2) return `forkerte proportioner (${aspect.toFixed(2)})`;
  let area = 0;
  for (let i = 0; i < 4; i++) area += q[i][0] * q[(i + 1) % 4][1] - q[(i + 1) % 4][0] * q[i][1];
  area = Math.abs(area) / 2;
  if (area < 0.01 * W * H) return "for lille";
  if (area > 25 * W * H) return "for stor";
  return null;
}

