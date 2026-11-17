// Step "saedevarme": a car's climate panel. Start the car, then find the button
// for the passenger's seat heating and turn it all the way up. The other
// buttons (driver's seat, seat cooling, steering wheel, A/C …) answer back.
//
//   { "type": "saedevarme", "niveau": 3, "ude": "-3°", "beskeder": { "fører": "Det er min side 😄", … } }
//
// Like most cars, a press goes 3 → 2 → 1 → off.

import { h, button } from "/felles.js";
import { beep } from "/trin.js";

const svg = (body, cls = "") => `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const SEAT = `<path d="M6 4.5c0-1.4 1.6-2 2.5-1l.6 1.2L11.5 17H20a2.5 2.5 0 0 1 2.5 2.5V22H11.2L9 27.5"/><path d="M14 27.5h8.5"/>`;
const WAVES = `<path d="M18.5 3.5c-1.4 1.6 1.4 2.9 0 4.6s1.4 2.9 0 4.6M23 3.5c-1.4 1.6 1.4 2.9 0 4.6s1.4 2.9 0 4.6M27.5 3.5c-1.4 1.6 1.4 2.9 0 4.6s1.4 2.9 0 4.6"/>`;
const AIR = `<path d="M17 5h10M17 9.5h8M17 14h10"/><path d="M24.5 3l2.5 2-2.5 2M24.5 12l2.5 2-2.5 2"/>`;
const WHEEL = `<circle cx="16" cy="19" r="9"/><circle cx="16" cy="19" r="2.5"/><path d="M7.5 17.5l6-1M24.5 17.5l-6-1M16 21.5V28"/><path d="M11 2.5c-1.2 1.4 1.2 2.6 0 4M16 2.5c-1.2 1.4 1.2 2.6 0 4M21 2.5c-1.2 1.4 1.2 2.6 0 4"/>`;
const FRONT = `<path d="M4 23c3-11 21-11 24 0z"/><path d="M11 6c-1.2 1.4 1.2 2.6 0 4M16 4.5c-1.2 1.4 1.2 2.6 0 4M21 6c-1.2 1.4 1.2 2.6 0 4"/>`;
const REAR = `<rect x="4" y="9" width="24" height="15" rx="2.5"/><path d="M10 13.5c-1.2 1.4 1.2 2.6 0 4M16 13.5c-1.2 1.4 1.2 2.6 0 4M22 13.5c-1.2 1.4 1.2 2.6 0 4"/>`;
const RECIRC = `<path d="M4 22h24M7 22l2.5-6h13L25 22"/><path d="M21 9.5a5.5 5.5 0 1 0-1.6 4"/><path d="M21.5 5.5v4.2h-4.2"/>`;

const SAY = {
  fører: "Det er min side 😄 Find din!",
  førerkøl: "Sædekøl på min side? Nej tak 🥶",
  køl: "Brrr! Det er sædekøl 🥶",
  rat: "Rattet? Det er mig, der kører 😉",
  ac: "A/C? I december?! 🥶",
  for: "Forruden er fin 👍",
  bag: "Bagruden er fin 👍",
  luft: "Luften er fin 🌬️",
  auto: "Auto… men hvad med sædet? 🤔",
};

// Inside the car (bil.js) it runs embedded: { embedded: true } skips the START
// button (the key is turned elsewhere) and shows the panel straight away.
export default function saedevarme(cfg, { done, embedded = false }) {
  const target = Number(cfg.niveau ?? 3);
  const say = { ...SAY, ...(cfg.beskeder ?? {}) };
  const root = h("div", "app car");

  // ---- engine off: one big START button
  const off = h("div", "car-off");
  const start = button("", "car-start", () => {
    beep(330, 120);
    setTimeout(() => beep(660, 160), 140);
    navigator.vibrate?.([20, 60, 120]);
    root.classList.add("on");
    off.remove();
    root.append(panel());
  });
  start.innerHTML = `<span class="car-start-ring"></span><span class="car-start-label">ENGINE<br><b>START</b><br>STOP</span>`;
  off.append(h("p", "car-off-text", cfg.start ?? "Først skal bilen startes…"), start);
  if (embedded) {
    root.classList.add("on", "embedded");
    root.append(panel());
  } else {
    root.append(off);
  }

  function panel() {
    const wrap = h("div", "car-panel");
    const screen = h("div", "car-screen");
    const temps = h("div", "car-temps");
    temps.append(h("span", "car-temp", "21.0°"), h("span", "car-out", `Ude ${cfg.ude ?? "-3°"} ❄️`), h("span", "car-temp", "21.0°"));
    const msg = h("p", "car-msg", cfg.besked ?? "Hvad mangler vi? 🤔");
    screen.append(temps, msg);

    let timer = 0;
    const tell = (text, kind = "") => {
      msg.textContent = text;
      msg.className = `car-msg ${kind}`;
      msg.classList.remove("pop");
      void msg.offsetWidth;
      msg.classList.add("pop");
    };

    // A heat/cool button with three level LEDs; a press goes 3 → 2 → 1 → off.
    const levelBtn = (icon, cls, key, onLevel) => {
      let level = 0;
      const b = button("", `car-btn ${cls}`, () => {
        level = level === 0 ? 3 : level - 1;
        leds.forEach((l, i) => l.classList.toggle("lit", i < level));
        b.classList.toggle("active", level > 0);
        beep(level ? 1200 : 700, 40);
        navigator.vibrate?.(10);
        onLevel(level, key);
      });
      b.innerHTML = icon;
      const leds = [0, 1, 2].map(() => h("span", "car-led"));
      const ledRow = h("span", "car-leds");
      ledRow.append(...leds);
      b.append(ledRow);
      return b;
    };
    const plain = (icon, key, label) => {
      const b = button("", "car-btn plain", () => {
        b.classList.toggle("active");
        beep(1000, 35);
        tell(say[key]);
      });
      b.innerHTML = icon;
      if (label) b.setAttribute("aria-label", label);
      return b;
    };

    const other = (level, key) => level && tell(say[key]);
    const passenger = (level) => {
      clearTimeout(timer);
      root.classList.toggle("warm", level > 0);
      root.style.setProperty("--heat", String(level / 3));
      if (level === target) {
        tell(cfg.varm ?? "Ahh… dejligt varmt 🔥", "ok");
        timer = setTimeout(win, 1600);
      } else if (level > 0) {
        tell(level < target ? "Lidt mere varme? 🔥" : "Næsten! 🔥", "warm");
      } else {
        tell("Hov, nu blev den slukket 🥶");
      }
    };

    // Left = driver, right = passenger (Danish cars).
    const grid = h("div", "car-grid");
    // 5 columns: driver's seat buttons | middle | passenger's seat buttons.
    grid.append(
      levelBtn(svg(SEAT + WAVES), "heat", "fører", other),
      plain(svg(WHEEL), "rat", "Rattvarme"),
      plain(`<span class="car-txt">A/C</span>`, "ac", "A/C"),
      plain(svg(FRONT), "for", "Forrude"),
      levelBtn(svg(SEAT + AIR, "flip"), "cool", "køl", other),
      levelBtn(svg(SEAT + AIR), "cool", "førerkøl", other),
      plain(`<span class="car-txt">AUTO</span>`, "auto", "Auto"),
      plain(svg(RECIRC), "luft", "Recirkulation"),
      plain(svg(REAR), "bag", "Bagrude"),
      levelBtn(svg(SEAT + WAVES, "flip"), "heat", "passager", passenger),
    );

    function win() {
      grid.classList.add("locked");
      beep(1047, 90);
      setTimeout(() => beep(1568, 160), 110);
      navigator.vibrate?.([40, 50, 120]);
      root.classList.add("won");
      setTimeout(done, 1600);
    }

    const seats = h("div", "car-seats");
    seats.append(h("span", "car-seat", "Fører"), h("span", "car-seat passenger", "Dig"));
    wrap.append(screen, grid, seats);
    return wrap;
  }

  return { el: root };
}
