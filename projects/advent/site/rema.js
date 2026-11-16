// Step "rema": a self-scanning supermarket app. Scan the right product with the
// camera (same scanner as the "stregkode" puzzle), pay, and get a receipt.
//
//   { "type": "rema", "stregkode": "4037400716206", "vare": "Panda lakrids", "pris": 25,
//     "liste": ["Det sædvanlige slik 🍬"], "tak": "GOD HYGGEAFTEN ♥" }

import { h, button, shake } from "/felles.js";
import { camera } from "/kamera.js";
import { makeDetector, norm } from "/stregkode.js";
import { kr, beep } from "/trin.js";

export default function rema(cfg, { done }) {
  const isCorrect = (code) => norm(code) !== "" && norm(code) === norm(cfg.stregkode);
  const price = Number(cfg.pris ?? 0);
  const item = cfg.vare ?? "Slik";

  const root = h("div", "app rema");
  const top = h("div", "rema-top");
  const logo = h("span", "rema-logo");
  logo.append(h("span", null, "REMA"), h("span", "rema-1000", "1000"));
  top.append(logo, h("span", "rema-mode", "Scan selv"));

  const list = h("div", "rema-list");
  const listItems = (cfg.liste ?? []).map((t) => h("li", null, t));
  const ul = h("ul");
  ul.append(...listItems);
  list.append(h("p", "rema-h", "Indkøbsseddel"), ul);

  const cam = camera({ shape: "wide", laser: true });
  const basket = h("div", "rema-basket");
  const basketLines = h("div", "rema-lines");
  const basketSum = h("p", "rema-sum");
  const pay = button("Gå til betaling", "rema-pay", () => checkout());
  pay.hidden = true;
  basket.append(h("p", "rema-h", "Kurv"), basketLines, basketSum);
  const drawBasket = (scanned) => {
    basketLines.replaceChildren(...(scanned ? [line(item, kr(price), "rema-new")] : [h("p", "rema-empty", "Kurven er tom")]));
    basketSum.replaceChildren(h("span", null, "I alt"), h("span", null, kr(scanned ? price : 0)));
  };
  drawBasket(false);

  let scanned = false;
  const found = () => {
    if (scanned) return;
    scanned = true;
    cam.pause();
    cam.flash("ok");
    beep(1760, 120);
    navigator.vibrate?.(60);
    cam.setMsg("Varen er lagt i kurven ✓");
    listItems.forEach((li) => li.classList.add("done"));
    drawBasket(true);
    pay.hidden = false;
    manualLink.remove();
    setTimeout(() => pay.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
  };

  cam.onLive(async () => {
    if (scanned) return;
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
        found();
        return true;
      }
      const now = Date.now();
      if (code !== lastWrong || now - lastWrongAt > 2500) {
        beep(220, 180);
        navigator.vibrate?.(150);
        cam.flash("nope");
      }
      lastWrong = code;
      lastWrongAt = now;
      cam.setMsg("Den står ikke på indkøbssedlen 🤔", true);
      return false;
    });
  });

  const manualLink = button("Virker kameraet ikke?", "link-btn", () => manualLink.replaceWith(manualForm()));
  function manualForm() {
    const form = h("form", "manual");
    const input = h("input");
    Object.assign(input, { inputMode: "numeric", autocomplete: "off", placeholder: "Tast varens nummer" });
    input.setAttribute("aria-label", "Tast varens nummer");
    const msg = h("p", "manual-msg");
    form.append(input, button("Tilføj", "btn btn-small", () => form.requestSubmit()), msg);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (isCorrect(input.value)) return form.remove(), found();
      msg.textContent = "Den står ikke på indkøbssedlen 🤔";
      shake(form);
    });
    queueMicrotask(() => input.focus());
    return form;
  }

  // ---- pay: print a receipt
  function checkout() {
    cam.stop();
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const bon = h("div", "bon rema-bon printing");
    const rows = [
      h("p", "bon-head", "REMA 1000"),
      h("p", "bon-meta", `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}  ${pad(now.getHours())}:${pad(now.getMinutes())}  ·  SCAN SELV`),
      h("p", "bon-rule"),
      line(item.toLocaleUpperCase("da"), kr(price).replace(" kr", "")),
      h("p", "bon-rule"),
      line("TOTAL", kr(price), "bon-order"),
      line("BETALT", "✓"),
      h("p", "bon-rule"),
      h("p", "bon-thanks", cfg.tak ?? "TAK FOR BESØGET ♥"),
    ];
    rows.forEach((r, i) => {
      r.classList.add("bon-print");
      r.style.animationDelay = `${300 + i * 220}ms`;
    });
    bon.append(...rows);
    const finish = button("Færdig ✓", "btn", done);
    finish.style.animationDelay = `${300 + rows.length * 220}ms`;
    finish.classList.add("rema-finish");
    beep(1320, 80);
    root.replaceChildren(top, h("p", "rema-h rema-paid", "Betaling gennemført"), bon, finish);
    root.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const scanBox = h("div", "rema-scan");
  scanBox.append(cam.view, cam.msg, manualLink);
  root.append(top, list, scanBox, basket, pay);

  return {
    el: root,
    activate: () => { if (!scanned) cam.start(); },
    deactivate: () => cam.stop(),
  };
}

function line(a, b, cls) {
  const r = h("div", `rema-line${cls ? ` ${cls}` : ""}`);
  r.append(h("span", null, a), h("span", null, b));
  return r;
}
