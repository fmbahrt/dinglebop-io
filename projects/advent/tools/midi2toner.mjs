#!/usr/bin/env node
// MIDI file → "toner" for the humming puzzle (site/sang.js).
//
//   node tools/midi2toner.mjs sang.mid                 list the tracks
//   node tools/midi2toner.mjs sang.mid --spor 1        the melody of track 1
//   node tools/midi2toner.mjs sang.mid --spor 1 --fra 0 --antal 14
//
// The melody is the highest note at each moment (so chords and accompaniment
// in the same track don't count). Repeated notes are merged, because humming
// "mmm" doesn't separate them, and the result is semitones relative to the
// first note: [0, 2, 4, …]. Paste it as "toner" in opgave.json.

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
if (!file) {
  console.error("Brug: node tools/midi2toner.mjs fil.mid [--spor N] [--fra N] [--antal N]");
  process.exit(1);
}

const buf = readFileSync(file);
let pos = 0;
const u32 = () => (buf[pos++] << 24) | (buf[pos++] << 16) | (buf[pos++] << 8) | buf[pos++];
const u16 = () => (buf[pos++] << 8) | buf[pos++];
const vlq = () => {
  let v = 0, b;
  do { b = buf[pos++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80);
  return v;
};

if (buf.toString("latin1", 0, 4) !== "MThd") throw new Error("ikke en MIDI-fil");
pos = 4;
const headerLen = u32();
u16(); // format
const nTracks = u16();
pos = 8 + headerLen;

const tracks = [];
for (let t = 0; t < nTracks; t++) {
  if (buf.toString("latin1", pos, pos + 4) !== "MTrk") throw new Error(`spor ${t}: mangler MTrk`);
  pos += 4;
  const end = pos + 4 + u32();
  let tick = 0, status = 0, name = "";
  const notes = []; // { tick, note }
  while (pos < end) {
    tick += vlq();
    let b = buf[pos];
    if (b & 0x80) { status = b; pos++; } else b = status; // running status
    const type = status & 0xf0;
    if (status === 0xff) {
      const meta = buf[pos++];
      const len = vlq();
      if (meta === 0x03) name = buf.toString("latin1", pos, pos + len);
      pos += len;
    } else if (status === 0xf0 || status === 0xf7) {
      pos += vlq();
    } else if (type === 0x90) {
      const note = buf[pos++], vel = buf[pos++];
      if (vel > 0 && (status & 0x0f) !== 9) notes.push({ tick, note });
    } else if (type === 0xc0 || type === 0xd0) {
      pos += 1;
    } else {
      pos += 2; // note off, aftertouch, controller, pitch bend
    }
  }
  pos = end;
  tracks.push({ name, notes });
}

const spor = opt("spor", null);
if (spor == null) {
  tracks.forEach((t, i) => {
    if (!t.notes.length) return;
    const avg = t.notes.reduce((s, n) => s + n.note, 0) / t.notes.length;
    console.log(`spor ${i}: "${t.name}" ${t.notes.length} toner, gennemsnit ${avg.toFixed(1)}`);
  });
  console.log("\nVælg melodien med --spor N");
  process.exit(0);
}

// Highest note per onset, then merge repeats.
const byTick = new Map();
for (const n of tracks[spor].notes) byTick.set(n.tick, Math.max(byTick.get(n.tick) ?? 0, n.note));
const melody = [...byTick.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n);
const merged = melody.filter((n, i) => i === 0 || n !== melody[i - 1]);
const fra = opt("fra", 0), antal = opt("antal", 14);
const part = merged.slice(fra, fra + antal);
const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "H"];
console.log("noder:", part.map((n) => names[n % 12] + (Math.floor(n / 12) - 1)).join(" "));
console.log(`"toner": ${JSON.stringify(part.map((n) => n - part[0]))}`);
