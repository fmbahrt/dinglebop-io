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

