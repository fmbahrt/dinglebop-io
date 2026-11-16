// Hold-to-reveal hint button and the hint effects it can trigger.
//
// opgave.json:
//   "knaphint": { "type": "konfetti", "emoji": "🐼" }     emoji confetti burst
//   "knaphint": { "type": "tekst", "tekst": "Kig i køkkenet" }   a short text

const HOLD_MS = 1500;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A small button that fires `onRelease` after being held down for HOLD_MS. */
export function holdButton(onRelease) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-ghost hold-btn";
  btn.setAttribute("aria-label", "Hold knappen inde for et hint");
  const label = document.createElement("span");
  btn.append(label);
  const idle = "💡  Hint";
  label.textContent = idle;

  let progress = 0;    // 0..1
  let holding = false;
  let last = 0;
  let raf = 0;
  let pressedAt = 0;
  let labelTimer = 0;

  const setLabel = (text, ms) => {
    clearTimeout(labelTimer);
    label.textContent = text;
    if (ms) labelTimer = setTimeout(() => (label.textContent = idle), ms);
  };

  const frame = (now) => {
    const dt = now - last;
    last = now;
    // Fill while held, drain (faster) when let go.
    progress = Math.min(1, Math.max(0, progress + (holding ? dt / HOLD_MS : -dt / 400)));
    btn.style.setProperty("--p", progress.toFixed(3));
    if (progress >= 1) {
      holding = false;
      progress = 0;
      btn.style.setProperty("--p", "0");
      btn.classList.remove("holding");
      navigator.vibrate?.([30, 40, 80]);
      setLabel(idle);
      onRelease(btn);
      raf = 0;
      return;
    }
    raf = holding || progress > 0 ? requestAnimationFrame(frame) : 0;
  };

  const start = (e) => {
    if (holding) return;
    e.preventDefault();
    holding = true;
    pressedAt = performance.now();
    btn.classList.add("holding");
    setLabel("Bliv ved…");
    navigator.vibrate?.(15);
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };
  const stop = () => {
    if (!holding) return;
    holding = false;
    btn.classList.remove("holding");
    const quickTap = performance.now() - pressedAt < 350;
    setLabel(quickTap ? "Hold den inde 👆" : idle, quickTap ? 1600 : 0);
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };

  btn.addEventListener("pointerdown", start);
  btn.addEventListener("pointerup", stop);
  btn.addEventListener("pointerleave", stop);
  btn.addEventListener("pointercancel", stop);
  btn.addEventListener("contextmenu", (e) => e.preventDefault()); // long-press menu on Android
  btn.addEventListener("keydown", (e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) start(e); });
  btn.addEventListener("keyup", (e) => { if (e.key === " " || e.key === "Enter") stop(); });
  return btn;
}

/** Runs the configured hint. `origin` is the element the effect springs from. */
export function runHint(config, origin) {
  const run = HINTS[config?.type];
  if (run) run(config, origin);
  else console.warn("Ukendt knaphint-type:", config?.type);
}

const HINTS = {
  konfetti: (cfg, origin) => emojiConfetti(cfg.emoji ?? "🎉", origin, cfg.antal ?? 80),
  tekst: (cfg, origin) => textBubble(cfg.tekst ?? "", origin),
};

// ---------- effects ----------

function textBubble(text, origin) {
  const host = origin.closest(".task-actions") ?? origin.parentElement;
  host.parentElement.querySelector(".hint-bubble")?.remove();
  const p = document.createElement("p");
  p.className = "hint-bubble";
  p.textContent = text;
  host.after(p);
}

function emojiConfetti(emoji, origin, count) {
  const canvas = document.createElement("canvas");
  canvas.className = "confetti";
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(canvas);
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const W = innerWidth, H = innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);

  // Pre-render the emoji once; drawing an image is much cheaper than fillText per frame.
  const SPRITE = 96;
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = SPRITE;
  const sctx = sprite.getContext("2d");
  sctx.font = `${SPRITE * 0.8}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  sctx.textAlign = "center";
  sctx.textBaseline = "middle";
  sctx.fillText(emoji, SPRITE / 2, SPRITE / 2 + SPRITE * 0.05);

  const r = origin.getBoundingClientRect();
  const ox = r.left + r.width / 2, oy = r.top + r.height / 2;
  const rand = (a, b) => a + Math.random() * (b - a);

  const parts = Array.from({ length: count }, (_, i) => {
    // Half burst from the button, half rain from the top for a full-screen feel.
    if (reducedMotion) return { x: rand(0, W), y: rand(0, H), vx: 0, vy: 0, size: rand(22, 46), rot: rand(-0.4, 0.4), vr: 0, wobble: 0 };
    const fromButton = i % 2 === 0;
    const angle = rand(-Math.PI * 0.85, -Math.PI * 0.15);
    const speed = rand(500, 1100);
    return {
      x: fromButton ? ox : rand(0, W),
      y: fromButton ? oy : rand(-H * 0.6, -20),
      vx: fromButton ? Math.cos(angle) * speed : rand(-60, 60),
      vy: fromButton ? Math.sin(angle) * speed : rand(80, 260),
      size: rand(22, 46),
      rot: rand(0, Math.PI * 2),
      vr: rand(-4, 4),
      wobble: rand(0, Math.PI * 2),
    };
  });

  const DURATION = reducedMotion ? 2200 : 4200;
  const t0 = performance.now();
  let last = t0;

  const draw = (now) => {
    const t = now - t0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, W, H);
    const fade = Math.min(1, Math.max(0, (DURATION - t) / 800));
    for (const p of parts) {
      if (!reducedMotion) {
        p.vy += 900 * dt;                  // gravity
        p.vx *= 1 - 0.9 * dt;              // air drag
        p.vy = Math.min(p.vy, 520);        // terminal velocity, so they float down
        p.wobble += dt * 4;
        p.x += (p.vx + Math.sin(p.wobble) * 40) * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
      }
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.drawImage(sprite, -p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
    if (t < DURATION) requestAnimationFrame(draw);
    else canvas.remove();
  };
  requestAnimationFrame(draw);
}
