// Step "bil": the car on the drive home. First plug her phone in (usb.js, CarPlay;
// "telefon": false skips it). Turn the key, then in any order: play
// the right song on Spotify and route to her address in Google Maps (both in a
// CarPlay-like screen), and turn on her seat heating. Then we drive.
//
//   { "type": "bil", "bil": "Opel Corsa",
//     "spotify":    { …a "spotify" step… },
//     "kort":       { "adresse": "Farumgade 11", "by": "2200 København N", "tid": "18 min", "afstand": "9,4 km",
//                     "forslag": [ { "adresse": "Farum Hovedgade 11", "by": "3520 Farum", "nej": "…" } ],
//                     "hjem": "Det er MIT hjem 😄" },
//     "saedevarme": { …a "saedevarme" step… } }

import { h, button, shake } from "/felles.js";
import { beep } from "/trin.js";
import spotify from "/spotify.js";
import saedevarme from "/saedevarme.js";
import { driveScene } from "/koretur.js";
import { usbPhone } from "/usb.js";

const fold = (s) => String(s ?? "").toLocaleLowerCase("da").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9æøå]+/g, " ").trim();
// What has to be done before we can drive. Only the count is shown, she has
// to find out what they are herself.
const TASKS = ["noegle", "musik", "rute", "varme"];

export default function bil(cfg, ctx) {
  const root = h("div", "app bil");
  const done = new Set();

  // ---- checklist
  const list = h("div", "bil-tasks");
  const dots = h("ol", "bil-dots");
  const count = h("p", "bil-count");
  list.append(dots, count);
  const drawList = () => {
    dots.replaceChildren(...TASKS.map((t, i) => h("li", i < done.size ? (i === done.size - 1 ? "done new" : "done") : "", i < done.size ? "✓" : "")));
    count.textContent = `${done.size} af ${TASKS.length} ting klaret`;
  };
  drawList();

  // ---- instrument cluster
  const cluster = h("div", "bil-cluster");
  const gauge = (label, cls) => {
    const g = h("div", `bil-gauge ${cls}`);
    g.append(h("span", "bil-needle"), h("span", "bil-gauge-label", label));
    return g;
  };
  const speed = gauge("km/t", "speed");
  const rpm = gauge("×1000", "rpm");
  const mid = h("div", "bil-mid");
  const lights = h("div", "bil-lights");
  lights.append(h("span", "bil-light red", "🔋"), h("span", "bil-light red", "🛢️"), h("span", "bil-light amber", "⚙️"));
  const midText = h("p", "bil-midtext", cfg.bil ?? "Opel Corsa");
  mid.append(lights, midText);
  cluster.append(speed, mid, rpm);

  // ---- ignition
  const ignition = h("div", "bil-ign");
  const lock = h("div", "bil-lock");
  for (const [mark, deg] of [["0", -40], ["I", 0], ["II", 40], ["III", 80]]) {
    const m = h("span", "bil-mark", mark);
    m.style.setProperty("--a", `${deg}deg`);
    lock.append(m);
  }
  const key = h("div", "bil-key");
  key.append(h("span", "bil-key-head"), h("span", "bil-key-blade"));
  lock.append(key);
  const ignText = h("p", "bil-ign-text", cfg.start ?? "Drej nøglen for at starte bilen 🔑");
  ignition.append(lock, ignText);

  // ---- CarPlay screen
  const carplay = h("div", "cp");
  const side = h("div", "cp-side");
  const clock = h("span", "cp-clock");
  const tick = () => {
    const d = new Date();
    clock.textContent = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  tick();
  setInterval(tick, 30_000);
  const homeBtn = button("", "cp-home", () => showHome());
  homeBtn.setAttribute("aria-label", "Hjem");
  homeBtn.innerHTML = `<span></span><span></span><span></span><span></span>`;
  side.append(clock, h("span", "cp-signal", "5G ▮▮▮"), homeBtn);
  const screen = h("div", "cp-screen");
  const toast = h("p", "cp-toast");
  carplay.append(side, screen, toast);
  let toastTimer = 0;
  const say = (text) => {
    toast.textContent = text;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
  };

  // Apps keep their state while you switch between them.
  let spotifyApp = null;
  let mapsApp = null;
  const APPS = [
    { name: "Spotify", cls: "spotify", open: () => (spotifyApp ??= spotify(cfg.spotify ?? {}, { slug: ctx.slug, embedded: true, onPlay: () => finish("musik", "Musikken kører 🎶") })).el },
    { name: "Google Maps", cls: "maps", open: () => (mapsApp ??= maps(cfg.kort ?? {}, { say, onRoute: () => finish("rute", "Ruten er klar 🗺️") })).el },
    { name: "Telefon", cls: "phone", icon: "📞", nope: "Ikke nu – du skal ikke ringe til nogen 😉" },
    { name: "Beskeder", cls: "msgs", icon: "💬", nope: "Ingen beskeder mens vi kører 😇" },
    { name: "Podcasts", cls: "pods", icon: "🎙️", nope: "Podcast? Nej, vi skal have musik 🎵" },
    { name: "Lydbøger", cls: "books", icon: "🎧", nope: "Ikke i aften 📚" },
    { name: "Kalender", cls: "cal", icon: "📅", nope: "I morgen er i morgen 😴" },
    { name: "Vejr", cls: "weather", icon: "❄️", nope: "Koldt. Derfor sædevarme 😉" },
  ];
  function showHome() {
    const grid = h("div", "cp-apps");
    for (const app of APPS) {
      const b = button("", `cp-app ${app.cls}`, () => {
        if (!app.open) return say(app.nope);
        screen.replaceChildren(app.open());
        screen.scrollTop = 0;
      });
      const icon = h("span", "cp-icon");
      if (app.cls === "spotify") icon.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.2c4-1.2 8.6-.8 12 1.2M6.6 12.4c3.3-.9 7-.5 9.8 1.1M7.3 15.4c2.6-.6 5.3-.3 7.5.9" fill="none" stroke="#000" stroke-width="1.9" stroke-linecap="round"/></svg>`;
      else if (app.cls === "maps") icon.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5a6.5 6.5 0 0 0-6.5 6.5c0 4.9 6.5 12.5 6.5 12.5s6.5-7.6 6.5-12.5A6.5 6.5 0 0 0 12 2.5z" fill="#ea4335"/><circle cx="12" cy="9" r="2.4" fill="#fff"/></svg>`;
      else icon.textContent = app.icon;
      b.append(icon, h("span", "cp-app-name", app.name));
      grid.append(b);
    }
    screen.replaceChildren(grid);
  }

  // ---- climate panel (seat heating)
  const climate = saedevarme(cfg.saedevarme ?? {}, { embedded: true, done: () => finish("varme", "Ahh, sædevarme 🔥") });

  // ---- dashboard layout; everything but the key is dark until the engine runs
  const dash = h("div", "bil-dash");
  dash.append(cluster, carplay, climate.el);
  const go = button(cfg.kør ?? "Kør hjem 🚗💨", "btn bil-go", drive);
  go.hidden = true;
  // First her phone has to be plugged in (CarPlay), then the dashboard fades in.
  const parts = [list, ignition, dash, go];
  if (cfg.telefon === false) root.append(...parts);
  else {
    // The phone stands on the page like on the other days (not inside the car app's styles).
    root.classList.add("usb-mode");
    root.classList.remove("app");
    root.append(usbPhone(cfg.telefon ?? {}, {
      bil: cfg.bil ?? "Opel Corsa",
      sms: cfg.sms ?? null,
      onConnected: () => {
        root.classList.remove("usb-mode");
        root.classList.add("app");
        root.replaceChildren(...parts);
        root.classList.add("arrive");
        root.scrollIntoView({ behavior: "smooth", block: "start" });
      },
    }).el);
  }

  // ---- turning the key: drag it round, or just tap it
  let angle = -40;
  let started = false;
  const setAngle = (a) => {
    angle = a;
    key.style.transform = `rotate(${a}deg)`;
  };
  setAngle(-40);
  let drag = null;
  lock.addEventListener("pointerdown", (e) => {
    if (started) return;
    lock.setPointerCapture(e.pointerId);
    const r = lock.getBoundingClientRect();
    drag = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, moved: false, a0: Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)), base: angle };
    key.classList.remove("spring");
  });
  lock.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const a = Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx);
    let d = ((a - drag.a0) * 180) / Math.PI;
    if (d < -180) d += 360;
    if (d > 180) d -= 360;
    if (Math.abs(d) > 4) drag.moved = true;
    setAngle(Math.max(-40, Math.min(80, drag.base + d)));
  });
  lock.addEventListener("pointerup", () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    if (!moved || angle >= 65) return crank();
    key.classList.add("spring");
    setAngle(-40);
  });

  function crank() {
    started = true;
    key.classList.add("spring");
    setAngle(80);
    navigator.vibrate?.([30, 40, 30, 40, 30, 40, 200]);
    [0, 120, 240, 360].forEach((t) => setTimeout(() => beep(110 + t / 6, 90), t));
    setTimeout(() => beep(220, 260), 520);
    setTimeout(() => {
      setAngle(40); // back to "II" once the engine runs
      root.classList.add("on");
      ignText.textContent = "Brrrum! 🚗";
      done.add("noegle");
      drawList();
      showHome();
      setTimeout(() => {
        ignition.classList.add("gone");
        root.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 1300);
    }, 800);
  }

  function finish(task, text) {
    if (done.has(task)) return;
    done.add(task);
    drawList();
    say(text);
    beep(1319, 80);
    if (TASKS.every((t) => done.has(t))) {
      go.hidden = false;
      setTimeout(() => go.scrollIntoView({ behavior: "smooth", block: "center" }), 600);
    }
  }

  function drive() {
    go.disabled = true;
    root.classList.add("driving");
    beep(196, 300);
    setTimeout(() => beep(262, 300), 250);
    navigator.vibrate?.([60, 40, 60, 40, 200]);
    go.textContent = "Vi kører! 🚗💨";
    // Out onto Strandvejen, past Fitness World.
    setTimeout(async () => {
      const scene = driveScene(cfg.tur ?? {});
      root.replaceChildren(scene.el);
      root.classList.add("scene");
      root.scrollIntoView({ behavior: "smooth", block: "center" });
      await scene.play();
      ctx.done();
    }, 1200);
  }

  return { el: root };
}

// ---------- Google Maps (CarPlay) ----------

function maps(cfg, { say, onRoute }) {
  const right = { adresse: cfg.adresse ?? "Farumgade 11", by: cfg.by ?? "2200 København N", rigtig: true };
  const places = [right, ...(cfg.forslag ?? [])];
  const el = h("div", "gm");
  const searchWrap = h("div", "gm-search");
  const input = h("input", "gm-input");
  Object.assign(input, { type: "search", placeholder: "Søg her", autocomplete: "off", spellcheck: false, enterKeyHint: "search" });
  input.setAttribute("aria-label", "Søg efter et sted");
  searchWrap.append(h("span", "gm-mag", "🔍"), input);
  const results = h("div", "gm-results");
  const map = h("div", "gm-map");
  map.innerHTML = MAP_SVG;
  el.append(map, searchWrap, results);

  const row = (icon, title, sub, onClick) => {
    const b = button("", "gm-row", onClick);
    b.append(h("span", "gm-row-icon", icon), h("span", "gm-row-text"));
    b.lastChild.append(h("span", "gm-row-title", title), h("span", "gm-row-sub", sub));
    return b;
  };
  function suggest() {
    const q = fold(input.value);
    if (!q) {
      results.replaceChildren(
        row("🏠", "Hjem", "Gemt", () => say(cfg.hjem ?? "Det er MIT hjem 😄 Hvor bor du?")),
        row("💼", "Arbejde", "Gemt", () => say("Arbejde? Nej, vi skal hjem 😴")),
        row("🕘", "Fitness World", "Seneste", () => say("Ikke i aften 💪")),
      );
      return;
    }
    const hits = places.filter((p) => fold(`${p.adresse} ${p.by}`).includes(q) || q.split(" ").every((w) => fold(`${p.adresse} ${p.by}`).includes(w)));
    results.replaceChildren(...(hits.length ? hits : []).slice(0, 5).map((p) => row("📍", p.adresse, p.by, () => pick(p))), ...(hits.length ? [] : [h("p", "gm-none", "Ingen resultater 🤷")]));
  }
  input.addEventListener("input", suggest);
  input.addEventListener("focus", suggest);
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const q = fold(input.value);
    const p = places.find((x) => fold(x.adresse) === q || fold(`${x.adresse} ${x.by}`) === q);
    if (p) pick(p);
    else shake(searchWrap);
  });
  suggest();

  function pick(p) {
    if (!p.rigtig) {
      navigator.vibrate?.(120);
      say(p.nej ?? "Bor du der? 🤔");
      return;
    }
    input.blur();
    // Route overview, then "Start" → navigation.
    map.classList.add("route");
    const card = h("div", "gm-card");
    const start = button("Start", "gm-start", () => {
      el.classList.add("nav");
      card.replaceChildren(h("p", "gm-eta", `${cfg.tid ?? "18 min"}`), h("p", "gm-eta-sub", `${cfg.afstand ?? "9,4 km"} · ankomst snart ❤️`));
      banner.hidden = false;
      onRoute();
    });
    card.append(h("p", "gm-eta", `${cfg.tid ?? "18 min"} (${cfg.afstand ?? "9,4 km"})`), h("p", "gm-eta-sub", `Hurtigste rute til ${p.adresse}`), start);
    const banner = h("div", "gm-banner");
    banner.append(h("span", "gm-arrow", "↑"), h("span", null, cfg.vej ?? `Mod ${p.adresse.replace(/\s*\d.*$/, "")}`));
    banner.hidden = true;
    searchWrap.replaceWith(banner);
    results.replaceWith(card);
  }

  return { el };
}

// A stylised night map: blocks, streets, a park and the lake.
const MAP_SVG = `<svg viewBox="0 0 300 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <rect width="300" height="200" fill="#1f2a36"/>
  <path d="M-10 150 C40 130 80 160 130 140 S220 110 310 130 L310 210 L-10 210z" fill="#18324a"/>
  <rect x="200" y="20" width="60" height="40" rx="6" fill="#1f3a2c"/>
  <g stroke="#3a4b5e" stroke-width="7" fill="none" stroke-linecap="round">
    <path d="M-10 60 L310 40"/><path d="M60 -10 L90 210"/><path d="M170 -10 L150 210"/><path d="M-10 110 L310 95"/><path d="M240 -10 L270 210"/>
  </g>
  <g stroke="#2d3b4b" stroke-width="3" fill="none"><path d="M-10 85 L310 70"/><path d="M120 -10 L125 210"/><path d="M20 -10 L35 210"/></g>
  <path class="gm-route" d="M40 185 L60 112 L150 100 L162 52 L228 44" fill="none" stroke="#4c8bf5" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <circle class="gm-me" cx="40" cy="185" r="7" fill="#4c8bf5" stroke="#fff" stroke-width="3"/>
  <g class="gm-pin" transform="translate(228 44)"><path d="M0 0c-7-10-11-15-11-20a11 11 0 0 1 22 0c0 5-4 10-11 20z" fill="#ea4335"/><circle cy="-20" r="4" fill="#fff"/></g>
</svg>`;
