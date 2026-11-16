// Step "postkort": take the perfect postcard photo. A camera viewfinder over a
// photo that starts crooked, zoomed out and off-centre. Drag to aim, pinch or
// use the slider to zoom, and straighten with the dial. The shutter grades the
// shot; when it matches the postcard it turns into one, with a greeting on the back.
//
//   { "type": "postkort", "billede": "noto.jpg", "by": "Noto",
//     "mål": { "x": 0.53, "y": 0.38, "zoom": 1.6 },      // centre (0–1 of the photo) + zoom
//     "start": { "x": 0.42, "y": 0.62, "zoom": 1, "drej": 7 },
//     "hilsen": "Kære dig …" }

import { h, button } from "/felles.js";
import { beep } from "/trin.js";

const ASPECT = 3 / 2;
const TOL = { rot: 1.5, off: 0.07, zoom: 0.15 };
const ZMIN = 1, ZMAX = 3, RMAX = 15;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export default function postkort(cfg, { slug, done }) {
  const src = `/${slug}/${cfg.billede}`;
  const target = { x: 0.5, y: 0.5, zoom: 1.6, ...(cfg.mål ?? {}) };
  const st = { x: 0.42, y: 0.62, zoom: 1, rot: 7, ...(cfg.start ?? {}) };
  st.rot = Number(cfg.start?.drej ?? st.rot);
  const city = cfg.by ?? "Noto";

  const root = h("div", "app cam");
  const top = h("div", "cam-top");
  top.append(h("span", "cam-mode", "FOTO"), h("span", "cam-badge", "📍 " + city));

  // ---- viewfinder
  const view = h("div", "cam-view");
  const img = h("img", "cam-img");
  img.src = src;
  img.alt = "";
  img.draggable = false;
  const grid = h("div", "cam-grid");
  const level = h("div", "cam-level");
  level.append(h("span", "cam-level-l"), h("span", "cam-level-c"), h("span", "cam-level-r"));
  const flash = h("div", "cam-flash");
  view.append(img, grid, level, flash);

  // ---- the postcard to match
  const ref = h("div", "cam-ref");
  const refView = h("div", "cam-refview");
  const refImg = h("img", "cam-img");
  refImg.src = src;
  refImg.alt = "";
  refView.append(refImg);
  ref.append(refView, h("p", "cam-ref-text", cfg.mållabel ?? "Det perfekte postkort ✨"));

  // ---- controls
  const zoom = slider("🔍", ZMIN, ZMAX, 0.01, st.zoom, (v) => `${v.toFixed(1)}×`);
  const rot = slider("📐", -RMAX, RMAX, 0.1, st.rot, (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}°`);
  rot.wrap.classList.add("cam-dial");
  const msg = h("p", "cam-msg", cfg.besked ?? "Træk i billedet, zoom og ret op 📸");
  const shutter = button("", "cam-shutter", shoot);
  shutter.setAttribute("aria-label", "Tag billede");
  const bar = h("div", "cam-bar");
  bar.append(ref, shutter, h("span", "cam-bar-pad"));

  root.append(top, view, zoom.wrap, rot.wrap, bar, msg);

  // ---- rendering: image point (x, y) at the view centre, scaled and rotated
  const layout = (el, frame, s) => {
    const W = el.naturalWidth, H = el.naturalHeight;
    const vw = frame.clientWidth, vh = frame.clientHeight;
    if (!W || !vw) return;
    const S = Math.max(vw / W, vh / H) * s.zoom;
    el.style.transform = `translate(${vw / 2}px, ${vh / 2}px) rotate(${s.rot}deg) scale(${S}) translate(${-s.x * W}px, ${-s.y * H}px)`;
  };
  const draw = () => {
    layout(img, view, st);
    layout(refImg, refView, { ...target, rot: 0 });
    const levelOk = Math.abs(st.rot) < TOL.rot;
    level.style.setProperty("--r", `${-st.rot}deg`);
    level.classList.toggle("ok", levelOk);
  };
  img.addEventListener("load", draw);
  refImg.addEventListener("load", draw);
  new ResizeObserver(draw).observe(view);

  zoom.input.addEventListener("input", () => { st.zoom = Number(zoom.input.value); zoom.show(); draw(); });
  rot.input.addEventListener("input", () => {
    st.rot = Number(rot.input.value);
    if (Math.abs(st.rot) < 0.4 && Math.abs(st.rot) > 0) { st.rot = 0; rot.input.value = "0"; navigator.vibrate?.(8); }
    rot.show();
    draw();
  });

  // ---- drag to aim, pinch to zoom
  const pointers = new Map();
  let pinch = null;
  view.addEventListener("pointerdown", (e) => {
    view.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: st.zoom };
    }
  });
  view.addEventListener("pointermove", (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size >= 2 && pinch) {
      const [a, b] = [...pointers.values()];
      st.zoom = clamp(pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d), ZMIN, ZMAX);
      zoom.input.value = String(st.zoom);
      zoom.show();
    } else if (pointers.size === 1) {
      // Screen movement → image coordinates (undo the rotation and scale).
      const W = img.naturalWidth, H = img.naturalHeight;
      const S = Math.max(view.clientWidth / W, view.clientHeight / H) * st.zoom;
      const t = (-st.rot * Math.PI) / 180;
      const ix = (dx * Math.cos(t) - dy * Math.sin(t)) / S;
      const iy = (dx * Math.sin(t) + dy * Math.cos(t)) / S;
      st.x = clamp(st.x - ix / W, 0, 1);
      st.y = clamp(st.y - iy / H, 0, 1);
    }
    draw();
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
  };
  view.addEventListener("pointerup", up);
  view.addEventListener("pointercancel", up);

  // ---- the photographer's verdict
  function verdict() {
    const W = img.naturalWidth, H = img.naturalHeight;
    const vw = view.clientWidth, vh = view.clientHeight;
    const S = Math.max(vw / W, vh / H) * target.zoom;
    const ox = ((st.x - target.x) * W * S) / vw; // + = aimed too far right
    const oy = ((st.y - target.y) * H * S) / vh; // + = aimed too low
    const oz = Math.log(st.zoom / target.zoom); // + = too close
    const rotBad = Math.abs(st.rot) / TOL.rot;
    const offBad = Math.max(Math.abs(ox), Math.abs(oy)) / TOL.off;
    const zoomBad = Math.abs(oz) / Math.log(1 + TOL.zoom);
    const worst = Math.max(rotBad, offBad, zoomBad);
    const score = clamp(Math.round(10 - (worst - 1) * 1.2), 1, worst <= 1 ? 10 : 9);
    if (worst <= 1) return { ok: true, score };
    // Like a picky photographer: straight first, then zoom, then aim.
    let tip;
    if (rotBad > 1) tip = "Den er skæv! Ret den op 📐";
    else if (zoomBad > 1) tip = oz < 0 ? "Zoom lidt ind 🔍" : "For tæt på – zoom lidt ud 🔍";
    else if (Math.abs(ox) > Math.abs(oy)) tip = ox > 0 ? "Lidt mere til venstre 👈" : "Lidt mere til højre 👉";
    else tip = oy > 0 ? "Lidt højere op ☝️" : "Lidt længere ned 👇";
    return { ok: false, score, tip };
  }

  let busy = false;
  function shoot() {
    if (busy) return;
    flash.classList.remove("go");
    void flash.offsetWidth;
    flash.classList.add("go");
    beep(2400, 25);
    setTimeout(() => beep(1600, 35), 60);
    navigator.vibrate?.(15);
    const v = verdict();
    if (!v.ok) {
      msg.className = "cam-msg bad";
      msg.textContent = `${v.score}/10 – ${v.tip}`;
      return;
    }
    busy = true;
    msg.className = "cam-msg ok";
    msg.textContent = "10/10 – Det perfekte postkort! 📸";
    navigator.vibrate?.([30, 50, 120]);
    setTimeout(postcard, 1200);
  }

  // ---- the result: a postcard you can flip
  function postcard() {
    const canvas = document.createElement("canvas");
    const vw = view.clientWidth, vh = view.clientHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = vw * dpr;
    canvas.height = vh * dpr;
    const ctx = canvas.getContext("2d");
    const W = img.naturalWidth, H = img.naturalHeight;
    const S = Math.max(vw / W, vh / H) * st.zoom;
    ctx.scale(dpr, dpr);
    ctx.translate(vw / 2, vh / 2);
    ctx.rotate((st.rot * Math.PI) / 180);
    ctx.scale(S, S);
    ctx.translate(-st.x * W, -st.y * H);
    ctx.drawImage(img, 0, 0);

    root.replaceChildren(top, ...postcardView(canvas.toDataURL("image/jpeg", 0.85), cfg, done));
    root.classList.add("done");
  }

  draw();
  return { el: root };
}

function slider(icon, min, max, step, value, fmt) {
  const wrap = h("label", "cam-slider");
  const input = h("input");
  Object.assign(input, { type: "range", min, max, step, value });
  const out = h("span", "cam-val");
  const show = () => { out.textContent = fmt(Number(input.value)); };
  show();
  wrap.append(h("span", "cam-ico", icon), input, out);
  return { wrap, input, show };
}

/** The finished postcard (front: the photo, back: the greeting), flips on tap. */
export function postcardView(photoSrc, cfg, done) {
  const city = cfg.by ?? "Noto";
  const card = h("div", "pc");
  const inner = h("div", "pc-inner");
  const front = h("div", "pc-front");
  const photo = h("img", "pc-photo");
  photo.src = photoSrc;
  photo.alt = `Postkort fra ${city}`;
  front.append(photo, h("p", "pc-title", cfg.titel ?? `Saluti da ${city}`));
  const back = h("div", "pc-back");
  const addr = h("div", "pc-addr");
  addr.append(h("p", null, cfg.til ?? "Til verdens bedste"), h("p", null, cfg.adresse ?? "rejsemakker ❤️"));
  back.append(h("div", "pc-stamp", "🍋"), h("div", "pc-postmark", city.toUpperCase()), h("p", "pc-text", cfg.hilsen ?? "Ciao bella! ❤️"), addr);
  inner.append(front, back);
  card.append(inner);
  card.addEventListener("click", () => card.classList.toggle("flipped"));
  beep(1047, 90);
  setTimeout(() => beep(1568, 160), 110);
  setTimeout(() => card.classList.add("flipped"), 2200);
  return [card, h("p", "pc-hint", "Tryk på kortet for at vende det 🔄"), button("Videre ✓", "btn", done)];
}
