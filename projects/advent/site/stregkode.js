// Barcode puzzle: scan the right barcode with the phone camera to unlock the number.
//
//   { "type": "stregkode", "stregkode": "<the digits under the barcode>", "tal": "9" }
//
// Uses the native BarcodeDetector where it exists (Chrome on Android) and falls
// back to ZXing (iPhone Safari has no BarcodeDetector).

import { h, button, shake, taskShell, intro } from "/felles.js";
import { camera } from "/kamera.js";

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];

/** Compare codes by their digits only; UPC-A is EAN-13 with a leading 0. */
export const norm = (s) => String(s ?? "").replace(/\D/g, "").replace(/^0+/, "");

export function stregkodeOpgave(opgave, ctx) {
  const isCorrect = (code) => norm(code) !== "" && norm(code) === norm(opgave.stregkode);
  let cam = null;

  function renderLocked(card, solve) {
    cam = camera({ shape: "wide", laser: true });
    cam.onLive(async () => {
      let detect;
      try {
        detect = await makeDetector();
      } catch {
        return cam.setMsg("Kameraet kunne ikke starte.", true);
      }
      let lastWrong = "";
      let lastWrongAt = 0;
      cam.run(async (video) => {
        const code = await detect(video);
        if (!code) return false;
        if (isCorrect(code)) {
          cam.pause();
          cam.flash("ok");
          cam.setMsg("Fundet! ✨");
          setTimeout(solve, 700);
          return true;
        }
        const now = Date.now();
        if (code !== lastWrong || now - lastWrongAt > 2500) {
          navigator.vibrate?.(150);
          cam.flash("nope");
        }
        lastWrong = code;
        lastWrongAt = now;
        cam.setMsg("Nej, ikke den 🤔", true);
        return false;
      });
    });

    const manualLink = button("Virker kameraet ikke?", "link-btn", () => manualLink.replaceWith(manualForm(solve)));
    card.replaceChildren(...intro(opgave), cam.view, cam.msg, manualLink);
  }

  function manualForm(solve) {
    const form = h("form", "manual");
    const input = h("input");
    Object.assign(input, { inputMode: "numeric", autocomplete: "off", placeholder: "Indtast koden" });
    input.setAttribute("aria-label", "Indtast koden");
    const msg = h("p", "manual-msg");
    form.append(input, button("Lås op", "btn btn-small", () => form.requestSubmit()), msg);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (isCorrect(input.value)) return solve();
      msg.textContent = "Hmm, det passer ikke 🤔";
      shake(form);
    });
    queueMicrotask(() => input.focus());
    return form;
  }

  return taskShell(opgave, ctx, {
    renderLocked,
    activate: () => cam?.start(),
    deactivate: () => cam?.stop(),
  });
}

// ---------- detection ----------

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.append(s);
  });
}

let detectorPromise = null;
export const makeDetector = () => (detectorPromise ??= createDetector().catch((e) => { detectorPromise = null; throw e; }));

async function createDetector() {
  if ("BarcodeDetector" in window) {
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      const formats = FORMATS.filter((f) => supported.includes(f));
      if (formats.length) {
        const d = new window.BarcodeDetector({ formats });
        return async (video) => (await d.detect(video))[0]?.rawValue ?? null;
      }
    } catch { /* fall through to ZXing */ }
  }

  if (!window.ZXing) await loadScript("/vendor/zxing.min.js");
  const Z = window.ZXing;
  const hints = new Map([
    [Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E, Z.BarcodeFormat.CODE_128]],
    [Z.DecodeHintType.TRY_HARDER, true],
  ]);
  const reader = new Z.MultiFormatReader();
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  return async (video) => {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;
    // Decode the middle band of the frame, where the on-screen frame is.
    const sw = vw * 0.9, sh = Math.min(vh * 0.6, sw * 0.7);
    const scale = Math.min(1, 1000 / sw);
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
    try {
      const bitmap = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)));
      return reader.decode(bitmap, hints).getText();
    } catch {
      return null; // nothing found in this frame
    }
  };
}
