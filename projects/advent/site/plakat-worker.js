// Web Worker: finds the poster in frames sent from the page (intro.js), so
// OpenCV's 50–250 ms per frame never blocks the page's 60 fps animation.
//
//   → { type: "init", ref: <site/plakat/orb.json> }      ← { type: "ready" }
//   → { type: "frame", id, image: ImageData }             ← { type: "result", id, inliers, quad, why, spread, ms }
//
// Classic worker (importScripts for the UMD opencv.js), then plakat.js via
// dynamic import. Needs 'unsafe-eval' + 'wasm-unsafe-eval' (see nginx.conf).

importScripts("/vendor/opencv/opencv.js");

let cv = null, ref = null, lib = null;

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === "init") {
      lib = await import("/plakat.js");
      cv = await lib.loadCv();
      ref = lib.loadRef(cv, m.ref);
      self.postMessage({ type: "ready" });
    } else if (m.type === "frame" && ref) {
      const mat = lib.greyMat(cv, m.image);
      const r = lib.match(cv, ref, mat);
      mat.delete();
      self.postMessage({ type: "result", id: m.id, inliers: r.inliers, quad: r.quad, why: r.why ?? null, spread: r.spread ?? 0, good: r.good, ms: r.ms });
    }
  } catch (err) {
    self.postMessage({ type: "error", message: String(err?.message ?? err) });
  }
};
