// Step "sang": Finn's melody lock. The phone's microphone listens (pitch
// detection runs in the browser); she sings melodies back to open the lock.
// Notes are semitones relative to the first one, so any key and any octave works;
// only the steps up and down have to be right.
//
//   { "type": "sang", "overskrift": "Finns melodilås 🎤", "tekst": "…",
//     "runder": [
//       { "toner": [0, 4, 7], "spil": true, "tekst": "Finn hyler. Syng efter!" },
//       { "toner": [0, 2, 4, 2, 0], "spil": false, "guide": false, "tekst": "…" } ] }
//
// "spil": Finn plays the notes first (and the next note is shown as a bar).
// "guide": false hides the bar (the last round: she has to know the song).
// "tolerance" (semitones, default 1.4) and "grundtone" (MIDI, default 62) are optional.
// With ?debug there is a recorder: sing a melody and copy its "toner".

import { h, button, DEBUG } from "/felles.js";

const MIN_HZ = 75, MAX_HZ = 1100;
const toMidi = (f) => 69 + 12 * Math.log2(f / 440);
const toHz = (m) => 440 * 2 ** ((m - 69) / 12);

/** YIN pitch detection. Returns Hz, or 0 if there is no clear pitch. */
function yin(buf, sr) {
  const maxTau = Math.min(Math.floor(sr / MIN_HZ), buf.length >> 1);
  const minTau = Math.floor(sr / MAX_HZ);
  const n = buf.length - maxTau;
  const d = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const x = buf[i] - buf[i + tau];
      s += x * x;
    }
    d[tau] = s;
  }
  let run = 0;
  d[0] = 1;
  for (let tau = 1; tau <= maxTau; tau++) {
    run += d[tau];
    d[tau] = run ? (d[tau] * tau) / run : 1;
  }
  for (let tau = minTau; tau < maxTau; tau++) {
    if (d[tau] < 0.15) {
      while (tau + 1 < maxTau && d[tau + 1] < d[tau]) tau++;
      const a = d[tau - 1], b = d[tau], c = d[tau + 1];
      const shift = (a - c) / (2 * (a - 2 * b + c)) || 0;
      return sr / (tau + (Math.abs(shift) < 1 ? shift : 0));
    }
  }
  return 0;
}

/**
 * Microphone → stream of sung notes. onFrame(midi|null) ~40×/s for the trace,
 * onNote(midi) once per held note (about 1/8 s steady).
 */
function listener({ onFrame, onNote }) {
  let ctx = null, stream = null, timer = 0, muted = 0;
  const buf = new Float32Array(2048);
  let seg = null, quiet = 0;
  const info = { rms: 0, hz: 0, notes: 0 };

  function tick(an) {
    an.getFloatTimeDomainData(buf);
    let rms = 0;
    for (const v of buf) rms += v * v;
    rms = Math.sqrt(rms / buf.length);
    const f = rms > 0.012 && performance.now() > muted ? yin(buf, ctx.sampleRate) : 0;
    info.rms = rms;
    info.hz = f;
    const m = f ? toMidi(f) : null;
    onFrame(m);
    if (m == null) {
      if (++quiet >= 4) seg = null;
      return;
    }
    quiet = 0;
    const mid = seg && median(seg.vals);
    if (!seg || Math.abs(m - mid) > 0.9) seg = { vals: [], sent: false };
    seg.vals.push(m);
    if (seg.vals.length > 9) seg.vals.shift();
    if (!seg.sent && seg.vals.length >= 5) {
      seg.sent = true;
      info.notes++;
      onNote(median(seg.vals));
    }
  }

  return {
    async start() {
      ctx ??= new AudioContext();
      await ctx.resume();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 2048;
      // Keep the graph pulled (some browsers don't run nodes that lead nowhere), silently.
      const sink = ctx.createGain();
      sink.gain.value = 0;
      src.connect(an).connect(sink).connect(ctx.destination);
      clearInterval(timer);
      timer = setInterval(() => tick(an), 25);
    },
    stop() {
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      seg = null;
    },
    /** Ignore the mic for ms (while Finn's own howl comes out of the speaker). */
    mute(ms) {
      muted = performance.now() + ms;
      seg = null;
    },
    get ctx() { return ctx; },
    info,
    get live() { return !!stream; },
  };
}

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
}

/** Finn howls the notes (a sine with a bit of vibrato and a glide). Returns its length in ms. */
function howl(ctx, notes, base) {
  const t0 = ctx.currentTime + 0.05, step = 0.5;
  const osc = ctx.createOscillator();
  const vib = ctx.createOscillator();
  const vibGain = ctx.createGain();
  const g = ctx.createGain();
  osc.type = "triangle";
  vib.frequency.value = 5.5;
  vibGain.gain.value = 6;
  vib.connect(vibGain).connect(osc.frequency);
  osc.connect(g).connect(ctx.destination);
  g.gain.setValueAtTime(0, t0);
  notes.forEach((n, i) => {
    const t = t0 + i * step;
    osc.frequency.setTargetAtTime(toHz(base + n), t, i ? 0.03 : 0.001);
    g.gain.setTargetAtTime(0.22, t, 0.02);
    g.gain.setTargetAtTime(0.05, t + step - 0.08, 0.02);
  });
  const end = t0 + notes.length * step;
  g.gain.setTargetAtTime(0, end - 0.05, 0.05);
  osc.start(t0);
  vib.start(t0);
  osc.stop(end + 0.3);
  vib.stop(end + 0.3);
  return (end - ctx.currentTime) * 1000 + 300;
}

export default function sang(cfg, { done }) {
  const rounds = (cfg.runder ?? []).map((r) => ({ ...r, toner: (r.toner ?? []).map(Number) }));
  const tol = Number(cfg.tolerance ?? 1.4);
  const base = Number(cfg.grundtone ?? 62);

  const root = h("div", "app sl");
  const head = h("div", "sl-head");
  const lockIcon = h("div", "sl-lock", "🔒");
  const shackles = h("div", "sl-rounds");
  head.append(lockIcon, shackles);
  const title = h("p", "sl-title");
  const canvas = h("canvas", "sl-canvas");
  const pins = h("div", "sl-pins");
  const msg = h("p", "sl-msg");
  const startBtn = button("🎤 Start mikrofonen", "btn sl-start", () => begin());
  const again = button("🐶 Hør Finn igen", "sl-again", () => play());
  again.hidden = true;
  const restart = button("↺ Forfra", "sl-again", () => resetRound("Forfra – syng hele stykket 🎶"));
  restart.hidden = true;
  const tools = h("div", "sl-tools");
  tools.append(again, restart);
  const way = button("Låsen hører ikke efter? Lad Finn åbne den", "fj-anyway", () => (mic.live ? nextRound() : finish()));
  way.hidden = true;
  const debugLine = DEBUG ? h("p", "face-debug sl-debug", "debug: mikrofonen er slukket") : null;
  root.append(
    ...(cfg.tekst ? [h("p", "sl-intro", cfg.tekst)] : []),
    head, title, canvas, pins, msg, startBtn, tools, way, ...(debugLine ? [debugLine] : []),
  );

  let r = -1;          // current round
  let i = 0;           // next note in the round
  let last = null;     // midi of the last hit (sung)
  let lastAt = 0;      // when the last hit was
  let trace = [];      // [{ t, m }] for the drawing
  let wayTimer = 0;
  let raf = 0;
  const mic = listener({ onFrame, onNote });

  function drawRounds() {
    shackles.replaceChildren(...rounds.map((_, k) => h("span", k < r ? "done" : k === r ? "on" : "")));
  }

  function showRound() {
    const round = rounds[r];
    i = 0;
    last = null;
    title.textContent = round.tekst ?? (round.spil ? "Finn hyler. Syng efter! 🐶" : "Syng melodien 🎶");
    pins.replaceChildren(...round.toner.map(() => h("span", "sl-pin")));
    again.hidden = !round.spil;
    restart.hidden = false;
    drawRounds();
    clearTimeout(wayTimer);
    wayTimer = setTimeout(() => (way.hidden = false), Number(cfg.nødudgang ?? 300) * 1000);
    if (round.spil) setTimeout(play, 500);
  }

  function play() {
    const round = rounds[r];
    if (!mic.ctx || !round) return;
    resetRound("");
    const ms = howl(mic.ctx, round.toner, base);
    mic.mute(ms);
    msg.textContent = "🐶 Auuuu…";
    setTimeout(() => { if (msg.textContent === "🐶 Auuuu…") msg.textContent = "Din tur! 🎤"; }, ms);
  }

  function resetRound(text) {
    i = 0;
    last = null;
    pins.querySelectorAll(".sl-pin").forEach((p) => p.classList.remove("hit"));
    if (text != null) msg.textContent = text;
  }

  async function begin() {
    startBtn.disabled = true;
    msg.textContent = "Starter mikrofonen…";
    try {
      await mic.start();
    } catch {
      startBtn.disabled = false;
      msg.textContent = "Jeg fik ikke lov at bruge mikrofonen. Tryk igen og vælg \"Tillad\" 🎤";
      way.hidden = false;
      return;
    }
    startBtn.hidden = true;
    msg.textContent = "";
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(draw);
    if (r < 0) nextRound();
  }

  function onNote(m) {
    if (recording) return record(m);
    const round = rounds[r];
    if (!round || i >= round.toner.length) return;
    const now = performance.now();
    if (i > 0 && now - lastAt > 3500) resetRound("Forfra – syng hele stykket i ét 🎶");
    if (i === 0) return hit(m, now);
    const expected = last + (round.toner[i] - round.toner[i - 1]);
    // Octave slips (the pitch detector or her voice jumping) are forgiven.
    const d = ((((m - expected) % 12) + 18) % 12) - 6;
    if (Math.abs(d) <= tol) hit(expected + d, now);
  }

  function hit(m, now) {
    last = m;
    lastAt = now;
    const pin = pins.children[i];
    pin?.classList.add("hit");
    navigator.vibrate?.(12);
    i++;
    if (i >= rounds[r].toner.length) {
      msg.textContent = "Klik! 🔓";
      setTimeout(() => nextRound(), 900);
    }
  }

  function nextRound() {
    r++;
    way.hidden = true;
    if (r >= rounds.length) return finish();
    if (r > 0) {
      lockIcon.classList.remove("click");
      void lockIcon.offsetWidth;
      lockIcon.classList.add("click");
    }
    showRound();
  }

  function finish() {
    clearTimeout(wayTimer);
    drawRounds();
    mic.stop();
    cancelAnimationFrame(raf);
    lockIcon.textContent = "🔓";
    lockIcon.classList.add("open");
    title.textContent = cfg.åben ?? "Melodilåsen er åben! 🎉";
    msg.textContent = "";
    tools.hidden = true;
    canvas.hidden = true;
    pins.hidden = true;
    navigator.vibrate?.([30, 50, 120]);
    root.append(button("Videre ✓", "btn", done));
  }

  // ---- the SingStar-ish trace: her pitch over the last few seconds
  function onFrame(m) {
    const t = performance.now();
    trace.push({ t, m });
    while (trace.length && t - trace[0].t > 4000) trace.shift();
  }

  function draw() {
    raf = requestAnimationFrame(draw);
    if (debugLine) {
      const { rms, hz, notes } = mic.info;
      debugLine.textContent = `debug: niveau ${rms.toFixed(3)} · ${hz ? `${Math.round(hz)} Hz (${toMidi(hz).toFixed(1)})` : "ingen tone"} · ${notes} toner hørt · ${mic.ctx?.sampleRate} Hz`;
    }
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W) return;
    if (canvas.width !== W * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; }
    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const voiced = trace.filter((p) => p.m != null).map((p) => p.m);
    const centre = last ?? (voiced.length ? median(voiced) : base);
    const span = 14; // semitones on screen
    const y = (m) => H / 2 - ((m - centre) / span) * H;
    // lanes
    g.strokeStyle = "rgba(255,255,255,.06)";
    for (let k = -7; k <= 7; k++) { g.beginPath(); g.moveTo(0, y(centre + k)); g.lineTo(W, y(centre + k)); g.stroke(); }
    const now = performance.now();
    const x = (t) => W * 0.75 - ((now - t) / 3000) * W * 0.75;
    // the next note to hit (rounds with a guide)
    const round = rounds[r];
    if (round && last != null && i < round.toner.length && round.guide !== false) {
      const target = last + (round.toner[i] - round.toner[i - 1]);
      g.fillStyle = "rgba(255, 214, 10, .35)";
      g.strokeStyle = "#ffd60a";
      const bh = H / span;
      g.beginPath();
      g.roundRect(W * 0.62, y(target) - bh / 2, W * 0.32, bh, bh / 2);
      g.fill();
      g.stroke();
    }
    // her voice
    g.strokeStyle = "#7fd1ff";
    g.lineWidth = 4;
    g.lineCap = "round";
    g.beginPath();
    let pen = false;
    for (const p of trace) {
      if (p.m == null) { pen = false; continue; }
      if (pen) g.lineTo(x(p.t), y(p.m));
      else g.moveTo(x(p.t), y(p.m));
      pen = true;
    }
    g.stroke();
    const lastP = trace.at(-1);
    if (lastP?.m != null) {
      g.fillStyle = "#fff";
      g.beginPath();
      g.arc(x(lastP.t), y(lastP.m), 6, 0, Math.PI * 2);
      g.fill();
    }
  }

  // ---- debug: record a melody → "toner"
  let recording = null;
  const recBox = h("div", "sl-rec");
  if (DEBUG) {
    const out = h("pre", "sl-rec-out");
    const recBtn = button("🎙 Optag melodi (debug)", "debug-skip", async () => {
      if (!recording) {
        if (!mic.live) await begin().catch(() => {});
        recording = [];
        out.textContent = "Syng nu… tryk igen for at stoppe";
        recBtn.textContent = "⏹ Stop optagelse";
      } else {
        const notes = recording;
        recording = null;
        recBtn.textContent = "🎙 Optag melodi (debug)";
        const rel = notes.map((m) => Math.round(m - notes[0])).filter((n, k, a) => k === 0 || n !== a[k - 1]);
        out.textContent = `"toner": ${JSON.stringify(rel)}`;
      }
    });
    recBox.append(recBtn, out);
    root.append(recBox);
  }
  function record(m) {
    recording.push(m);
    recBox.querySelector("pre").textContent = `${recording.length} toner…`;
  }

  return {
    el: root,
    deactivate: () => {
      mic.stop();
      cancelAnimationFrame(raf);
      clearTimeout(wayTimer);
    },
  };
}
