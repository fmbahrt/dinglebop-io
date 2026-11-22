// Advent calendar client.
//
// Each week lives in its own folder with a random name, e.g. site/1-Xk3.../
// containing brev.txt and any photos. The URL is advent.dinglebop.io/<folder>;
// the leading digit is the week number.
//
// The front page is not at "/" but at a random path, advent.dinglebop.io/<hjem>,
// where site/<hjem>/portaler.json lists the weeks' folders. Nothing secret is in
// this file (anyone can read it), so neither the front page nor the weeks can be
// found from here.

import { smsPhone } from "/sms.js";
import { DEBUG, link } from "/felles.js";
import { cutout, ransomNote } from "/brev.js";
import { portalSound } from "/lyd.js";

// One portal per advent Sunday on the front page; it opens on that date.
// Add ?debug to the front page URL to unlock them all. The slugs come from
// /<hjem>/portaler.json (see above).
const SUNDAYS = [
  { date: "2026-11-29", label: "29. november", slug: null },
  { date: "2026-12-06", label: "6. december", slug: null },
  { date: "2026-12-13", label: "13. december", slug: null },
  { date: "2026-12-20", label: "20. december", slug: null },
];
const HOME_KEY = "advent:hjem"; // the front page path, remembered for "← Alle portaler"

/** The front page's portal list, if this path is the (secret) front page. */
async function loadHome(path) {
  if (!/^[A-Za-z0-9]{16,}$/.test(path)) return null;
  try {
    const r = await fetch(`/${path}/portaler.json`, { cache: "no-cache" });
    if (!r.ok) return null;
    const uger = (await r.json()).uger;
    return Array.isArray(uger) ? uger : null;
  } catch {
    return null;
  }
}

const $ = (sel) => document.querySelector(sel);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  trin: async (opgave, data) => (await import("/trin.js")).trinOpgave(opgave, data),
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
  host.hidden = false;
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
  document.title = "Det store juleescaperoom";
  const reached = sundaysReached();
  // No candle wreath up top here: the portals are the candles (krans below).
  $("#wreath").replaceChildren();
  $("#wreath").hidden = true;
  setHead({
    eyebrow: "Advent 2026 · 4 portaler · 4 cifre",
    headline: "Det store juleescaperoom",
    sub: "Finn har stjålet din adventsgave 🐾 Gå gennem hans fire portaler, klar prøverne, og find koden til kisten.",
  });

  const today = todayISO();
  const lock = codeLock();
  $("#stage").replaceChildren(ransomNote(), krans(today, lock), lock.el, ...(DEBUG ? [chip("🔓 Debug: alle portaler er åbne")] : []));
}

/** A combination lock showing the digits found so far. */
function codeLock() {
  const el = document.createElement("section");
  el.className = "codelock";
  el.innerHTML = `<span class="codelock-shackle" aria-hidden="true"></span>
    <div class="codelock-body">
      <p class="codelock-label">Finns kiste 🐾</p>
      <div class="codelock-wheels"></div>
      <p class="codelock-sub"></p>
    </div>`;
  const wheels = el.querySelector(".codelock-wheels");
  const sub = el.querySelector(".codelock-sub");
  const found = new Array(SUNDAYS.length).fill(null);
  const draw = () => {
    wheels.replaceChildren(...found.map((n, i) => {
      const w = document.createElement("span");
      w.className = `codelock-wheel${n != null ? " found" : ""}`;
      w.textContent = n ?? "·";
      w.setAttribute("aria-label", n != null ? `Ciffer ${i + 1}: ${n}` : `Ciffer ${i + 1}: ikke fundet`);
      return w;
    }));
    const k = found.filter((n) => n != null).length;
    sub.textContent = k === found.length ? "Alle cifre fundet – åbn kisten! 🎁" : `${k} af ${found.length} cifre fundet`;
    el.classList.toggle("complete", k === found.length);
  };
  draw();
  return { el, set: (i, n) => { found[i] = n; draw(); } };
}

/**
 * The escape-room advent wreath, in 3D: a tilted plate (iron chain, fir, berries,
 * odds and ends, a keyhole in the middle) with the four portals standing on it
 * as its candles. An open portal is a lit candle (flame on top); locked ones only
 * have a wick. It sways a little and can be turned with a finger.
 */
function krans(today, lock) {
  const scene = document.createElement("div");
  scene.className = "krans";
  const plate = document.createElement("div");
  plate.className = "krans-plate";
  scene.append(plate);

  const cx = 50, cy = 50, r = 34;
  const svg = el("svg", { class: "krans-ring", viewBox: "0 0 100 100", "aria-hidden": "true" });
  const defs = el("defs", {}, svg);
  const brass = el("radialGradient", { id: "k-brass", cx: ".4", cy: ".35" }, defs);
  el("stop", { offset: "0", "stop-color": "#fbe7a6" }, brass);
  el("stop", { offset: ".55", "stop-color": "#c99a3b" }, brass);
  el("stop", { offset: "1", "stop-color": "#7a5419" }, brass);
  const table = el("radialGradient", { id: "k-table" }, defs);
  el("stop", { offset: "0", "stop-color": "#000", "stop-opacity": ".55" }, table);
  el("stop", { offset: ".7", "stop-color": "#000", "stop-opacity": ".25" }, table);
  el("stop", { offset: "1", "stop-color": "#000", "stop-opacity": "0" }, table);
  el("circle", { cx, cy, r: 49, fill: "url(#k-table)" }, svg);
  // Fir.
  const R = rng(7);
  for (let i = 0; i < 150; i++) {
    const t = (i / 150) * Math.PI * 2 + R() * 0.05;
    const rr = r + (R() - 0.5) * 9;
    const x = cx + rr * Math.cos(t), y = cy + rr * Math.sin(t);
    el("ellipse", { cx: x, cy: y, rx: 3.2 + R() * 1.8, ry: 1, fill: GREENS[(R() * GREENS.length) | 0], transform: `rotate(${(t * 180) / Math.PI + 90 + (R() - 0.5) * 80} ${x} ${y})` }, svg);
  }
  // The chain: two rows of links, offset.
  el("circle", { cx, cy, r, fill: "none", stroke: "#3f444b", "stroke-width": 2.8, "stroke-dasharray": "3.2 2.2", "stroke-linecap": "round" }, svg);
  el("circle", { cx, cy, r, fill: "none", stroke: "#a3aab3", "stroke-width": 1.1, "stroke-dasharray": "2.2 3.2", "stroke-dashoffset": 2.7, "stroke-linecap": "round" }, svg);
  for (let i = 0; i < 12; i++) {
    const t = (i / 12) * Math.PI * 2 + 0.26;
    el("circle", { cx: cx + (r + 3) * Math.cos(t), cy: cy + (r + 3) * Math.sin(t), r: 1.3, fill: "#b3202a" }, svg);
  }
  // Odds and ends lying on the ring, between the portals.
  [["⏳", -Math.PI / 4], ["🧭", (3 * Math.PI) / 4], ["🔍", (5 * Math.PI) / 4]].forEach(([e, t]) => {
    el("text", { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) + 2.6, "text-anchor": "middle", "font-size": 7.5 }, svg).textContent = e;
  });
  // A keyhole in the middle, and the key, not quite in it.
  const key = el("g", { transform: `translate(${cx} ${cy})` }, svg);
  el("ellipse", { rx: 7.5, ry: 10, fill: "url(#k-brass)", stroke: "#6b4a17", "stroke-width": 0.6 }, key);
  el("circle", { cy: -2.2, r: 2.4, fill: "#1a120a" }, key);
  el("path", { d: "M-1.3 -1 L-2.4 5.5 L2.4 5.5 L1.3 -1 Z", fill: "#1a120a" }, key);
  el("text", { x: cx + 12, y: cy + 6, "text-anchor": "middle", "font-size": 7, transform: `rotate(-35 ${cx + 12} ${cy + 4})` }, svg).textContent = "🗝️";
  plate.append(svg);

  // The portals stand on the ring, clockwise from the back.
  [270, 0, 90, 180].forEach((deg, i) => {
    const t = (deg * Math.PI) / 180;
    const x = cx + r * Math.cos(t), y = cy + r * Math.sin(t);
    const base = document.createElement("span");
    base.className = "krans-shadow";
    const slot = document.createElement("div");
    slot.className = "krans-slot";
    for (const e of [base, slot]) {
      e.style.left = `${x}%`;
      e.style.top = `${y}%`;
    }
    slot.append(portal(SUNDAYS[i], i, today, lock));
    plate.append(base, slot);
  });

  // Sway, and turn it with a finger.
  let rot = 0, base0 = 0, drag = null, dragged = false;
  const set = (v) => plate.style.setProperty("--rot", `${v}deg`);
  scene.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, from: rot };
    dragged = false;
  });
  scene.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!dragged && Math.abs(dx) > 8) {
      dragged = true;
      scene.setPointerCapture?.(e.pointerId);
    }
    if (dragged) {
      rot = drag.from + dx * 0.5;
      set(rot);
    }
  });
  const up = () => {
    if (drag && dragged) base0 = rot;
    drag = null;
  };
  scene.addEventListener("pointerup", up);
  scene.addEventListener("pointercancel", up);
  // A drag is not a tap on a portal.
  scene.addEventListener("click", (e) => {
    if (dragged) {
      e.stopPropagation();
      e.preventDefault();
      dragged = false;
    }
  }, true);
  if (!reducedMotion) {
    const t0 = performance.now();
    const sway = (now) => {
      if (!scene.isConnected && now - t0 > 5000) return;
      requestAnimationFrame(sway);
      if (drag) return;
      rot = base0 + 7 * Math.sin((now - t0) / 2600);
      set(rot);
    };
    requestAnimationFrame(sway);
  }
  return scene;
}

/** A portal: foggy until its Sunday, swirling once open, golden once solved. No name, just the week's title. */
function portal(s, i, today, lock) {
  const open = DEBUG || s.date <= today;
  const solved = (() => {
    try { return JSON.parse(localStorage.getItem(`advent:${s.slug}:løst`)) === true; } catch { return false; }
  })();
  const short = s.label.replace(/ (\w{3})\w*$/, " $1.");
  const b = document.createElement("button");
  b.type = "button";
  b.className = `portal${open ? " open" : " locked"}${s.date === today ? " today" : ""}${solved ? " solved" : ""}`;
  b.setAttribute("aria-label", open ? `Portal ${i + 1}` : `Portal ${i + 1}, låst til ${s.label}`);
  b.innerHTML = `
    <span class="portal-gate">
      ${open ? `<span class="portal-flame"><i></i></span>` : `<span class="portal-wick"></span>`}
      <span class="portal-ring"></span>
      <span class="portal-core"><span class="portal-swirl"></span><span class="portal-emoji">${open ? "✨" : "?"}</span></span>
      ${solved ? `<span class="portal-check">✓</span>` : ""}
      ${open ? "" : `<span class="portal-lock">🔒</span>`}
    </span>
    <span class="portal-name">${open ? "…" : short}</span>`;
  const tag = document.createElement("span");
  tag.className = "portal-tag";
  tag.textContent = solved ? "Klaret ✓" : open ? "Træd ind ✨" : "Låst";
  b.append(tag);
  if (!open) countdownTo(s.date, tag);
  b.addEventListener("click", () => {
    if (!open) {
      b.classList.remove("shake");
      void b.offsetWidth;
      b.classList.add("shake");
      tag.textContent = `Åbner ${short} 🔒`;
      navigator.vibrate?.(80);
      portalSound(false);
      return;
    }
    portalSound(true);
    warp(b);
    setTimeout(() => (location.href = link(`/${s.slug}`)), reducedMotion ? 0 : 900);
  });
  if (open) {
    opgave(s.slug).then((o) => {
      if (!o) return;
      const title = String(o.overskrift ?? "");
      const emoji = title.match(/\p{Extended_Pictographic}\uFE0F?/u)?.[0];
      if (emoji) b.querySelector(".portal-emoji").textContent = emoji;
      b.querySelector(".portal-name").textContent = title.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "").trim() || short;
      if (solved && o.tal != null) lock.set(i, o.tal);
    });
  }
  return b;
}

/** A locked portal's own escape-room timer; reloads the page when it opens. */
function countdownTo(date, tag) {
  tag.classList.add("portal-timer");
  const target = new Date(`${date}T00:00:00`).getTime();
  const pad = (n) => String(n).padStart(2, "0");
  const tick = () => {
    const left = Math.max(0, Math.floor((target - Date.now()) / 1000));
    if (left === 0) {
      clearInterval(timer);
      if (tag.isConnected) location.reload();
      return;
    }
    const d = Math.floor(left / 86400), t = Math.floor(left / 3600) % 24, m = Math.floor(left / 60) % 60, sec = left % 60;
    tag.textContent = `${d ? `${d}d ` : ""}${pad(t)}:${pad(m)}:${pad(sec)}`;
  };
  const timer = setInterval(tick, 1000);
  tick();
}

/** Stepping through: the portal swallows the screen. */
function warp(b) {
  if (reducedMotion) return;
  const r = b.querySelector(".portal-gate").getBoundingClientRect();
  const veil = document.createElement("div");
  veil.className = "warp";
  veil.style.setProperty("--x", `${r.left + r.width / 2}px`);
  veil.style.setProperty("--y", `${r.top + r.height / 2}px`);
  document.body.append(veil);
  b.classList.add("warping");
  navigator.vibrate?.([20, 30, 60]);
}

/** A week's opgave.json (title, emoji and number for the portals). */
async function opgave(slug) {
  try {
    const r = await fetch(`/${slug}/opgave.json`, { cache: "no-cache" });
    return await r.json();
  } catch {
    return null;
  }
}

/** A wrong link: says nothing about what this site is. */
function showUnknown() {
  document.title = "🐾";
  setHead({ eyebrow: "", headline: "Her er ikke noget 🐾", sub: "" });
  $("#stage").replaceChildren();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, reducedMotion ? 0 : ms));

function showWeek(data) {
  const week = data.week;
  const sunday = SUNDAYS[week - 1];
  document.title = `${data.title} · Det store juleescaperoom`;
  const back = document.createElement("a");
  back.className = "back-link";
  let home = null;
  try { home = localStorage.getItem(HOME_KEY); } catch { /* private mode */ }
  back.href = link(`/${home}`);
  back.textContent = "← Alle portaler";
  if (home) $(".wrap").prepend(back);
  drawWreath(week, { animate: true });
  setHead({
    eyebrow: `${week}. søndag i advent${sunday ? ` · ${sunday.label}` : ""}`,
    headline: data.opgave?.overskrift ?? data.title,
  });

  const stage = $("#stage");
  stage.replaceChildren();
  fullscreenToggle();
  const scrollTo = (el) => el?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });

  // Finn texts her first (sms.js); "Videre" puts the phone away and brings out the puzzle.
  const solvedBefore = (() => {
    try { return JSON.parse(localStorage.getItem(`advent:${data.slug}:løst`)) === true; } catch { return false; }
  })();
  const actionButton = (text, onClick, className = "btn btn-ghost") => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = className;
    b.textContent = text;
    b.addEventListener("click", onClick);
    return b;
  };
  const letterStep = document.createElement("section");
  letterStep.className = "letter-step";
  letterStep.hidden = true;
  const next = actionButton("Videre →", () => showTask(true), "btn letter-next");
  next.hidden = true;
  const sms = data.body
    ? smsPhone({ body: data.body, slug: data.slug, collage: collage(data), onDone: () => { next.hidden = false; } })
    : null;
  // Every week: Finn's texts arrive on the phone she then uses for the puzzle:
  // the app phone (weeks 1–3) or the phone that goes into the car (week 4).
  const seenKey = `advent:${data.slug}:sms-læst`;
  const smsData = data.body ? { body: data.body, slug: data.slug, collage: collage(data), seenKey } : null;
  const isTrin = data.opgave?.type === "trin";
  const carStep = smsData && isTrin ? data.opgave.trin?.find((t) => t.type === "bil" && t.telefon !== false) : null;
  const phoneWeek = smsData && isTrin && data.opgave.visning === "telefon";
  if (carStep) carStep.sms = smsData;
  if (phoneWeek) data.opgave.sms = smsData;
  const inPhone = !!(carStep || phoneWeek);
  if (sms) letterStep.append(sms.el, next);
  stage.append(letterStep);

  // Under the puzzle: Finn's texts again and, once solved, "start over". (No hint button: hints are asked for in real life.)
  let task = null, actions = null, replay = null;
  const ready = buildTask(data).catch((e) => (console.error(e), null)).then((t) => {
    task = t;
    if (!task) return;
    actions = document.createElement("div");
    actions.className = "task-actions";
    if (sms) actions.append(actionButton("💬  Læs Finns beskeder igen", () => {
      // On the same phone if it's on screen; otherwise (e.g. after the car) a phone of their own.
      if (task.showMessages?.()) scrollTo(task.el);
      else showLetter(false);
    }));
    replay = actionButton("↺  Start forfra", () => {
      try { localStorage.removeItem(seenKey); } catch { /* ignore */ }
      task.reset();
      // The puzzle's own phone shows the texts again after a reset; only weeks
      // without such a phone use the separate one.
      inPhone ? showTask() : showLetter(true);
    });
    actions.append(replay);
    task.onSolved(() => { replay.hidden = false; });
    task.el.hidden = true;
    actions.hidden = true;
    stage.append(task.el, actions);
  });

  function showLetter(fresh) {
    if (!sms) return;
    task?.deactivate();
    if (task) task.el.hidden = true;
    if (actions) actions.hidden = true;
    letterStep.hidden = false;
    letterStep.classList.remove("out");
    letterStep.classList.add("in");
    next.hidden = true;
    fresh ? sms.start() : sms.showAll();
    scrollTo(document.querySelector(".head"));
  }
  async function showTask(animate = false) {
    await ready;
    if (!task) return;
    if (animate && !reducedMotion) {
      letterStep.classList.remove("in");
      letterStep.classList.add("out");
      await sleep(450);
    }
    letterStep.hidden = true;
    task.el.hidden = false;
    task.el.classList.add("in");
    actions.hidden = false;
    replay.hidden = !task.isSolved() && !DEBUG; // in debug: always possible to start over
    task.activate();
    scrollTo(task.el);
  }

  // Already solved: straight to the number (the texts are one tap away).
  if (!sms || inPhone) showTask();
  else if (solvedBefore) ready.then(() => (task ? showTask() : showLetter(false)));
  else showLetter(true);
}

/**
 * Fullscreen: the puzzle fills the whole screen. The mock iPhone loses its
 * frame and fake status bar and becomes the screen she holds; scenes (the car,
 * cartoons, the melody lock, cameras) get the whole screen too. CSS does the
 * work (html.fs); where the browser allows it (Android, desktop, iPad) the
 * Fullscreen API also hides the browser's own bars. iPhone Safari doesn't
 * allow that for web pages, so there it's the CSS only. Remembered per device.
 */
const FS_KEY = "advent:fuldskærm";
function fullscreenToggle() {
  if (document.querySelector(".fs-toggle")) return;
  const root = document.documentElement;
  const canApi = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  const apiOn = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "fs-toggle";
  const draw = () => {
    const on = root.classList.contains("fs");
    btn.textContent = on ? "✕" : "⛶";
    btn.setAttribute("aria-label", on ? "Luk fuld skærm" : "Fuld skærm");
    btn.title = on ? "Luk fuld skærm" : "Fuld skærm";
  };
  const set = (on, fromApi = false) => {
    root.classList.toggle("fs", on);
    try { localStorage.setItem(FS_KEY, on ? "1" : "0"); } catch { /* private mode */ }
    draw();
    if (!fromApi && canApi) {
      if (on && !apiOn()) (root.requestFullscreen?.({ navigationUI: "hide" }) ?? root.webkitRequestFullscreen?.())?.catch?.(() => {});
      if (!on && apiOn()) (document.exitFullscreen?.() ?? document.webkitExitFullscreen?.())?.catch?.(() => {});
    }
    // Keep what she was looking at in view.
    requestAnimationFrame(() => document.querySelector(".task:not([hidden]), .letter-step:not([hidden])")?.scrollIntoView({ block: "start" }));
  };
  btn.addEventListener("click", () => set(!root.classList.contains("fs")));
  // Leaving the browser's fullscreen (Android back, Esc) leaves ours too.
  for (const ev of ["fullscreenchange", "webkitfullscreenchange"]) {
    document.addEventListener(ev, () => { if (!apiOn() && root.classList.contains("fs")) set(false, true); });
  }
  let saved = null;
  try { saved = localStorage.getItem(FS_KEY); } catch { /* private mode */ }
  root.classList.toggle("fs", saved === "1");
  draw();
  document.body.append(btn);
}

/** Finn's "photo" of his ransom collage: the week's title in cut-out letters. */
function collage(data) {
  const words = data.title.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "").trim().toLocaleUpperCase("da").split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const paper = document.createElement("div");
  paper.className = "sms-collage";
  paper.append(cutout(words, data.week * 3));
  return paper;
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

/** A string of Christmas lights across the top of the page. */
function lights() {
  const el = document.createElement("div");
  el.className = "lights";
  el.setAttribute("aria-hidden", "true");
  const n = 13;
  // Two sagging swoops: y as a function of x (0..1).
  const sag = (x) => Math.abs(Math.sin(x * Math.PI * 2)) * 14;
  const pts = Array.from({ length: 41 }, (_, k) => `${(k / 40) * 100},${4 + sag(k / 40)}`).join(" ");
  el.innerHTML = `<svg viewBox="0 0 100 24" preserveAspectRatio="none"><polyline points="${pts}" /></svg>`;
  for (let k = 0; k < n; k++) {
    const x = (k + 0.5) / n;
    const b = document.createElement("span");
    b.className = `bulb c${k % 4}`;
    b.style.left = `${x * 100}%`;
    b.style.top = `${((4 + sag(x)) / 24) * 100}%`;
    b.style.animationDelay = `${(k * 0.37) % 2.2}s`;
    el.append(b);
  }
  document.body.prepend(el);
}

async function main() {
  snow();
  lights();
  const slug = decodeURIComponent(location.pathname.replace(/^\/+|\/+$/g, ""));
  if (!/^[1-4]-[A-Za-z0-9_-]{8,}$/.test(slug)) {
    const uger = slug ? await loadHome(slug) : null;
    if (!uger) return showUnknown();
    uger.forEach((u, i) => SUNDAYS[i] && (SUNDAYS[i].slug = u));
    try { localStorage.setItem(HOME_KEY, slug); } catch { /* private mode */ }
    return showHome();
  }

  drawWreath(0);
  setHead({ eyebrow: "Det store juleescaperoom", headline: " " });
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
