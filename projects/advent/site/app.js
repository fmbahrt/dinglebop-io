// Advent calendar client.
//
// Each week lives in its own folder with a random name, e.g. site/1-Xk3.../
// containing brev.txt and any photos. The URL is advent.dinglebop.io/<folder>;
// the leading digit is the week number.

import { holdButton, runHint } from "/hints.js";

const SUNDAYS = [
  { date: "2026-11-29", label: "29. november" },
  { date: "2026-12-06", label: "6. december" },
  { date: "2026-12-13", label: "13. december" },
  { date: "2026-12-20", label: "20. december" },
];

const $ = (sel) => document.querySelector(sel);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const IMAGE = /^[\w.-]+\.(jpe?g|png|webp|gif)$/i;

async function loadWeek(slug) {
  const [brev, opgave] = await Promise.all([
    fetch(`/${slug}/brev.txt`, { cache: "no-cache" }),
    fetch(`/${slug}/opgave.json`, { cache: "no-cache" }),
  ]);
  if (!brev.ok) throw new Error("not found");
  const [title, ...rest] = (await brev.text()).replace(/\r\n/g, "\n").trim().split("\n");
  return {
    week: Number(slug[0]),
    slug,
    title: title.trim(),
    body: rest.join("\n").trim(),
    opgave: opgave.ok ? await opgave.json() : null,
  };
}

// Optional weekly task (site/<uge>/opgave.json), rendered under the letter.
const TASKS = {
  stregkode: async (opgave, data) => (await import("/stregkode.js")).stregkodeOpgave(opgave, data),
  kryds: async (opgave, data) => (await import("/kryds.js")).krydsOpgave(opgave, data),
  svar: async (opgave, data) => (await import("/svar.js")).svarOpgave(opgave, data),
  bestilling: async (opgave, data) => (await import("/bestilling.js")).bestillingOpgave(opgave, data),
  ansigter: async (opgave, data) => (await import("/ansigter.js")).ansigterOpgave(opgave, data),
};

async function buildTask(data) {
  const make = TASKS[data.opgave?.type];
  return make ? make(data.opgave, data) : null;
}

// ---------- dates ----------

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** How many advent Sundays have arrived (0-4). */
function sundaysReached() {
  const today = todayISO();
  return SUNDAYS.filter((s) => s.date <= today).length;
}

// ---------- wreath ----------

const NS = "http://www.w3.org/2000/svg";

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.appendChild(e);
  return e;
}

function rng(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const GREENS = ["#1a3f2b", "#1f4d33", "#2b5e3e", "#356f47", "#3f7a4f"];

function drawWreath(lit, { animate = false } = {}) {
  const svg = el("svg", { viewBox: "0 0 320 215", role: "img", "aria-label": `Adventskrans med ${lit} tændte lys` });

  const defs = el("defs", {}, svg);
  const glow = el("radialGradient", { id: "g-glow" }, defs);
  el("stop", { offset: "0", "stop-color": "#ffd88a", "stop-opacity": ".55" }, glow);
  el("stop", { offset: "1", "stop-color": "#ffb347", "stop-opacity": "0" }, glow);
  const flame = el("linearGradient", { id: "g-flame", x1: "0", y1: "1", x2: "0", y2: "0" }, defs);
  el("stop", { offset: "0", "stop-color": "#fff3c4" }, flame);
  el("stop", { offset: ".45", "stop-color": "#ffc24d" }, flame);
  el("stop", { offset: "1", "stop-color": "#ff7a1a" }, flame);
  const wax = el("linearGradient", { id: "g-wax", x1: "0", y1: "0", x2: "1", y2: "0" }, defs);
  el("stop", { offset: "0", "stop-color": "#6e1219" }, wax);
  el("stop", { offset: ".4", "stop-color": "#b8303a" }, wax);
  el("stop", { offset: "1", "stop-color": "#7e1520" }, wax);

  const cx = 160, cy = 160, rx = 118, ry = 32;
  const R = rng(11);
  const at = (deg, r = 0) => {
    const t = (deg * Math.PI) / 180;
    return { x: cx + (rx + r) * Math.cos(t), y: cy + (ry + r * 0.3) * Math.sin(t), front: Math.sin(t) >= 0 };
  };

  el("ellipse", { cx, cy: cy + 12, rx: rx + 18, ry: ry + 12, fill: "#000", opacity: ".35" }, svg);

  const leaves = [];
  for (let i = 0; i < 130; i++) {
    const deg = (i / 130) * 360 + R() * 4;
    const p = at(deg, (R() - 0.5) * 24);
    leaves.push({ ...p, kind: "leaf", deg, len: 9 + R() * 7, color: GREENS[(R() * GREENS.length) | 0], rot: (R() - 0.5) * 70 });
  }
  for (let i = 0; i < 16; i++) {
    const p = at(i * 22.5 + R() * 12, (R() - 0.5) * 16);
    leaves.push({ ...p, kind: "berry", r: 3 + R() * 1.6 });
  }
  leaves.sort((a, b) => a.y - b.y);

  // Spread so no two candles overlap; lighting order goes around the wreath.
  const candles = [200, 290, 20, 110].map((deg, i) => ({ ...at(deg), i }));

  const back = el("g", {}, svg);
  const backCandles = el("g", {}, svg);
  const front = el("g", {}, svg);
  const frontCandles = el("g", {}, svg);

  for (const l of leaves) {
    const layer = l.front ? front : back;
    if (l.kind === "berry") {
      el("circle", { cx: l.x, cy: l.y - 2, r: l.r, fill: "#b3202a" }, layer);
      el("circle", { cx: l.x - l.r * 0.35, cy: l.y - 2 - l.r * 0.35, r: l.r * 0.3, fill: "#ff8a8a", opacity: ".6" }, layer);
    } else {
      el("ellipse", {
        cx: l.x, cy: l.y, rx: l.len, ry: l.len * 0.32, fill: l.color,
        transform: `rotate(${l.deg + 90 + l.rot} ${l.x} ${l.y})`,
      }, layer);
    }
  }

  for (const c of candles) {
    const scale = c.front ? 1 : 0.86;
    const g = el("g", { transform: `translate(${c.x} ${c.y + 3}) scale(${scale})`, class: "candle" }, c.front ? frontCandles : backCandles);
    el("rect", { x: -11, y: -70, width: 22, height: 70, rx: 3, fill: "url(#g-wax)" }, g);
    el("ellipse", { cx: 0, cy: -70, rx: 11, ry: 3.4, fill: "#c94550" }, g);
    el("path", { d: "M-11 -66 q3 0 3 9 q0 4 2.5 4 q2.5 0 2.5 -6 v-7 z", fill: "#c23a45", opacity: ".8" }, g);
    el("line", { x1: 0, y1: -70, x2: 0, y2: -77, stroke: "#2a1a12", "stroke-width": 1.8, "stroke-linecap": "round" }, g);

    const f = el("g", { class: "flame", transform: "translate(0 -76)" }, g);
    el("circle", { class: "glow", cx: 0, cy: -10, r: 34, fill: "url(#g-glow)" }, f);
    const fl = el("g", { class: "fl" }, f);
    const flick = el("g", { class: "flicker" }, fl);
    flick.style.animationDelay = `${-c.i * 0.7}s`; // CSSOM, not a style attribute: CSP allows this
    el("path", { d: "M0 -26 C8 -14 9 -5 0 0 C-9 -5 -8 -14 0 -26Z", fill: "url(#g-flame)" }, flick);
    el("path", { d: "M0 -12 C4 -7 4 -2 0 0 C-4 -2 -4 -7 0 -12Z", fill: "#fffbe8" }, flick);

    if (c.i < lit) {
      const delay = animate ? 500 + c.i * 450 : 0;
      f.style.transitionDelay = `${delay}ms`;
      fl.style.transitionDelay = `${delay}ms`;
      c.lit = g;
    }
  }

  const host = $("#wreath");
  host.replaceChildren(svg);
  // Next frame so the transitions run.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const c of candles) c.lit?.classList.add("lit");
  }));
}

// ---------- views ----------

function setHead({ eyebrow, headline, sub = "" }) {
  $("#eyebrow").textContent = eyebrow;
  $("#headline").textContent = headline;
  $("#sub").textContent = sub;
}

function chip(text) {
  const p = document.createElement("p");
  p.className = "chip";
  p.textContent = text;
  return p;
}

function showHome() {
  const reached = sundaysReached();
  drawWreath(reached, { animate: true });
  setHead({
    eyebrow: "Advent 2026",
    headline: "Adventskalender",
    sub: "Hver søndag i advent venter der en kuvert. Scan QR-koden indeni for at åbne den.",
  });

  const today = todayISO();
  const idx = SUNDAYS.findIndex((s) => s.date >= today);
  let text;
  if (idx === -1) text = "Glædelig jul ❤️";
  else if (SUNDAYS[idx].date === today) text = `I dag er det ${idx + 1}. søndag i advent ✉️`;
  else text = `${idx === 0 ? "Første" : "Næste"} kuvert: søndag d. ${SUNDAYS[idx].label}`;
  $("#stage").replaceChildren(chip(text));
}

function showUnknown() {
  drawWreath(0);
  setHead({
    eyebrow: "Advent 2026",
    headline: "Hov, den kuvert kender jeg ikke",
    sub: "Prøv at scanne QR-koden igen.",
  });
  $("#stage").replaceChildren();
}

function buildLetter(data) {
  const letter = document.createElement("article");
  letter.className = "letter";
  for (const para of data.body.split(/\n\s*\n/)) {
    const text = para.trim();
    if (!text) continue;
    if (IMAGE.test(text)) {
      // A line with just a filename is a photo from the same folder.
      const fig = document.createElement("figure");
      fig.className = "photo";
      const img = document.createElement("img");
      img.src = `/${data.slug}/${text}`;
      img.alt = "";
      img.loading = "lazy";
      fig.append(img);
      letter.append(fig);
    } else {
      const p = document.createElement("p");
      p.textContent = text;
      letter.append(p);
    }
  }
  return letter;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, reducedMotion ? 0 : ms));

/** The week's hint video. Created before the envelope tap so that tap can unlock sound on iOS. */
function makeHintVideo(src) {
  const el = document.createElement("section");
  el.className = "hint-video";
  el.hidden = true;
  const label = document.createElement("p");
  label.className = "eyebrow";
  label.textContent = "Ugens hint";
  const video = document.createElement("video");
  video.src = src;
  video.preload = "auto";
  video.controls = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  el.append(label, video);
  return {
    el,
    // Must run inside a tap handler: iOS then allows later play() calls with sound.
    unlock() {
      video.play().catch(() => {});
      video.pause();
    },
    show() {
      el.hidden = false;
      video.currentTime = 0;
      // If autoplay is refused anyway, the native play button is right there.
      video.play().catch(() => {});
    },
    hide() {
      video.pause();
      el.hidden = true;
    },
    onEnded(fn) {
      video.addEventListener("ended", fn);
    },
  };
}

function showWeek(data) {
  const week = data.week;
  const sunday = SUNDAYS[week - 1];
  document.title = `${week}. søndag i advent`;
  drawWreath(week, { animate: true });
  setHead({
    eyebrow: `${week}. søndag i advent${sunday ? ` · ${sunday.label}` : ""}`,
    headline: data.title,
  });

  const wrap = document.createElement("div");
  wrap.className = "env-wrap";
  const env = document.createElement("button");
  env.className = "envelope";
  env.type = "button";
  env.setAttribute("aria-label", "Åbn kuverten");
  for (const part of ["env-back", "env-letter", "env-front", "env-flap"]) {
    const s = document.createElement("span");
    s.className = part;
    env.append(s);
  }
  const seal = document.createElement("span");
  seal.className = "seal";
  seal.textContent = week;
  env.append(seal);
  const tapHint = document.createElement("p");
  tapHint.className = "hint";
  tapHint.textContent = "Tryk for at åbne";
  wrap.append(env, tapHint);

  const stage = $("#stage");
  stage.replaceChildren(wrap);

  const hint = data.opgave?.hint ? makeHintVideo(`/${data.slug}/${data.opgave.hint}`) : null;
  const taskReady = buildTask(data).catch((e) => (console.error(e), null));

  env.addEventListener("click", async () => {
    if (env.classList.contains("open")) return;
    env.classList.add("open");
    hint?.unlock();
    tapHint.textContent = " ";
    await sleep(1350);
    wrap.classList.add("gone");
    await sleep(450);

    const task = await taskReady;
    const letter = data.body ? buildLetter(data) : null;
    const actionButton = (text, onClick) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-ghost";
      b.textContent = text;
      b.addEventListener("click", onClick);
      return b;
    };
    const scrollTo = (el) => el.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });

    // Under the task: "watch hint again" and, once solved, "start over" (to show it off to others).
    let actions = null, replay = null;
    if (task) {
      actions = document.createElement("div");
      actions.className = "task-actions";
      if (data.opgave.knaphint) actions.append(holdButton((btn) => runHint(data.opgave.knaphint, btn)));
      if (hint) actions.append(actionButton("▶  Se hintet igen", () => { showHint(); scrollTo(hint.el); }));
      replay = actionButton("↺  Start forfra", () => {
        task.reset();
        hint ? showHint() : showTask();
        scrollTo(hint?.el ?? task.el);
      });
      actions.append(replay);
      task.onSolved(() => { replay.hidden = false; });
    }
    stage.replaceChildren(...[letter, hint?.el, task?.el, actions].filter(Boolean));

    function showTask() {
      hint?.hide();
      task.el.hidden = false;
      actions.hidden = false;
      replay.hidden = !task.isSolved();
      task.activate();
    }
    function showHint() {
      if (task) {
        task.deactivate();
        task.el.hidden = true;
        actions.hidden = true;
      }
      hint.show();
    }

    if (hint && task) {
      hint.onEnded(showTask);
      // Already solved: go straight to the number; hint and replay are one tap away.
      task.isSolved() ? showTask() : showHint();
    } else if (hint) {
      hint.show();
    } else if (task) {
      showTask();
    }
    (letter ?? hint?.el ?? task?.el)?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  });
}

// ---------- snow ----------

function snow() {
  if (reducedMotion) return;
  const canvas = $("#snow");
  const ctx = canvas.getContext("2d");
  let w = 0, h = 0;
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth;
    h = innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  addEventListener("resize", resize);

  const flakes = Array.from({ length: Math.round(Math.min(90, (w * h) / 8000)) }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    r: 0.6 + Math.random() * 2.2,
    s: 0.25 + Math.random() * 0.7,
    d: Math.random() * Math.PI * 2,
    o: 0.3 + Math.random() * 0.5,
  }));

  const frame = () => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#fff"; // resizing the canvas resets context state
    for (const f of flakes) {
      f.y += f.s * (0.6 + f.r * 0.35);
      f.d += 0.012;
      f.x += Math.sin(f.d) * 0.35;
      if (f.y > h + 4) { f.y = -4; f.x = Math.random() * w; }
      if (f.x > w + 4) f.x = -4;
      else if (f.x < -4) f.x = w + 4;
      ctx.globalAlpha = f.o;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// ---------- boot ----------

async function main() {
  snow();
  const slug = decodeURIComponent(location.pathname.replace(/^\/+|\/+$/g, ""));
  if (!slug) return showHome();
  if (!/^[1-4]-[A-Za-z0-9_-]{8,}$/.test(slug)) return showUnknown();

  drawWreath(0);
  setHead({ eyebrow: "Advent 2026", headline: " " });
  const loading = document.createElement("p");
  loading.className = "loading";
  loading.textContent = "Åbner kuverten…";
  $("#stage").replaceChildren(loading);

  try {
    showWeek(await loadWeek(slug));
  } catch {
    showUnknown();
  }
}

main();
