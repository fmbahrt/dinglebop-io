// Several mini puzzles in a row around one theme. Each step must be solved before
// the next one shows; when the last one is done, the week's number unlocks.
//
//   { "type": "trin", "overskrift": "Hyggeaften 🛋️", "tal": "8", "trin": [
//       { "type": "wolt", "navn": "Mad", "ikon": "🍛", … },
//       { "type": "tv",   "navn": "TV",  "ikon": "📺", … },
//       { "type": "rema", "navn": "Slik", "ikon": "🍬", … } ] }
//
// A step module exports default (cfg, { slug, done }) => { el, activate?, deactivate? }
// and calls done() once its own success animation has finished.

import { h, button, store, taskShell, intro } from "/felles.js";

const STEPS = {
  wolt: () => import("/wolt.js"),
  tv: () => import("/tv.js"),
  rema: () => import("/rema.js"),
  kryds: () => import("/kryds.js"),
  duolingo: () => import("/duolingo.js"),
  ansigter: () => import("/ansigter.js"),
  spotify: () => import("/spotify.js"),
  saedevarme: () => import("/saedevarme.js"),
  postkort: () => import("/postkort.js"),
  panorama: () => import("/panorama.js"),
};

export async function trinOpgave(opgave, ctx) {
  const steps = opgave.trin ?? [];
  const makers = await Promise.all(steps.map(async (s) => {
    const load = STEPS[s.type];
    if (!load) throw new Error(`ukendt trin-type: ${s.type}`);
    return (await load()).default;
  }));
  const progress = store(`advent:${ctx.slug}:trin`);
  let current = null;
  let active = false;
  let gen = 0; // bumps on reset/redraw so a finished animation from before doesn't count

  function renderLocked(card, solve) {
    card.classList.add("trin");
    const bar = h("ol", "steps");
    const stage = h("div", "step-stage");

    const drawBar = (n) => bar.replaceChildren(...steps.map((s, i) => {
      const li = h("li", `step${i < n ? " done" : i === n ? " now" : ""}`);
      li.append(h("span", "step-icon", i < n ? "✓" : (s.ikon ?? String(i + 1))), h("span", "step-name", s.navn ?? ""));
      return li;
    }));

    const mine = ++gen;
    const show = (n) => {
      current?.deactivate?.();
      current = null;
      drawBar(n);
      if (n >= steps.length) return solve();
      current = makers[n](steps[n], { slug: ctx.slug, done: () => mine === gen && finished(n) });
      stage.replaceChildren(current.el);
      if (active) current.activate?.();
    };

    // A step is done: save it, then a short "well done" before the next one.
    const finished = (n) => {
      progress.set(n + 1);
      current?.deactivate?.();
      current = null;
      drawBar(n + 1);
      if (n + 1 >= steps.length) return solve();
      const next = steps[n + 1];
      const box = h("div", "step-done");
      box.append(
        h("p", "step-done-check", "✓"),
        h("p", "step-done-text", steps[n].klaret ?? "Klaret!"),
        button(`Videre: ${next.ikon ?? ""} ${next.navn ?? ""}`.replace(/\s+/g, " ").trim(), "btn", () => {
          show(n + 1);
          stage.scrollIntoView({ behavior: "smooth", block: "start" });
        }),
      );
      stage.replaceChildren(box);
    };

    card.replaceChildren(...intro(opgave), bar, stage);
    show(Math.min(progress.get() ?? 0, steps.length));
  }

  return taskShell(opgave, ctx, {
    renderLocked,
    activate: () => {
      active = true;
      current?.activate?.();
    },
    deactivate: () => {
      active = false;
      current?.deactivate?.();
    },
    onReset: () => {
      progress.clear();
      // Steps may save their own progress under advent:<slug>:…
      for (const k of ["kryds", "ansigter"]) store(`advent:${ctx.slug}:${k}`).clear();
    },
  });
}

/** "129,00 kr" */
export const kr = (n) => `${Number(n).toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;

/** Short beep (scanner, order sent). Needs a tap on the page first (iPhone). */
let audio = null;
const unlockAudio = () => {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") audio.resume();
  } catch { /* no audio */ }
};
document.addEventListener("pointerdown", unlockAudio, { capture: true });
export function beep(freq = 1760, ms = 110) {
  if (!audio || audio.state !== "running") return;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = "square";
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.06, audio.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + ms / 1000);
  o.connect(g).connect(audio.destination);
  o.start();
  o.stop(audio.currentTime + ms / 1000);
}
