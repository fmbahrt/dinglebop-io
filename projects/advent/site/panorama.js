// Step "panorama": stand inside a 360° photo and take the perfect postcard by
// holding up the phone like a camera. The gyroscope turns the view (turn = left/
// right, tilt = up/down, holding it crooked = crooked horizon); without one you
// drag. Pinch to zoom. The shutter grades the shot against the target; a perfect
// one becomes a postcard with a greeting on the back.
//
//   { "type": "panorama", "billede": "palermo-360.jpg", "by": "Palermo",
//     "mål":   { "yaw": 104, "pitch": 18, "fov": 70 },   // degrees; yaw 0 = middle of the photo
//     "start": { "yaw": 260, "pitch": 0, "fov": 90 },
//     "hilsen": "…", "reserve": { …a "postkort" step… } }
//
// "billede" is an equirectangular (2:1) 360° photo. Without WebGL the "reserve"
// postkort step is used instead.

import { h, button, DEBUG } from "/felles.js";
import { beep } from "/trin.js";
import postkort, { postcardView } from "/postkort.js";

const TOL = { yaw: 6, pitch: 5, fov: 0.18, roll: 3.5 };
const FOV_MIN = 30, FOV_MAX = 100;
const RAD = Math.PI / 180;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

const VERT = `attribute vec2 p; varying vec2 uv; void main() { uv = p; gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `precision highp float;
varying vec2 uv;
uniform sampler2D tex;
uniform mat3 cam;      // columns: right, up, back (world space)
uniform vec2 halfTan;  // tan(fov/2) horizontally and vertically
void main() {
  vec3 d = normalize(cam * vec3(uv.x * halfTan.x, uv.y * halfTan.y, -1.0));
  float lon = atan(d.x, -d.z);
  float lat = asin(clamp(d.y, -1.0, 1.0));
  gl_FragColor = texture2D(tex, vec2(lon / 6.2831853 + 0.5, 0.5 - lat / 3.1415927));
}`;

/** Camera basis (right, up, back) for yaw/pitch/roll in degrees. World: x east, y up, z south. */
function basis(yaw, pitch, roll) {
  const y = yaw * RAD, p = pitch * RAD, r = roll * RAD;
  const f = [Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)];
  const r0 = [Math.cos(y), 0, Math.sin(y)]; // cross(f, up) normalised
  const u0 = [-Math.sin(p) * Math.sin(y), Math.cos(p), Math.sin(p) * Math.cos(y)];
  const right = r0.map((v, i) => v * Math.cos(r) + u0[i] * Math.sin(r));
  const up = u0.map((v, i) => v * Math.cos(r) - r0[i] * Math.sin(r));
  return [...right, ...up, ...f.map((v) => -v)];
}

/** Phone orientation (deviceorientation alpha/beta/gamma) → yaw/pitch/roll of the back camera. */
function fromDevice(a, b, g, screenAngle) {
  const cA = Math.cos(a * RAD), sA = Math.sin(a * RAD);
  const cB = Math.cos(b * RAD), sB = Math.sin(b * RAD);
  const cG = Math.cos(g * RAD), sG = Math.sin(g * RAD);
  // Device axes in earth coordinates (east, north, up).
  let X = [cA * cG - sA * sB * sG, cG * sA + cA * sB * sG, -cB * sG];
  let Y = [-cB * sA, cA * cB, sB];
  const Z = [cA * sG + cG * sA * sB, sA * sG - cA * cG * sB, cB * cG];
  const s = screenAngle * RAD;
  [X, Y] = [X.map((v, i) => v * Math.cos(s) + Y[i] * Math.sin(s)), Y.map((v, i) => v * Math.cos(s) - X[i] * Math.sin(s))];
  const toWorld = ([e, n, u]) => [e, u, -n];
  const right = toWorld(X), up = toWorld(Y), f = toWorld(Z).map((v) => -v);
  const pitch = Math.asin(clamp(f[1], -1, 1)) / RAD;
  const yaw = Math.atan2(f[0], -f[2]) / RAD;
  const yr = yaw * RAD, pr = pitch * RAD;
  const r0 = [Math.cos(yr), 0, Math.sin(yr)];
  const u0 = [-Math.sin(pr) * Math.sin(yr), Math.cos(pr), Math.sin(pr) * Math.cos(yr)];
  const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const roll = Math.atan2(dot(right, u0), dot(right, r0)) / RAD;
  return { yaw, pitch, roll, up };
}

export default function panorama(cfg, ctx) {
  const target = { yaw: 0, pitch: 10, fov: 70, ...(cfg.mål ?? {}) };
  const st = { yaw: target.yaw + 160, pitch: 0, roll: 0, fov: 90, ...(cfg.start ?? {}) };
  st.roll = 0;
  const city = cfg.by ?? "Palermo";

  const root = h("div", "app cam pano");
  const top = h("div", "cam-top");
  top.append(h("span", "cam-mode", "FOTO"), h("span", "cam-badge", "📍 " + city));
  const view = h("div", "pano-view");
  const canvas = h("canvas", "pano-canvas");
  const loading = h("p", "sv-loading", `Flyver til ${city}… ✈️`);
  const level = h("div", "cam-level");
  level.append(h("span", "cam-level-l"), h("span", "cam-level-c"), h("span", "cam-level-r"));
  const grid = h("div", "cam-grid");
  const flash = h("div", "cam-flash");
  view.append(canvas, grid, level, flash, loading);

  const motion = button("📱 Løft telefonen som et kamera – tryk her", "sv-motion", () => enableMotion());
  const ref = h("div", "cam-ref");
  const refImg = h("img", "sv-ref");
  refImg.alt = "Det perfekte postkort";
  ref.append(refImg, h("p", "cam-ref-text", cfg.mållabel ?? "Det perfekte postkort ✨"));
  const shutter = button("", "cam-shutter", () => shoot());
  shutter.setAttribute("aria-label", "Tag billede");
  shutter.disabled = true;
  const bar = h("div", "cam-bar");
  bar.append(ref, shutter, h("span", "cam-bar-pad"));
  const msg = h("p", "cam-msg", cfg.besked ?? "Find det perfekte postkort 📸");
  const debugLine = h("p", "face-debug");
  root.append(top, view, motion, bar, msg, ...(DEBUG ? [debugLine] : []));

  let gl = null, prog = null, loc = null;
  let gyro = null; // { yawOffset, raw } once motion is on
  let fallback = null;
  let alive = true;
  let busy = false;

  // ---- WebGL setup
  function initGL(img) {
    gl = canvas.getContext("webgl", { preserveDrawingBuffer: true, antialias: false }) ?? canvas.getContext("experimental-webgl");
    if (!gl) throw new Error("no WebGL");
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const p = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(p);
    gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
    loc = { cam: gl.getUniformLocation(prog, "cam"), halfTan: gl.getUniformLocation(prog, "halfTan") };

    // Phones with a smaller max texture size get a scaled-down copy.
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    let source = img;
    if (img.naturalWidth > max) {
      const c = document.createElement("canvas");
      c.width = max;
      c.height = max / 2;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      source = c;
    }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  function render(s = st, w, hgt) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const cw = w ?? Math.round(view.clientWidth * dpr), ch = hgt ?? Math.round(view.clientHeight * dpr);
    if (!cw || !ch) return;
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    gl.viewport(0, 0, cw, ch);
    const tx = Math.tan((s.fov * RAD) / 2);
    gl.uniform2f(loc.halfTan, tx, (tx * ch) / cw);
    gl.uniformMatrix3fv(loc.cam, false, new Float32Array(basis(s.yaw, s.pitch, s.roll)));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  const snapshot = (s) => {
    render(s, 900, 600);
    const url = canvas.toDataURL("image/jpeg", 0.86);
    canvas.width = 0; // force a resize on the next frame
    return url;
  };

  function frame() {
    if (!alive) return;
    requestAnimationFrame(frame);
    render();
    level.style.setProperty("--r", `${st.roll}deg`);
    level.classList.toggle("ok", Math.abs(st.roll) < TOL.roll);
    if (DEBUG) debugLine.textContent = `${gyro ? `gyro ${gyro.source ?? "–"} ×${gyro.seen}${gyro.compass ? "" : " (intet kompas)"} · ` : ""}debug: yaw ${(((st.yaw % 360) + 360) % 360).toFixed(1)} · pitch ${st.pitch.toFixed(1)} · fov ${st.fov.toFixed(1)} · roll ${st.roll.toFixed(1)}`;
  }

  const useFallback = (why) => {
    console.warn("Panorama:", why?.message ?? why);
    if (fallback || !cfg.reserve) {
      if (!cfg.reserve) loading.textContent = "Panoramaet kunne ikke vises 😕";
      return;
    }
    alive = false;
    fallback = postkort({ by: city, hilsen: cfg.hilsen, til: cfg.til, adresse: cfg.adresse, ...cfg.reserve }, ctx);
    root.replaceWith(fallback.el);
  };

  const img = new Image();
  img.onload = () => {
    try {
      initGL(img);
    } catch (e) {
      return useFallback(e);
    }
    loading.remove();
    refImg.src = snapshot({ ...target, roll: 0 });
    shutter.disabled = false;
    if (!(window.DeviceOrientationEvent && matchMedia("(pointer: coarse)").matches)) motion.hidden = true;
    frame();
  };
  img.onerror = () => useFallback(new Error("image failed"));
  img.src = `/${ctx.slug}/${cfg.billede}`;

  // ---- gyroscope
  const screenAngle = () => (screen.orientation?.angle ?? window.orientation ?? 0);
  // Some Androids only deliver "deviceorientationabsolute", some leave alpha
  // (compass) empty. Lock onto whichever event type delivers data first, and
  // without alpha still follow tilt (turning is then done by dragging).
  const EVENTS = ["deviceorientation", "deviceorientationabsolute"];
  function onOrient(e) {
    if (!gyro) return;
    gyro.seen++;
    if (e.beta == null || e.gamma == null) return;
    if (gyro.source && gyro.source !== e.type) return;
    gyro.source = e.type;
    gyro.compass = e.alpha != null;
    const d = fromDevice(e.alpha ?? 0, e.beta, e.gamma, screenAngle());
    if (gyro.yawOffset == null) gyro.yawOffset = st.yaw - d.yaw; // keep the current view when switching on
    const k = 0.35; // smooth out sensor jitter
    if (gyro.compass) st.yaw += wrap180(d.yaw + gyro.yawOffset - st.yaw) * k;
    st.pitch += (d.pitch - st.pitch) * k;
    st.roll += wrap180(d.roll - st.roll) * k;
  }
  async function enableMotion() {
    try {
      for (const E of [DeviceOrientationEvent, window.DeviceMotionEvent]) {
        if (typeof E?.requestPermission === "function") {
          const ok = await E.requestPermission(); // iPhone asks first
          if (ok !== "granted") throw new Error("denied");
        }
      }
    } catch {
      motion.textContent = "Du skal tillade bevægelse – genindlæs siden og tryk “Tillad” 🙏";
      return;
    }
    stopMotion();
    gyro = { yawOffset: null, seen: 0, source: null, compass: false };
    for (const t of EVENTS) addEventListener(t, onOrient);
    motion.textContent = "📱 Bevæg telefonen for at kigge rundt";
    motion.disabled = true;
    // No usable events after a moment = no gyroscope (or it's blocked).
    setTimeout(() => {
      if (!gyro || gyro.yawOffset != null) {
        if (gyro && !gyro.compass) motion.textContent = "📱 Vip telefonen – og træk i billedet for at dreje 👆";
        return;
      }
      const seen = gyro.seen;
      stopMotion();
      motion.disabled = false;
      motion.textContent = seen
        ? "Sensoren sender ingen data 🤔 Træk i billedet i stedet – eller tryk for at prøve igen"
        : "Ingen bevægelsessensor 🤔 Tjek at “Bevægelsessensorer” er tilladt i browseren – eller træk i billedet 👆";
    }, 3000);
  }
  function stopMotion() {
    for (const t of EVENTS) removeEventListener(t, onOrient);
    gyro = null;
    st.roll = 0;
  }

  // ---- drag to look (adjusts the heading when the gyroscope is on), pinch to zoom
  const pointers = new Map();
  let pinch = null;
  view.addEventListener("pointerdown", (e) => {
    view.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), fov: st.fov };
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
      st.fov = clamp(pinch.fov * (pinch.d / Math.hypot(a.x - b.x, a.y - b.y)), FOV_MIN, FOV_MAX);
      return;
    }
    const degPerPx = st.fov / view.clientWidth;
    if (gyro && gyro.yawOffset != null) {
      if (gyro.compass) gyro.yawOffset -= dx * degPerPx;
      else st.yaw -= dx * degPerPx; // tilt from the sensor, turning by hand
    } else {
      st.yaw -= dx * degPerPx;
      st.pitch = clamp(st.pitch + dy * degPerPx, -80, 80);
    }
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
  };
  view.addEventListener("pointerup", up);
  view.addEventListener("pointercancel", up);
  view.addEventListener("wheel", (e) => {
    e.preventDefault();
    st.fov = clamp(st.fov * Math.exp(e.deltaY * 0.001), FOV_MIN, FOV_MAX);
  }, { passive: false });

  // ---- the photographer's verdict
  function verdict() {
    const dy = wrap180(st.yaw - target.yaw); // + = turned too far right
    const dp = st.pitch - target.pitch; // + = looking too high
    const df = Math.log(st.fov / target.fov); // + = zoomed too far out
    const bad = {
      roll: Math.abs(st.roll) / TOL.roll,
      yaw: Math.abs(dy) / TOL.yaw,
      pitch: Math.abs(dp) / TOL.pitch,
      fov: Math.abs(df) / Math.log(1 + TOL.fov),
    };
    const worst = Math.max(...Object.values(bad));
    const score = Math.min(worst <= 1 ? 10 : 9, Math.max(1, Math.round(10 - (worst - 1) * 0.7)));
    if (worst <= 1) return { ok: true, score };
    let tip;
    if (bad.roll > 1) tip = "Den er skæv! Hold telefonen lige 📐";
    else if (bad.yaw === worst || bad.yaw > 3) tip = dy > 0 ? "Drej lidt til venstre 👈" : "Drej lidt til højre 👉";
    else if (bad.pitch === worst) tip = dp > 0 ? "Lidt længere ned 👇" : "Lidt højere op ☝️";
    else tip = df > 0 ? "Zoom lidt ind 🔍" : "For tæt på – zoom lidt ud 🔍";
    return { ok: false, score, tip };
  }

  function shoot() {
    if (busy || !gl) return;
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
    const photo = snapshot({ ...st });
    stopMotion();
    setTimeout(() => {
      alive = false;
      root.replaceChildren(top, ...postcardView(photo, cfg, ctx.done));
      root.classList.add("done");
      root.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 1200);
  }

  return {
    el: root,
    activate: () => fallback?.activate?.(),
    deactivate: () => {
      fallback?.deactivate?.();
      if (gyro) {
        stopMotion();
        motion.disabled = false;
        motion.textContent = "📱 Løft telefonen som et kamera – tryk her";
      }
    },
  };
}
