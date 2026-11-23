// Step "sang": Finn's melody lock. Each lock is a Christmas song as an emoji
// riddle; she guesses the song and hums it into the phone's microphone. Pitch
// detection runs in the browser (YIN), the hummed notes become steps up and down,
// and those are matched (fuzzy, like "hum to search") against every song in the
// step, continuously: she can hum any part of the song, for as long as it
// takes; the lock clicks open as soon as Finn is sure (about 8 notes that fit),
// a meter shows how sure he is, and a pause just starts a new attempt.
// Any key or octave works, and a bit off-key is fine.
//
//   { "type": "sang", "tekst": "…",
//     "runder": [
//       { "emoji": "🔔🔔🔔 🛷💨", "titel": "Jingle Bells", "toner": [0, 3, -4, -2, 0, …] },
//       … ] }
//
// "toner" are semitones relative to the first note, with repeated notes merged
// (humming doesn't separate them). Get them from a MIDI file with
// tools/midi2toner.mjs (use a whole verse or chorus). "grænse" (default 1.1)
// is how far off (average semitones per step) a hum may be. With ?debug the match scores are shown and
// there is a recorder that turns a hum into "toner".

import { h, button, DEBUG, mediaError } from "/felles.js";

const MIN_HZ = 75, MAX_HZ = 1100;
const toMidi = (f) => 69 + 12 * Math.log2(f / 440);
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "H"];
const noteName = (m) => NAMES[((Math.round(m) % 12) + 12) % 12];

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
    if (!seg || Math.abs(m - mid) > 0.6) seg = { vals: [], sent: false };
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
      // The audio context is made and resumed right away (iOS wants that inside
      // the tap), but not awaited before asking for the mic (Android is happier
      // when getUserMedia comes first).
      ctx ??= new AudioContext();
      const resumed = ctx.resume().catch(() => {});
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      await resumed;
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


// ---------- matching a hum against the songs ----------

/** Merge repeated notes (as in the "toner" lists). */
function collapse(notes) {
  const out = [];
  for (const n of notes) if (!out.length || Math.abs(n - out.at(-1)) > 0.5) out.push(n);
  return out;
}
const steps = (a) => a.slice(1).map((n, i) => n - a[i]);

const WINDOW = 12; // the last this many steps of the hum are matched
const NEED = 7;    // steps (8 notes) before Finn will decide

/**
 * How far a hum (its steps) is from the best-fitting part of a song (its steps),
 * as average semitones per step; lower is better. The hum may start and end
 * anywhere in the song. Alignment with skips, so a missed or extra note costs
 * a bit instead of ruining it.
 */
function distance(hum, ref) {
  const SKIP = 2;
  const cost = (a, b) => {
    const d = Math.abs(a - b);
    return Math.min(d, Math.abs(d - 12), 4); // an octave slip is forgiven
  };
  const n = hum.length, m = ref.length;
  if (!n) return Infinity;
  let prev = new Float64Array(m + 1); // row 0: starting anywhere in the song is free
  for (let i = 1; i <= n; i++) {
    const row = new Float64Array(m + 1);
    row[0] = i * SKIP;
    for (let j = 1; j <= m; j++) {
      row[j] = Math.min(prev[j - 1] + cost(hum[i - 1], ref[j - 1]), prev[j] + SKIP, row[j - 1] + SKIP);
    }
    prev = row;
  }
  return Math.min(...prev) / n; // …and ending anywhere
}

/** Every song, best match first: [{ song, d }], for the last WINDOW steps of the hum. */
function rank(notes, songs) {
  const hum = steps(collapse(notes).slice(-(WINDOW + 1)));
  return songs.map((song) => ({ song, d: distance(hum, steps(song.toner)) })).sort((a, b) => a.d - b.d);
}

export default function sang(cfg, { done }) {
  const rounds = (cfg.runder ?? []).map((r) => ({ ...r, toner: (r.toner ?? []).map(Number) }));
  const limit = Number(cfg.grænse ?? 1.1);

  const root = h("div", "app sl");
  const head = h("div", "sl-head");
  const lockIcon = h("div", "sl-lock", "🔒");
  const shackles = h("div", "sl-rounds");
  head.append(lockIcon, shackles);
  const riddle = h("p", "sl-riddle");
  const title = h("p", "sl-title");
  const canvas = h("canvas", "sl-canvas");
  const dots = h("div", "sl-notes"); // the notes Finn has heard, by name
  const msg = h("p", "sl-msg");
  const startBtn = button("🎤 Start mikrofonen", "btn sl-start", () => begin());
  // How sure Finn is (fills up while she hums the right song).
  const meter = h("div", "sl-meter");
  const meterFill = h("span", "sl-meter-fill");
  const meterText = h("span", "sl-meter-text", "Finn genkender… 0 %");
  meter.append(meterFill, meterText);
  const restart = button("↺ Forfra", "sl-again", () => listen("Forfra – nyn fra starten 🎶"));
  const tools = h("div", "sl-tools");
  tools.append(restart);
  tools.hidden = true;
  const way = button("Låsen hører ikke efter? Lad Finn åbne den", "fj-anyway", () => (mic.live ? nextRound() : finish()));
  way.hidden = true;
  const debugLine = DEBUG ? h("p", "face-debug sl-debug", "debug: mikrofonen er slukket") : null;
  const scores = DEBUG ? h("p", "face-debug sl-scores", "") : null;
  root.append(
    ...(cfg.tekst ? [h("p", "sl-intro", cfg.tekst)] : []),
    head, riddle, title, canvas, dots, meter, msg, startBtn, tools, way,
    ...(debugLine ? [debugLine, scores] : []),
  );

  let r = -1;          // current lock
  let notes = [];      // hummed notes in this attempt
  let lastNoteAt = 0;
  let judging = false;
  let trace = [];      // [{ t, m }] for the drawing
  let wayTimer = 0, raf = 0, quietTimer = 0;
  let lastVoiced = 0;   // last frame with a pitch (to judge after a real pause)
  let waitQuiet = false; // after a verdict: ignore humming until she has paused
  const mic = listener({ onFrame, onNote });

  function drawRounds() {
    shackles.replaceChildren(...rounds.map((_, k) => h("span", k < r ? "done" : k === r ? "on" : "")));
  }
  function drawDots() {
    const heard = collapse(notes);
    if (!heard.length) return dots.replaceChildren(h("span", "sl-notes-empty", "Toner Finn hører: …"));
    // The notes Finn is matching (the last WINDOW+1) light up with the meter,
    // Guitar Hero style; older ones fade out.
    dots.replaceChildren(...heard.slice(-16).map((m, k, a) => {
      const back = a.length - 1 - k;
      const chip = h("span", `sl-note${back === 0 ? " last" : ""}${back <= WINDOW ? " in" : ""}`, noteName(m));
      chip.style.setProperty("--i", String(back));
      return chip;
    }));
  }

  function showRound() {
    const round = rounds[r];
    riddle.textContent = round.emoji ?? "🎵";
    riddle.classList.remove("pop");
    void riddle.offsetWidth;
    riddle.classList.add("pop");
    title.textContent = round.tekst ?? `Lås ${r + 1}: Hvilken julesang er det? Nyn en bid af den – hvor som helst i sangen 🎶`;
    drawRounds();
    clearTimeout(wayTimer);
    wayTimer = setTimeout(() => (way.hidden = false), Number(cfg.nødudgang ?? 300) * 1000);
    listen("");
  }

  /** A fresh attempt. */
  function listen(text) {
    notes = [];
    lastNoteAt = 0;
    judging = false;
    clearTimeout(quietTimer);
    msg.className = "sl-msg";
    msg.textContent = text;
    setMeter(0);
    drawDots();
  }
  function setMeter(p) {
    meterFill.style.transform = `scaleX(${p.toFixed(3)})`;
    meterText.textContent = `Finn genkender… ${Math.round(p * 100)} %`;
    meter.classList.toggle("warm", p > 0.5);
    heat = p;
    dots.style.setProperty("--heat", p.toFixed(3));
    dots.classList.toggle("hot", p > 0.75);
    if (p === 0) dots.classList.remove("hit");
  }
  /** Meter → colour: blue (cold) → green → gold (about to click). */
  const heatHue = (p) => 200 - 155 * p;

  async function begin() {
    startBtn.disabled = true;
    msg.textContent = "Starter mikrofonen…";
    try {
      await mic.start();
    } catch (e) {
      startBtn.disabled = false;
      msg.textContent = mediaError(e, "mikrofonen");
      way.hidden = false;
      return;
    }
    startBtn.hidden = true;
    tools.hidden = false;
    msg.textContent = "";
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(draw);
    if (r < 0) nextRound();
  }

  function onNote(m) {
    if (recording) return record(m);
    if (judging || waitQuiet || r < 0 || r >= rounds.length) return;
    notes.push(m);
    lastNoteAt = performance.now();
    if (!msg.textContent || msg.classList.contains("bad")) {
      msg.className = "sl-msg";
      msg.textContent = "Finn lytter… 👂";
    }
    drawDots();
    judge();
  }

  /** After every note: is it the right song yet, or clearly another one? */
  function judge() {
    if (judging || r < 0 || r >= rounds.length) return;
    const k = collapse(notes).length - 1; // steps hummed so far
    if (k < 3) return setMeter(0);
    const ranking = rank(notes, rounds);
    const target = rounds[r];
    const mine = ranking.find((x) => x.song === target);
    const other = ranking.find((x) => x.song !== target);
    if (scores) scores.textContent = `debug: ${ranking.map(({ song, d }) => `${song.titel ?? song.emoji} ${d.toFixed(2)}`).join(" · ")} (grænse ${limit}, ${k} spring) · noter ${collapse(notes).slice(-(WINDOW + 1)).map(noteName).join(" ")}`;
    // The meter shows what actually opens the lock: close enough AND the best of
    // the songs. (If another song fits better it stays below 100 %.)
    const fit = Math.max(0, Math.min(1, (2 - mine.d) / (2 - limit)));
    const best = !other || mine.d <= other.d;
    setMeter(Math.min(1, k / NEED) * fit * (best ? 1 : 0.9));

    if (k >= NEED && mine.d <= limit && best) {
      judging = true;
      setMeter(1);
      dots.classList.add("hit");
      navigator.vibrate?.([30, 50, 120]);
      msg.className = "sl-msg ok";
      msg.textContent = `Klik! 🔓 ${target.titel ?? ""} ${target.emoji ?? ""}`.trim();
      return setTimeout(() => nextRound(), 1600);
    }
    if (k >= NEED + 1 && other && other.d <= limit && other.d < mine.d - 0.4) {
      navigator.vibrate?.(120);
      msg.className = "sl-msg bad";
      msg.textContent = `Det lyder som ${other.song.titel}… men det er ikke den, jeg tænker på 🐾`;
      notes = [];
      waitQuiet = true; // a fresh start once she pauses
      setMeter(0);
      drawDots();
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
    clearTimeout(quietTimer);
    r = rounds.length;
    drawRounds();
    mic.stop();
    cancelAnimationFrame(raf);
    lockIcon.textContent = "🔓";
    lockIcon.classList.add("open");
    riddle.replaceChildren(...rounds.map((x) => h("span", "sl-solved", `${x.emoji ?? "🎵"}  ${x.titel ?? ""}`)));
    title.textContent = cfg.åben ?? "Melodilåsen er åben! 🎉";
    msg.textContent = "";
    for (const e of [tools, canvas, dots, meter, way]) e.hidden = true;
    navigator.vibrate?.([30, 50, 120]);
    videre?.remove();
    videre = button("Videre ✓", "btn", done);
    root.append(videre);
  }
  let videre = null;

  /** Debug: start the melody lock over from lock 1. */
  function restartLock() {
    clearTimeout(quietTimer);
    r = -1;
    videre?.remove();
    videre = null;
    lockIcon.textContent = "🔒";
    lockIcon.classList.remove("open", "click");
    for (const e of [canvas, dots, meter]) e.hidden = false;
    if (mic.live) {
      tools.hidden = false;
      nextRound();
    } else {
      riddle.textContent = "";
      title.textContent = "";
      startBtn.hidden = false;
      startBtn.disabled = false;
      drawRounds();
    }
  }

  // ---- the SingStar-ish trace: her pitch over the last few seconds
  function onFrame(m) {
    const t = performance.now();
    trace.push({ t, m });
    while (trace.length && t - trace[0].t > 4000) trace.shift();
    if (m != null) lastVoiced = t;
    // A pause just means a new attempt (no penalty, nothing to judge).
    const quiet = t - lastVoiced;
    if (waitQuiet && quiet > 700) waitQuiet = false;
    if (!judging && notes.length && quiet > 1800) {
      notes = [];
      setMeter(0);
      drawDots();
    }
  }

  // Piano roll: every held note is a bar on its nearest semitone, with its name.
  let viewCentre = null;
  let heat = 0, glow = 0; // meter value, and the smoothed glow drawn from it
  const sparks = [];
  function draw() {
    raf = requestAnimationFrame(draw);
    if (debugLine) {
      const { rms, hz, notes: n } = mic.info;
      debugLine.textContent = `debug: niveau ${rms.toFixed(3)} · ${hz ? `${Math.round(hz)} Hz (${noteName(toMidi(hz))}, ${toMidi(hz).toFixed(1)})` : "ingen tone"} · ${n} toner hørt`;
    }
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W) return;
    if (canvas.width !== W * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; }
    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    // Group the frames into bars (a held note), quantized to a semitone.
    const bars = [];
    let cur = null;
    for (const p of trace) {
      if (p.m == null) { cur = null; continue; }
      if (cur && Math.abs(p.m - cur.mean) < 0.6) {
        cur.mean += (p.m - cur.mean) / ++cur.n;
        cur.t1 = p.t;
      } else {
        cur = { t0: p.t, t1: p.t, mean: p.m, n: 1 };
        bars.push(cur);
      }
    }
    for (const bar of bars) bar.note = Math.round(bar.mean);
    const live = trace.at(-1)?.m != null ? bars.at(-1) : null;

    // Which semitones are on screen: follow her, but only when she leaves the view.
    const ROWS = 13, half = (ROWS - 1) / 2;
    const recent = bars.at(-1)?.note;
    if (viewCentre == null && recent != null) viewCentre = recent;
    if (recent != null && Math.abs(recent - viewCentre) > half - 1) viewCentre = recent;
    const c = viewCentre ?? 60;
    const lane = H / ROWS, gutter = 30;
    const yOf = (n) => (half - (n - c)) * lane;

    g.font = `600 ${Math.min(12, lane * 0.62)}px system-ui, sans-serif`;
    g.textBaseline = "middle";
    for (let k = -half; k <= half; k++) {
      const n = c + k, y = yOf(n);
      const black = NAMES[((n % 12) + 12) % 12].includes("#");
      g.fillStyle = live && live.note === n ? "rgba(127, 209, 255, .18)" : black ? "rgba(0, 0, 0, .25)" : "rgba(255, 255, 255, .035)";
      g.fillRect(gutter, y, W - gutter, lane);
      g.fillStyle = live && live.note === n ? "#7fd1ff" : black ? "rgba(255,255,255,.35)" : "rgba(255,255,255,.6)";
      g.textAlign = "right";
      g.fillText(noteName(n), gutter - 6, y + lane / 2);
    }

    glow += (heat - glow) * 0.12;
    const hue = heatHue(glow);
    const now = performance.now();
    const x = (t) => gutter + (W - gutter) * 0.9 - ((now - t) / 3500) * (W - gutter) * 0.9;
    for (const bar of bars) {
      if (bar.note < c - half || bar.note > c + half) continue;
      const x0 = Math.max(gutter, x(bar.t0)), x1 = x(bar.t1) + 4;
      if (x1 <= gutter + 2) continue;
      const y = yOf(bar.note) + 2, w = Math.max(6, x1 - x0), hh = lane - 4;
      // The hotter Finn's guess, the warmer and brighter the bars glow.
      g.fillStyle = bar === live ? `hsl(${hue} 100% ${88 + glow * 8}%)` : `hsl(${hue} ${70 + glow * 30}% ${68 + glow * 6}%)`;
      g.shadowColor = `hsl(${hue} 100% 60%)`;
      g.shadowBlur = glow * 22 + (bar === live ? 6 : 0);
      g.beginPath();
      g.roundRect(x0, y, w, hh, Math.min(6, hh / 2));
      g.fill();
      g.shadowBlur = 0;
      // On fire: sparks fly off the note she's holding.
      if (bar === live && glow > 0.6 && Math.random() < glow) {
        sparks.push({ x: x1, y: y + hh / 2, vx: -0.5 - Math.random() * 1.5, vy: (Math.random() - 0.5) * 2.4, life: 1 });
      }
      if (w > 18) {
        g.fillStyle = "#0d0b16";
        g.textAlign = "left";
        g.fillText(noteName(bar.note), x0 + 5, y + hh / 2);
      }
    }
    for (let k = sparks.length - 1; k >= 0; k--) {
      const s = sparks[k];
      s.x += s.vx; s.y += s.vy; s.vy += 0.05; s.life -= 0.035;
      if (s.life <= 0) { sparks.splice(k, 1); continue; }
      g.fillStyle = `hsl(${hue - 10} 100% ${60 + s.life * 30}% / ${s.life})`;
      g.beginPath();
      g.arc(s.x, s.y, 1 + s.life * 2.2, 0, Math.PI * 2);
      g.fill();
    }
  }

  // ---- debug: record a hum → "toner"
  let recording = null;
  const recBox = h("div", "sl-rec");
  if (DEBUG) {
    const out = h("pre", "sl-rec-out");
    const recBtn = button("🎙 Optag melodi (debug)", "debug-skip", async () => {
      if (!recording) {
        if (!mic.live) await begin().catch(() => {});
        recording = [];
        out.textContent = "Nyn nu… tryk igen for at stoppe";
        recBtn.textContent = "⏹ Stop optagelse";
      } else {
        const rec = collapse(recording);
        recording = null;
        recBtn.textContent = "🎙 Optag melodi (debug)";
        out.textContent = `"toner": ${JSON.stringify(rec.map((m) => Math.round(m - rec[0])))}`;
      }
    });
    recBox.append(button("↺ Genstart melodilåsen (debug)", "debug-skip", restartLock), recBtn, out);
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
      clearTimeout(quietTimer);
    },
  };
}
