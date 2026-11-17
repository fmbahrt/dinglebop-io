// Step "gus": a little cartoon in the sauna with gus master Brian (tall, slim,
// a very small tartan kilt as swimming trunks). Three rounds, each harder, with
// a cold dip in between:
//   1. "rytme"      – tap VIFT! when the ring lands (slag, takt)
//   2. "duft"       – repeat the order of the scents Brian pours (fra → til long)
//   3. "helikopter" – circle your finger to spin the towel, keep the speed in the
//                     green zone for a while (sekunder)
//
//   { "type": "gus", "runder": [ { "type": "rytme", "slag": 8, "takt": 900 },
//       { "type": "duft", "fra": 3, "til": 5 }, { "type": "helikopter", "sekunder": 6 } ],
//     "replikker": { "hej": "…", … } }

import { h, button } from "/felles.js";
import { beep } from "/trin.js";

const LINES = {
  hej: "Velkommen til gus! Jeg hedder Brian 👋 I aften kører vi tre runder.",
  r1: "Runde 1: Is & ild 🔥❄️ Hjælp mig med at vifte! Tryk VIFT, når ringen rammer 👏",
  r2: "Runde 2: Dufte! Tobaksolie er min favorit 😍 Husk rækkefølgen 👃",
  r3: "Disturbed på! 🤘 Runde 3: Helikopter 🚁 Kør fingeren rundt – hold farten i det grønne!",
  øsninger: "Så er der kun 5 øsninger endnu 😏",
  pause: "Puha! Ud og køl af 🌊",
  ind: "Ind igen – nu bliver det varmere 🔥",
  varmt: "100 grader! I er seje 🔥",
  plask: "Og nu… sidste dukkert! 🌊",
  tak: "Det var gus! Tak for i aften 👋",
};
const DEFAULT_ROUNDS = [
  { type: "rytme", slag: 8, takt: 900 },
  { type: "duft", fra: 3, til: 5 },
  { type: "helikopter", sekunder: 6 },
];
const SCENTS = [
  { emoji: "🌿", navn: "Eukalyptus", tone: 523 },
  { emoji: "🍋", navn: "Citrus", tone: 659 },
  { emoji: "🍯", navn: "Honning", tone: 784 },
  { emoji: "🍂", navn: "Tobak", tone: 988 },
];

const BRIAN = `
<g class="g-brian">
  <defs>
    <pattern id="tartan" width="8" height="8" patternUnits="userSpaceOnUse">
      <rect width="8" height="8" fill="#b3202c"/>
      <rect x="0" y="3" width="8" height="2" fill="#1d4d2b" opacity=".9"/>
      <rect x="3" y="0" width="2" height="8" fill="#1d4d2b" opacity=".9"/>
      <rect x="0" y="6.5" width="8" height=".8" fill="#f2d14a" opacity=".8"/>
      <rect x="6.5" y="0" width=".8" height="8" fill="#f2d14a" opacity=".8"/>
    </pattern>
  </defs>
  <!-- legs: long and thin -->
  <path d="M52 178 L50 268 M66 178 L68 268" stroke="#f0c39e" stroke-width="8" stroke-linecap="round"/>
  <path d="M44 270 h10 M64 270 h12" stroke="#e8b48c" stroke-width="5" stroke-linecap="round"/>
  <!-- torso -->
  <path d="M44 74 C42 110 44 150 46 176 L72 176 C74 150 76 110 74 74 C68 68 50 68 44 74z" fill="#f4caa6"/>
  <path d="M52 100 q7 4 14 0" stroke="#e2a985" stroke-width="1.5" fill="none"/>
  <!-- the very small tartan kilt -->
  <path d="M44 166 L74 166 L79 184 L39 184z" fill="url(#tartan)" stroke="#5b1016" stroke-width="1"/>
  <path d="M47 166 v18 M53 166 v18 M59 166 v18 M65 166 v18 M71 166 v18" stroke="rgba(0,0,0,.18)" stroke-width="1"/>
  <rect x="43" y="163" width="32" height="4" rx="1" fill="#2a1a10"/>
  <!-- left arm -->
  <path d="M45 80 C36 104 34 128 38 148" stroke="#f0c39e" stroke-width="7" stroke-linecap="round" fill="none"/>
  <!-- right arm + towel (twirls around the hand) -->
  <path d="M73 80 C88 76 98 64 102 50" stroke="#f0c39e" stroke-width="7" stroke-linecap="round" fill="none"/>
  <g class="g-towel" style="transform-origin:102px 48px">
    <path d="M100 48 C110 30 132 26 140 36 C132 44 116 46 104 52z" fill="#fbfbf7" stroke="#d9d6cc" stroke-width="1.5"/>
    <path d="M112 40 C120 34 128 33 134 36" stroke="#d9d6cc" stroke-width="1.2" fill="none"/>
  </g>
  <!-- head -->
  <rect x="54" y="56" width="10" height="14" fill="#f0c39e"/>
  <ellipse cx="59" cy="40" rx="15" ry="18" fill="#f4caa6"/>
  <path d="M44 36 C44 20 72 18 74 34 C68 28 52 28 44 36z" fill="#6b4a2e"/>
  <circle cx="53" cy="41" r="2" fill="#2a1a10"/><circle cx="65" cy="41" r="2" fill="#2a1a10"/>
  <path d="M52 50 q7 6 14 0" stroke="#7a3b2b" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M45 46 q-3 0 -3 -4" stroke="#e2a985" stroke-width="1.5" fill="none"/>
</g>`;

const SAUNA = `
<svg class="g-svg" viewBox="0 0 360 260" aria-hidden="true">
  <defs>
    <pattern id="planks" width="24" height="260" patternUnits="userSpaceOnUse">
      <rect width="24" height="260" fill="#b98353"/><rect x="22" width="2" height="260" fill="#8f5f36"/>
      <rect x="8" y="40" width="3" height="5" rx="1.5" fill="#a06d3f"/><rect x="14" y="170" width="3" height="6" rx="1.5" fill="#a06d3f"/>
    </pattern>
    <radialGradient id="glow"><stop offset="0" stop-color="#ff9a3d" stop-opacity=".55"/><stop offset="1" stop-color="#ff9a3d" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="360" height="260" fill="url(#planks)"/>
  <rect y="226" width="360" height="34" fill="#7a5130"/>
  <!-- benches + the two of us -->
  <rect x="226" y="150" width="134" height="12" fill="#d29a62"/><rect x="226" y="162" width="134" height="64" fill="#a8723f"/>
  <rect x="200" y="196" width="160" height="10" fill="#d29a62"/>
  <g class="g-us" transform="translate(24 0)">
    <circle cx="262" cy="118" r="11" fill="#f1c7a1"/><path d="M250 150 q12 -26 24 0z" fill="#e9e4d8"/><path d="M252 112 q10 -12 20 0 q-2 -8 -10 -9 q-8 1 -10 9z" fill="#8a5a33"/>
    <circle cx="306" cy="116" r="12" fill="#f4caa6"/><path d="M293 150 q13 -28 26 0z" fill="#dfe9f1"/><path d="M294 112 q12 -14 24 0 q-2 -10 -12 -10 q-10 0 -12 10z" fill="#6b4a2e"/>
    <text x="262" y="100" class="g-us-label">dig</text><text x="306" y="98" class="g-us-label">mig</text>
  </g>
  <!-- stove, stones, bucket -->
  <circle cx="58" cy="176" r="70" fill="url(#glow)" class="g-glow"/>
  <rect x="22" y="160" width="72" height="66" rx="6" fill="#3b3f46"/><rect x="28" y="168" width="60" height="6" fill="#2a2d32"/>
  <g fill="#6f747c"><circle cx="34" cy="158" r="9"/><circle cx="50" cy="153" r="10"/><circle cx="67" cy="155" r="9"/><circle cx="83" cy="158" r="8"/><circle cx="42" cy="146" r="7"/><circle cx="60" cy="143" r="8"/><circle cx="76" cy="146" r="7"/></g>
  <path d="M112 212 h26 l-3 14 h-20z" fill="#8a5a33"/><path d="M110 210 h30" stroke="#5b3a20" stroke-width="3"/>
  <!-- steam -->
  <g class="g-steam"><ellipse cx="44" cy="124" rx="16" ry="10"/><ellipse cx="64" cy="112" rx="20" ry="12"/><ellipse cx="80" cy="128" rx="14" ry="9"/><ellipse cx="56" cy="96" rx="24" ry="14"/></g>
  <!-- thermometer -->
  <g transform="translate(316 22)"><rect width="34" height="60" rx="6" fill="#efe6d6" stroke="#8f5f36" stroke-width="2"/><text x="17" y="22" class="g-temp-label">°C</text><text x="17" y="46" class="g-temp">80</text></g>
  <g class="g-brian-pos">${BRIAN}</g>
</svg>`;

export default function gus(cfg, { done }) {
  const say = { ...LINES, ...(cfg.replikker ?? {}) };
  const rounds = cfg.runder ?? DEFAULT_ROUNDS;

  const root = h("div", "app gus");
  const stage = h("div", "g-stage");
  stage.innerHTML = SAUNA;
  const svg = stage.querySelector("svg");
  const temp = svg.querySelector(".g-temp");
  const towel = svg.querySelector(".g-towel");
  const bubble = h("p", "g-bubble");
  const caption = h("p", "g-caption", cfg.titel ?? "Søndag aften · Innercise 🧖");
  const roundTag = h("p", "g-round");
  const splash = h("div", "g-splash", "PLASK! 🌊🥶");
  stage.append(caption, roundTag, bubble, splash);
  const controls = h("div", "g-controls");
  root.append(stage, controls);

  const setTemp = (d) => {
    temp.textContent = String(Math.round(d));
    stage.style.setProperty("--heat", String(Math.max(0, (d - 80) / 20)));
  };
  let shown = 80;
  const warmTo = (d) => {
    const from = shown;
    shown = d;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / 900);
      setTemp(from + (d - from) * p);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const talk = (text) => {
    bubble.classList.remove("on");
    void bubble.offsetWidth;
    bubble.textContent = text;
    bubble.classList.add("on");
  };
  const next = (label, fn) => controls.replaceChildren(button(label, "btn g-next", fn));
  const twirl = () => {
    svg.classList.remove("twirl");
    void svg.getBoundingClientRect();
    svg.classList.add("twirl");
  };
  const steam = () => {
    stage.classList.remove("steam");
    void stage.offsetWidth;
    stage.classList.add("steam");
  };
  const chime = () => {
    beep(1047, 90);
    setTimeout(() => beep(1568, 160), 110);
  };
  // Temperature after each round: 80 → … → 100.
  const tempAfter = (i) => 80 + (20 * (i + 1)) / rounds.length;

  // ---- the film
  function intro() {
    stage.classList.add("enter");
    setTimeout(() => talk(say.hej), 900);
    setTimeout(() => next("Næste ▶", () => round(0)), 1400);
  }

  function round(i) {
    const r = rounds[i];
    roundTag.textContent = `Runde ${i + 1} af ${rounds.length}`;
    roundTag.classList.add("on");
    talk(say[`r${i + 1}`] ?? say.r1);
    beep(160, 400);
    steam();
    warmTo(tempAfter(i) - 20 / rounds.length / 2);
    const game = { rytme, duft, helikopter }[r.type] ?? rytme;
    next("Klar! ▶", () => game(r, () => roundDone(i)));
  }

  function roundDone(i) {
    chime();
    warmTo(tempAfter(i));
    if (i === rounds.length - 1) return finale();
    talk(say.pause);
    next("Kold dukkert 🌊", () => {
      dip(() => {
        talk(say.ind);
        next("Ind i saunaen ▶", () => round(i + 1));
      });
    });
  }

  function dip(then) {
    controls.replaceChildren();
    stage.classList.add("splash");
    beep(300, 80);
    navigator.vibrate?.([60, 40, 160]);
    setTimeout(() => {
      stage.classList.remove("splash");
      then();
    }, 1600);
  }

  function finale() {
    stage.classList.remove("metal");
    stage.classList.add("hot");
    talk(say.varmt);
    next("Næste ▶", () => {
      talk(say.plask);
      controls.replaceChildren();
      setTimeout(() => dip(() => {
        talk(say.tak);
        roundTag.classList.remove("on");
        next("Videre ✓", done);
      }), 900);
    });
  }

  // ---- round type 1: tap when the shrinking ring meets the button
  function rytme(r, finish) {
    const beats = Number(r.slag ?? 8);
    const period = Number(r.takt ?? 900);
    const wrap = h("div", "g-game");
    const pad = button("", "g-pad");
    const ring = h("span", "g-ring");
    pad.append(ring, h("span", "g-pad-label", "VIFT!"));
    const judge = h("p", "g-judge", " ");
    const meter = h("div", "g-meter");
    const fill = h("div", "g-meter-fill");
    meter.append(fill);
    const count = h("p", "g-count", `0 / ${beats}`);
    wrap.append(meter, pad, judge, count);
    controls.replaceChildren(wrap);

    let hits = 0;
    const start = performance.now() + 700;
    let lastJudged = -1;
    let running = true;
    const WINDOW = 190;
    const beatAt = (n) => start + n * period;
    const show = (text, kind) => {
      judge.textContent = text;
      judge.className = `g-judge ${kind}`;
    };

    const loop = (now) => {
      if (!running) return;
      requestAnimationFrame(loop);
      const n = Math.ceil((now - start) / period);
      const p = 1 - (beatAt(n) - now) / period;
      ring.style.transform = `scale(${2.4 - 1.4 * Math.max(0, Math.min(1, p))})`;
      ring.style.opacity = String(0.35 + 0.65 * Math.max(0, Math.min(1, p)));
      const passed = Math.floor((now - start - WINDOW) / period);
      if (passed > lastJudged && passed >= 0) {
        lastJudged = passed;
        show("Hov! 💨", "miss");
      }
    };
    requestAnimationFrame(loop);

    pad.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (!running) return;
      const now = performance.now();
      const n = Math.round((now - start) / period);
      const off = now - beatAt(n);
      if (n < 0 || n <= lastJudged || Math.abs(off) > WINDOW) {
        beep(180, 60);
        show(off < 0 ? "For tidligt!" : "For sent!", "miss");
        return;
      }
      lastJudged = n;
      hits++;
      const perfect = Math.abs(off) < 90;
      show(perfect ? "Perfekt! 🔥" : "Godt! 👍", "hit");
      beep(perfect ? 1175 : 880, 60);
      navigator.vibrate?.(15);
      twirl();
      count.textContent = `${hits} / ${beats}`;
      if (hits === beats - 2) talk(say.øsninger);
      fill.style.width = `${(hits / beats) * 100}%`;
      if (hits >= beats) {
        running = false;
        ring.style.opacity = "0";
        setTimeout(finish, 600);
      }
    });
  }

  // ---- round type 2: Simon says, with scents
  function duft(r, finish) {
    const from = Number(r.fra ?? 3), to = Number(r.til ?? 5);
    const wrap = h("div", "g-game");
    const status = h("p", "g-judge", " ");
    const grid = h("div", "g-scents");
    const level = h("p", "g-count");
    const pads = SCENTS.map((sc, i) => {
      const b = button("", "g-scent", () => press(i));
      b.append(h("span", "g-scent-emoji", sc.emoji), h("span", "g-scent-name", sc.navn));
      grid.append(b);
      return b;
    });
    wrap.append(status, grid, level);
    controls.replaceChildren(wrap);

    let seq = [];
    let pos = 0;
    let len = from;
    let listening = false;
    const random = () => (Math.random() * SCENTS.length) | 0;
    const light = (i, ms = 520) => {
      pads[i].classList.add("lit");
      beep(SCENTS[i].tone, Math.min(ms, 300));
      setTimeout(() => pads[i].classList.remove("lit"), ms);
    };

    function play() {
      listening = false;
      grid.classList.add("watch");
      status.className = "g-judge";
      status.textContent = "Brian hælder… 👀";
      level.textContent = `${len} dufte · mål: ${to}`;
      seq.forEach((i, k) => setTimeout(() => {
        light(i);
        steam();
      }, 700 + k * 750));
      setTimeout(() => {
        grid.classList.remove("watch");
        listening = true;
        pos = 0;
        status.textContent = "Din tur! 👃";
      }, 700 + seq.length * 750);
    }
    function press(i) {
      if (!listening) return;
      light(i, 220);
      if (i !== seq[pos]) {
        listening = false;
        navigator.vibrate?.(150);
        beep(160, 250);
        status.className = "g-judge miss";
        status.textContent = "Næh! Den lugtede forkert 🤢 Igen…";
        setTimeout(play, 1300);
        return;
      }
      pos++;
      if (pos < seq.length) return;
      listening = false;
      twirl();
      if (len >= to) {
        status.className = "g-judge hit";
        status.textContent = "Perfekt næse! 👃✨";
        setTimeout(finish, 900);
        return;
      }
      status.className = "g-judge hit";
      status.textContent = "Rigtigt! En til… 🔥";
      len++;
      seq.push(random());
      if (len === to) talk(say.øsninger);
      setTimeout(play, 1100);
    }

    seq = Array.from({ length: from }, random);
    play();
  }

  // ---- round type 3: spin the towel by circling a finger; stay in the zone
  function helikopter(r, finish) {
    metal();
    const need = Number(r.sekunder ?? 6) * 1000;
    const LOW = Number(r.min ?? 400), HIGH = Number(r.max ?? 1100); // degrees per second
    const wrap = h("div", "g-game");
    const status = h("p", "g-judge", "Kør fingeren rundt 🔄");
    const dial = h("div", "g-dial");
    const dot = h("span", "g-dial-dot");
    dial.append(h("span", "g-dial-track"), dot, h("span", "g-dial-label", "🔄"));
    const gauge = h("div", "g-speed");
    const needle = h("span", "g-speed-needle");
    gauge.append(h("span", "g-speed-zone"), needle);
    const meter = h("div", "g-meter");
    const fill = h("div", "g-meter-fill");
    meter.append(fill);
    wrap.append(gauge, dial, status, meter);
    controls.replaceChildren(wrap);

    let speed = 0; // smoothed °/s
    let angle = 0; // towel angle
    let last = null; // { a, t }
    let inZone = 0;
    let joked = false;
    let running = true;
    let prev = performance.now();

    dial.addEventListener("pointerdown", (e) => {
      dial.setPointerCapture(e.pointerId);
      last = null;
    });
    dial.addEventListener("pointermove", (e) => {
      if (!running || !(e.buttons || e.pointerType === "touch")) return;
      const rect = dial.getBoundingClientRect();
      const a = (Math.atan2(e.clientY - (rect.top + rect.height / 2), e.clientX - (rect.left + rect.width / 2)) * 180) / Math.PI;
      dot.style.transform = `rotate(${a}deg) translateX(var(--rad))`;
      const now = performance.now();
      if (last) {
        let d = a - last.a;
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        const dt = Math.max(1, now - last.t) / 1000;
        const inst = Math.abs(d) / dt;
        speed += (Math.min(inst, 3000) - speed) * 0.25;
        angle += d;
      }
      last = { a, t: now };
    });
    const release = () => { last = null; };
    dial.addEventListener("pointerup", release);
    dial.addEventListener("pointercancel", release);

    const loop = (now) => {
      if (!running) return;
      requestAnimationFrame(loop);
      const dt = now - prev;
      prev = now;
      speed *= Math.pow(0.5, dt / 450); // slows down when you stop
      towel.style.transform = `rotate(${angle * 2}deg)`;
      needle.style.left = `${Math.min(100, (speed / 1600) * 100)}%`;
      const zone = speed >= LOW && speed <= HIGH;
      gauge.classList.toggle("ok", zone);
      if (zone) {
        inZone += dt;
        status.className = "g-judge hit";
        status.textContent = "Perfekt helikopter! 🚁";
      } else if (speed < LOW) {
        status.className = "g-judge";
        status.textContent = speed < 60 ? "Kør fingeren rundt 🔄" : "Det er jo bare en brise 😴";
      } else {
        status.className = "g-judge miss";
        status.textContent = "Rolig, du blæser mig omkuld 😱";
      }
      fill.style.width = `${Math.min(100, (inZone / need) * 100)}%`;
      if (!joked && inZone >= need * 0.6) {
        joked = true;
        talk(say.øsninger);
      }
      if (inZone >= need) {
        running = false;
        towel.style.transform = "";
        setTimeout(finish, 500);
      }
    };
    requestAnimationFrame(loop);
  }

  // Brian puts on Disturbed: a speaker, a chugging riff (beeps), headbanging.
  function metal() {
    stage.classList.add("metal");
    const riff = [82, 82, 98, 82, 110, 82, 123, 117, 82, 82, 98, 82, 147, 139, 123, 110];
    riff.forEach((f, i) => setTimeout(() => beep(f, 110), i * 150));
  }
  const speaker = h("div", "g-speaker");
  speaker.append(h("span", "g-speaker-box", "🔊"), h("span", "g-note n1", "🎸"), h("span", "g-note n2", "🤘"), h("span", "g-note n3", "🎵"));
  stage.append(speaker);

  setTemp(80);
  intro();
  return { el: root };
}
