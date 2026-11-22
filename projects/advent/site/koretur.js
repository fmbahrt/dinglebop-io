// A small 2D side-scrolling drive: our car along Strandvejen at night, the
// Øresund and Sweden's lights behind, street signs and lamps passing, until the
// destination appears and the car pulls over. Used at the end of "bil"
// (Fitness World) and by the "film" step (home, with singing).
//
//   driveScene({ farve: "#b9c2cc", skilte: ["Strandvejen", "Østerbro"],
//                boble: "Har jeg nogensinde fortalt…" }).play() → Promise
//
// Optional: "mål": "hus" (home instead of the gym, "hus": its sign),
// "køretid" (seconds at speed, default 3.2), "passagerer": true (driver and
// Finn in the windows), "noder": true (music notes out of the window) and
// "bobler": [{ "fra": "frederik" | "finn", "tekst": "…", "ved": seconds }]
// during the drive; "boble" (with "fra") is the last one, when the car stops.

import { h } from "/felles.js";

const SPEED = 420;       // px/s at cruising speed (foreground)
const CRUISE = 3.2;      // seconds at full speed before braking (default)
const BRAKE = 2.2;       // seconds to stop
const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

const LAMP = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="220" height="150" viewBox="0 0 220 150">
  <defs><radialGradient id="g"><stop offset="0" stop-color="#ffe7a8" stop-opacity=".7"/><stop offset="1" stop-color="#ffe7a8" stop-opacity="0"/></radialGradient></defs>
  <circle cx="40" cy="22" r="26" fill="url(#g)"/>
  <rect x="28" y="20" width="3" height="130" fill="#2b2f36"/>
  <path d="M29 22 q4 -10 14 -6" stroke="#2b2f36" stroke-width="3" fill="none"/>
  <rect x="38" y="18" width="10" height="5" rx="2" fill="#ffe7a8"/></svg>`);
const TREES = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="120" viewBox="0 0 300 120">
  <g fill="#10241c"><ellipse cx="60" cy="58" rx="34" ry="40"/><rect x="57" y="80" width="6" height="40"/>
  <ellipse cx="200" cy="66" rx="26" ry="32"/><rect x="197" y="86" width="5" height="34"/>
  <ellipse cx="248" cy="72" rx="20" ry="26"/></g></svg>`);
const SWEDEN = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="30" viewBox="0 0 400 30">
  <path d="M0 22 Q60 14 120 20 T260 18 T400 22 V30 H0z" fill="#0d1a2b"/>
  <g fill="#ffd98a"><circle cx="30" cy="19" r="1.2"/><circle cx="58" cy="18" r="1"/><circle cx="96" cy="19" r="1.3"/><circle cx="150" cy="18" r="1"/>
  <circle cx="190" cy="17" r="1.2"/><circle cx="236" cy="18" r="1"/><circle cx="300" cy="19" r="1.3"/><circle cx="352" cy="20" r="1"/></g></svg>`);

function carSvg(color) {
  return `<svg viewBox="0 0 220 90" aria-hidden="true">
  <defs><linearGradient id="beam" x1="0" x2="1"><stop offset="0" stop-color="#fff6c8" stop-opacity=".55"/><stop offset="1" stop-color="#fff6c8" stop-opacity="0"/></linearGradient></defs>
  <path d="M206 50 L330 34 L330 80 L206 62z" fill="url(#beam)" transform="translate(-10 0)"/>
  <path d="M14 62 C12 48 18 40 34 38 L62 36 C76 18 92 12 124 12 C150 12 162 20 178 36 L198 40 C208 42 212 50 212 60 L212 66 C212 70 209 72 205 72 L18 72 C15 72 14 68 14 62z" fill="${color}"/>
  <path d="M70 36 C82 22 96 18 120 18 L122 36z" fill="#9fc4e6" opacity=".85"/>
  <path d="M128 18 C148 18 158 24 170 36 L130 36z" fill="#9fc4e6" opacity=".85"/>
  <path d="M30 50 H200" stroke="rgba(0,0,0,.18)" stroke-width="2"/>
  <rect x="200" y="46" width="12" height="7" rx="3" fill="#fff6c8"/>
  <rect x="14" y="46" width="8" height="7" rx="2" fill="#e0322b"/>
  <g class="kt-wheel" style="transform-origin:58px 70px"><circle cx="58" cy="70" r="15" fill="#111"/><circle cx="58" cy="70" r="7" fill="#9aa3ad"/><path d="M58 63v14M51 70h14" stroke="#555" stroke-width="2"/></g>
  <g class="kt-wheel" style="transform-origin:170px 70px"><circle cx="170" cy="70" r="15" fill="#111"/><circle cx="170" cy="70" r="7" fill="#9aa3ad"/><path d="M170 63v14M163 70h14" stroke="#555" stroke-width="2"/></g>
</svg>`;
}

export function driveScene(cfg = {}) {
  const el = h("div", "kt");
  const layers = {
    sweden: h("div", "kt-layer kt-sweden"),
    sea: h("div", "kt-layer kt-sea"),
    trees: h("div", "kt-layer kt-trees"),
    lamps: h("div", "kt-layer kt-lamps"),
    road: h("div", "kt-layer kt-road"),
  };
  layers.sweden.style.backgroundImage = SWEDEN;
  layers.trees.style.backgroundImage = TREES;
  layers.lamps.style.backgroundImage = LAMP;

  const signs = (cfg.skilte ?? ["Strandvejen", "Østerbro"]).map((text, i) => {
    const s = h("div", "kt-sign");
    s.append(h("span", "kt-sign-plate", text), h("span", "kt-sign-pole"));
    s.dataset.at = String(260 + i * 620); // where along the drive it stands (px)
    return s;
  });

  // Where we're going: the gym, or home (a house with a locked back door).
  let gym;
  if (cfg.mål === "hus") {
    gym = h("div", "kt-house");
    const roof = h("div", "kt-house-roof");
    const wall = h("div", "kt-house-wall");
    const wins = h("div", "kt-house-windows");
    for (const e of ["🎄", "🕯️"]) wins.append(h("span", null, e));
    const door = h("div", "kt-house-door");
    door.append(h("span", "kt-house-wreath", "🎶"), h("span", "kt-house-lock", "🔒"));
    wall.append(wins, door);
    gym.append(roof, h("div", "kt-house-sign", cfg.hus ?? "HJEM 🏠"), wall);
  } else {
    gym = h("div", "kt-gym");
    const gymSign = h("div", "kt-gym-sign", cfg.gym ?? "FITNESS WORLD");
    const windows = h("div", "kt-gym-windows");
    for (const e of ["🏋️", "🏃", "🚴", "🏋️‍♀️"]) windows.append(h("span", null, e));
    gym.append(gymSign, windows);
  }

  const car = h("div", "kt-car");
  car.innerHTML = carSvg(cfg.farve ?? "#b9c2cc");
  if (cfg.passagerer) car.append(h("span", "kt-driver", cfg.fører ?? "🧑"), h("span", "kt-finn", "🐶"));
  const bubble = h("p", "kt-bubble", cfg.boble ?? "Har jeg nogensinde fortalt, hvem jeg har trænet med derinde? 😏");
  const speak = (who, text) => {
    bubble.textContent = text;
    bubble.classList.toggle("finn", who === "finn");
    bubble.classList.remove("show");
    void bubble.offsetWidth;
    bubble.classList.add("show");
  };
  const cruise = Number(cfg.køretid ?? CRUISE);
  const said = new Set();
  let lastNote = 0;
  const note = () => {
    const n = h("span", "kt-note", ["🎵", "🎶", "🎵", "🎼"][(Math.random() * 4) | 0]);
    n.style.setProperty("--dx", `${(Math.random() * 40 + 10).toFixed(0)}px`);
    el.append(n);
    setTimeout(() => n.remove(), 2200);
  };

  el.append(layers.sweden, layers.sea, layers.trees, ...signs, gym, layers.lamps, layers.road, car, bubble);

  function play() {
    return new Promise((resolve) => {
      const total = SPEED * (cruise + BRAKE / 2); // distance travelled until stopped
      const t0 = performance.now();
      el.classList.add("moving");
      const step = (now) => {
        const t = (now - t0) / 1000;
        // Constant speed, then a smooth stop (v falls linearly to 0).
        const tb = Math.min(Math.max(t - cruise, 0), BRAKE);
        const d = SPEED * Math.min(t, cruise) + SPEED * (tb - (tb * tb) / (2 * BRAKE));
        const v = t < cruise ? 1 : 1 - tb / BRAKE;
        // Speech bubbles on the way, and music notes out of the window.
        (cfg.bobler ?? []).forEach((b, i) => {
          if (t >= Number(b.ved ?? 0) && !said.has(i)) { said.add(i); speak(b.fra, b.tekst); }
        });
        if (cfg.noder && v > 0.2 && now - lastNote > 380) { lastNote = now; note(); }
        layers.sweden.style.backgroundPositionX = `${-d * 0.04}px`;
        layers.sea.style.backgroundPositionX = `${-d * 0.1}px`;
        layers.trees.style.backgroundPositionX = `${-d * 0.45}px`;
        layers.lamps.style.backgroundPositionX = `${-d * 0.8}px`;
        layers.road.style.backgroundPositionX = `${-d}px`;
        const w = el.clientWidth;
        for (const s of signs) s.style.transform = `translateX(${w + Number(s.dataset.at) - d * 0.8}px)`;
        // The gym arrives so that it ends up just right of the car when we stop.
        gym.style.transform = `translateX(${w * 0.3 + (total - d) * 0.8}px)`;
        el.style.setProperty("--spin", `${(d / 47) * 57.3}deg`);
        car.style.setProperty("--bob", v > 0.05 ? `${Math.sin(t * 22) * 0.8}px` : "0px");
        if (t < cruise + BRAKE) return requestAnimationFrame(step);
        el.classList.remove("moving");
        if (cfg.bobler) speak(cfg.fra ?? "finn", cfg.boble ?? "");
        el.classList.add("stopped");
        setTimeout(resolve, 3200);
      };
      requestAnimationFrame(step);
    });
  }

  return { el, play };
}
