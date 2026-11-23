// Sound effects made with Web Audio (no files).

/**
 * The portal's sound, made with Web Audio (no files): open = a whoosh that
 * rises into a sparkly chime as she's pulled through (≈0.9 s, until the page
 * changes); locked = a dull clunk.
 */
let sfx = null;
export function portalSound(open) {
  try {
    sfx ??= new AudioContext();
    sfx.resume();
  } catch { return; }
  const ctx = sfx, t = ctx.currentTime + 0.02;
  const out = ctx.createGain();
  out.gain.value = 0.5;
  out.connect(ctx.destination);
  const tone = (type, f0, f1, start, dur, vol) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, start);
    o.frequency.exponentialRampToValueAtTime(f1, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + Math.min(0.03, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(out);
    o.start(start);
    o.stop(start + dur + 0.05);
  };
  if (!open) {
    tone("triangle", 140, 70, t, 0.18, 0.5);
    tone("square", 90, 60, t + 0.09, 0.12, 0.12);
    return;
  }
  // Whoosh: noise through a band-pass that sweeps up.
  const len = 1.1;
  const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(300, t);
  bp.frequency.exponentialRampToValueAtTime(4000, t + 0.85);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.35, t + 0.5);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + len);
  noise.connect(bp).connect(ng).connect(out);
  noise.start(t);
  // The pull: a wobbly tone sliding up.
  tone("sine", 180, 1400, t, 0.85, 0.22);
  tone("triangle", 270, 2100, t + 0.05, 0.8, 0.08);
  // …and the sparkle on the other side (C6 E6 G6 C7 E7).
  [1047, 1319, 1568, 2093, 2637].forEach((f, k) => tone("triangle", f, f, t + 0.45 + k * 0.07, 0.5, 0.12));
}


/**
 * Wake the shared audio context on a tap. Phones (iOS especially) only let a
 * page make sound if its audio was started by a tap; sounds that come later on
 * their own (bloomSound) then play fine. Call it from a click handler.
 */
export function unlockAudio() {
  try {
    sfx ??= new AudioContext();
    sfx.resume();
    // A silent blip actually starts the output on iOS.
    const o = sfx.createOscillator(), g = sfx.createGain();
    g.gain.value = 0;
    o.connect(g).connect(sfx.destination);
    o.start();
    o.stop(sfx.currentTime + 0.01);
  } catch { /* no audio */ }
}

/**
 * The portal blooming open (the intro, when the Kusama poster has been held
 * long enough): a warm chord swells up, a glittering run of notes rises
 * through it, a rising shimmer of noise, and a bell rings out (≈3 s).
 */
export function bloomSound() {
  try {
    sfx ??= new AudioContext();
    sfx.resume();
  } catch { return; }
  const ctx = sfx, t = ctx.currentTime + 0.02;
  const out = ctx.createGain();
  out.gain.value = 0.55;
  out.connect(ctx.destination);
  const note = (type, f, start, attack, dur, vol, detune = 0) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(out);
    o.start(start);
    o.stop(start + dur + 0.05);
  };
  // Warm swell: C major (C4 G4 C5 E5), each voice doubled slightly out of tune.
  for (const f of [261.6, 392, 523.3, 659.3]) {
    note("sine", f, t, 0.35, 2.6, 0.09, -6);
    note("triangle", f, t, 0.45, 2.4, 0.05, 7);
  }
  // Glitter: a quick rising run (C6 → G7).
  [1046.5, 1318.5, 1568, 2093, 2637, 3136].forEach((f, k) => note("triangle", f, t + 0.12 + k * 0.055, 0.01, 0.6, 0.07));
  // Shimmer: noise through a band-pass sweeping up.
  const len = 1.2;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 3;
  bp.frequency.setValueAtTime(1500, t);
  bp.frequency.exponentialRampToValueAtTime(9000, t + 1);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.12, t + 0.3);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + len);
  noise.connect(bp).connect(ng).connect(out);
  noise.start(t);
  // The bell: G6 with a bright partial, ringing out.
  note("sine", 1568, t + 0.45, 0.005, 3, 0.16);
  note("sine", 1568 * 2.76, t + 0.45, 0.005, 1.2, 0.05);
  note("sine", 1568 * 5.4, t + 0.45, 0.005, 0.5, 0.02);
}

// ---------- Paper and typing (the intro letter) ----------

function audio() {
  try {
    sfx ??= new AudioContext();
    sfx.resume();
    return sfx;
  } catch { return null; }
}

let noiseBuf = null;
/** One second of white noise, shared by all the paper and key sounds. */
function noise(ctx) {
  if (noiseBuf?.sampleRate === ctx.sampleRate) return noiseBuf;
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

/** A short burst of filtered noise: the building block for paper and keys. */
function grain(ctx, out, start, dur, freq, q, vol, type = "bandpass") {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + Math.min(0.004, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(f).connect(g).connect(out);
  src.start(start, Math.random() * 0.9, dur + 0.02);
}

/** Crackle: many tiny random grains, like paper being bent. */
function crinkle(ctx, out, start, dur, perSec, vol) {
  const n = Math.round(dur * perSec);
  for (let k = 0; k < n; k++) {
    const t = start + Math.random() * dur;
    grain(ctx, out, t, 0.006 + Math.random() * 0.03, 1800 + Math.random() * 5000, 0.8 + Math.random() * 2, vol * (0.3 + Math.random() * 0.7));
  }
}

/** A soft swish of paper sliding: noise through a band-pass that sweeps. */
function swish(ctx, out, start, dur, f0, f1, vol) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 0.9;
  f.frequency.setValueAtTime(f0, start);
  f.frequency.exponentialRampToValueAtTime(f1, start + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(f).connect(g).connect(out);
  src.start(start, Math.random() * 0.4, dur + 0.05);
}

/**
 * Paper sounds for Finn's letter. "open": the envelope flap is torn open
 * (a crackle and a rip, ≈0.6 s). "unfold": the letter slides out and is
 * folded open (a swish, crackles and a soft snap as it flattens, ≈0.7 s).
 */
export function paperSound(kind = "unfold") {
  const ctx = audio();
  if (!ctx) return;
  const t = ctx.currentTime + 0.02;
  const out = ctx.createGain();
  out.gain.value = 0.9;
  out.connect(ctx.destination);
  if (kind === "open") {
    crinkle(ctx, out, t, 0.25, 70, 0.25);
    // The rip: a rough, rising tear.
    swish(ctx, out, t + 0.12, 0.35, 1200, 4500, 0.35);
    crinkle(ctx, out, t + 0.12, 0.35, 140, 0.3);
    return;
  }
  swish(ctx, out, t, 0.45, 600, 2200, 0.3);          // sliding out
  crinkle(ctx, out, t + 0.05, 0.4, 90, 0.22);
  swish(ctx, out, t + 0.4, 0.25, 2500, 900, 0.22);    // the fold opening
  crinkle(ctx, out, t + 0.42, 0.2, 120, 0.25);
  grain(ctx, out, t + 0.62, 0.05, 500, 0.7, 0.45, "lowpass"); // flat: a soft snap
}

/**
 * One typewriter key: a sharp click with a little body under it. Called for
 * every letter as the text types itself, so each one varies a bit.
 */
export function typeSound() {
  const ctx = audio();
  if (!ctx) return;
  const t = ctx.currentTime + 0.005;
  const out = ctx.createGain();
  out.gain.value = 0.35 + Math.random() * 0.15;
  out.connect(ctx.destination);
  grain(ctx, out, t, 0.012 + Math.random() * 0.01, 2600 + Math.random() * 1800, 1.5, 0.5);
  grain(ctx, out, t + 0.002, 0.035, 160 + Math.random() * 60, 1, 0.35, "lowpass");
}
