// Before the car: her phone (the same home screen as the other weeks) with a USB
// cable underneath. Drag the plug up into the phone (or tap it), allow CarPlay,
// and the phone slides away so the dashboard can take over.
//
//   "telefon": { "tekst": "…", "nej": "…", "spørgsmål": "…", "ikkenu": "…" }   (all optional)
//
// With sms ({ body, slug, collage }) the same phone first shows Finn's texts
// (sms.js); "Gå hjem" then shows the home screen and the cable slides up.

import { h, button } from "/felles.js";
import { beep, phoneStatus, phoneIcon, PHONE_APPS, PHONE_DOCK } from "/trin.js";
import { smsApp, smsRead } from "/sms.js";

export function usbPhone(cfg = {}, { bil = "Opel Corsa", sms = null, onConnected = () => {} } = {}) {
  const stage = h("div", "usb");
  const phone = h("div", "iph usb-phone");
  const screen = h("div", "iph-screen");
  const { el: status, tick } = phoneStatus();
  const toast = h("p", "iph-toast");
  let toastTimer = 0;
  const say = (text) => {
    toast.textContent = text;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
  };

  const nope = () => say(cfg.nej ?? "Ikke nu – vi skal hjem 🚗");
  const home = h("div", "iph-home");
  const grid = h("div", "iph-grid");
  grid.append(...PHONE_APPS.map((a) => phoneIcon(a, nope)));
  const dock = h("div", "iph-dock");
  dock.append(...PHONE_DOCK.map((a) => phoneIcon(a, nope)));
  const hint = h("p", "iph-hint", cfg.tekst ?? "Telefonen skal med i bilen 🚗");
  home.append(grid, hint, dock);
  screen.append(status, home, toast);
  const port = h("span", "usb-port");
  phone.append(screen, port);

  // The cable: drag the plug up into the port, or tap it.
  const cable = h("div", "usb-cable");
  const plug = h("span", "usb-plug");
  plug.append(h("span", "usb-tip"));
  cable.append(plug, h("span", "usb-wire"));
  const bolt = h("span", "usb-bolt", "⚡");
  stage.append(phone, cable, bolt);

  // Finn's texts first, on this same phone; then home, and the cable comes up.
  if (sms) {
    stage.classList.add("waiting");
    const app = smsApp(screen, {
      ...sms,
      tick,
      onDone: () => {
        const home = button("Gå hjem", "usb-gohome", () => {
          home.remove();
          app.close();
          stage.classList.remove("waiting");
          setTimeout(() => cable.scrollIntoView?.({ behavior: "smooth", block: "end" }), 300);
        });
        screen.append(home);
      },
    });
    screen.append(h("span", "iph-homebar-static"));
    // Read them before (e.g. a reload before plugging in): straight to the cable.
    if (smsRead(sms.seenKey)) {
      app.close();
      stage.classList.remove("waiting");
    } else {
      requestAnimationFrame(() => app.start());
    }
  }

  let travel = 0; // px from the start position to the port
  let drag = null;
  let plugged = false;
  const measure = () => {
    // Where the plug body would touch the phone, from its resting position
    // (measured from the cable: the plug itself may be mid-"nudge" animation).
    const p = port.getBoundingClientRect();
    const top = cable.getBoundingClientRect().top + plug.offsetTop;
    travel = Math.max(0, top + (Number(cable.dataset.y) || 0) - p.bottom);
  };
  const setY = (y) => {
    cable.dataset.y = y;
    cable.style.transform = `translate(-50%, ${-y}px)`;
  };
  cable.addEventListener("pointerdown", (e) => {
    if (plugged) return;
    measure();
    cable.setPointerCapture(e.pointerId);
    drag = { y0: e.clientY, moved: false };
    cable.classList.remove("spring");
  });
  cable.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dy = drag.y0 - e.clientY;
    if (Math.abs(dy) > 5) drag.moved = true;
    setY(Math.max(0, Math.min(travel, dy)));
  });
  const release = () => {
    if (!drag) return;
    const { moved } = drag;
    drag = null;
    const y = Number(cable.dataset.y) || 0;
    if (!moved || y > travel * 0.6) return plugIn();
    cable.classList.add("spring");
    setY(0);
  };
  cable.addEventListener("pointerup", release);
  cable.addEventListener("pointercancel", release);

  function plugIn() {
    if (plugged) return;
    plugged = true;
    measure();
    cable.classList.add("spring");
    setY(travel);
    stage.classList.add("plugged");
    setTimeout(() => {
      beep(880, 60);
      setTimeout(() => beep(1320, 90), 90);
      navigator.vibrate?.(40);
      screen.classList.add("charging");
      hint.textContent = "Forbinder… 🔌";
      setTimeout(ask, 900);
    }, 350);
  }

  // The iOS-style alert.
  function ask() {
    const veil = h("div", "usb-veil");
    const alert = h("div", "usb-alert");
    const text = h("div", "usb-alert-text");
    text.append(h("p", "usb-alert-title", "CarPlay"), h("p", "usb-alert-msg", cfg.spørgsmål ?? `Vil du bruge CarPlay med „${bil}“?`));
    const no = button(cfg.afvis ?? "Ikke nu", "usb-alert-btn", () => {
      say(cfg.ikkenu ?? "Så kører vi uden musik?! Nej nej. Prøv igen 🐾");
      alert.classList.remove("in");
      void alert.offsetWidth;
      alert.classList.add("in");
    });
    const yes = button(cfg.tillad ?? "Tillad", "usb-alert-btn strong", () => {
      veil.remove();
      toast.classList.remove("show");
      beep(1047, 80);
      setTimeout(() => beep(1568, 140), 100);
      navigator.vibrate?.([20, 40, 60]);
      hint.textContent = "CarPlay er tilsluttet ✓";
      screen.classList.add("carplay");
      setTimeout(() => stage.classList.add("away"), 1100);
      setTimeout(onConnected, 2000);
    });
    const btns = h("div", "usb-alert-btns");
    btns.append(no, yes);
    alert.append(text, btns);
    veil.append(alert);
    screen.append(veil);
    requestAnimationFrame(() => alert.classList.add("in"));
  }

  return { el: stage };
}
