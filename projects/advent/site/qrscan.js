// Step "qr": scan a QR code (a printed ticket hidden somewhere) with the camera.
// If the camera won't cooperate, the secret code printed on the ticket works too.
//
//   { "type": "qr", "titel": "Innercise check-in", "kode": "INNERCISE:GUS:…",
//     "hemmelig": "BRIAN-29", "velkommen": "Velkommen til gus! 🧖" }

import { h, button, shake } from "/felles.js";
import { camera } from "/kamera.js";
import { makeDetector } from "/stregkode.js";
import { beep } from "/trin.js";

const clean = (s) => String(s ?? "").trim().toUpperCase().replace(/\s+/g, "");

export default function qrscan(cfg, { done }) {
  const root = h("div", "app inn qr");
  const top = h("div", "inn-top");
  top.append(h("span", "inn-logo", cfg.logo ?? "innercise"), h("span", "inn-loc", cfg.titel ?? "Check-in"));
  const cam = camera({ shape: "square", laser: false });
  const msg = cam.msg;
  let finished = false;

  const success = () => {
    if (finished) return;
    finished = true;
    cam.pause();
    cam.flash("ok");
    beep(1319, 90);
    setTimeout(() => beep(1760, 140), 110);
    navigator.vibrate?.([30, 50, 120]);
    const box = h("div", "inn-done");
    box.append(h("p", "qr-check", "✓"), h("p", "inn-ticket-title", cfg.velkommen ?? "Velkommen! Du er tjekket ind 🧖"), button("Videre →", "inn-book", done));
    setTimeout(() => {
      cam.stop();
      root.replaceChildren(top, box);
    }, 900);
  };

  cam.onLive(async () => {
    let detect;
    try {
      detect = await makeDetector();
    } catch {
      return cam.setMsg("Kameraet kunne ikke starte.", true);
    }
    let lastWrongAt = 0;
    cam.run(async (video) => {
      const code = await detect(video);
      if (!code) return false;
      if (clean(code) === clean(cfg.kode)) {
        success();
        return true;
      }
      if (Date.now() - lastWrongAt > 2500) {
        beep(220, 160);
        cam.flash("nope");
        lastWrongAt = Date.now();
      }
      cam.setMsg(cfg.forkert ?? "Ugyldig billet 🤔", true);
      return false;
    });
  });

  const manual = button("Driller scanneren? Indtast den hemmelige kode", "link-btn", () => manual.replaceWith(form()));
  function form() {
    const f = h("form", "manual");
    const input = h("input");
    Object.assign(input, { autocomplete: "off", placeholder: "Hemmelig kode", spellcheck: false });
    input.setAttribute("autocapitalize", "characters");
    input.setAttribute("aria-label", "Hemmelig kode");
    const m = h("p", "manual-msg");
    f.append(input, button("Tjek ind", "btn btn-small", () => f.requestSubmit()), m);
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      if (clean(input.value) === clean(cfg.hemmelig) || clean(input.value) === clean(cfg.kode)) return success();
      m.textContent = "Forkert kode 🤔";
      shake(f);
    });
    queueMicrotask(() => input.focus());
    return f;
  }

  const body = h("div", "qr-body");
  body.append(h("p", "inn-h", cfg.overskrift ?? "Scan din billet"), cam.view, msg, manual);
  root.append(top, body);

  return {
    el: root,
    activate: () => { if (!finished) cam.start(); },
    deactivate: () => cam.stop(),
  };
}
