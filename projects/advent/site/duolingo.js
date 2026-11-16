// Step "duolingo": a short language lesson. Exercises one at a time with a
// progress bar, a "TJEK" button and a green/red answer sheet. A wrong answer
// doesn't reveal the right one; the exercise just comes back at the end, so the lesson
// always ends once everything has been answered right once.
//
//   { "type": "duolingo", "sprog": "it-IT", "opgaver": [
//     { "type": "vælg", "spørgsmål": "Hvilken af disse er „isen“?",
//       "valg": [ { "tekst": "il gelato", "emoji": "🍨", "rigtig": true }, { "tekst": "la pizza", "emoji": "🍕" } ] },
//     { "type": "byg", "sætning": "Due gelati, per favore!", "svar": ["To is, tak"],
//       "ord": ["To", "is", "tak", "tre", "kaffe"] },
//     { "type": "par", "par": [ ["il mare", "havet"], ["il sole", "solen"] ] },
//     { "type": "udfyld", "før": "Un", "efter": ", per favore!", "oversættelse": "En kaffe, tak!",
//       "valg": ["caffè", "cane", "cielo"], "svar": "caffè" } ] }
//
// "sætning" (byg) is read aloud in "sprog" when tapped. In "byg", "svar" lists
// accepted answers; punctuation and case don't matter. If the sentence to read
// is Danish and the words to pick are Italian, set "læs": false.

import { h, button } from "/felles.js";
import { beep } from "/trin.js";

const TITLES = {
  vælg: "Vælg det rigtige billede",
  byg: "Oversæt denne sætning",
  par: "Vælg de matchende par",
  udfyld: "Udfyld det tomme felt",
};
const PRAISE = ["Fantastisk!", "Godt klaret!", "Perfetto!", "Bravissima!", "Flot!"];

const clean = (s) => String(s ?? "").toLocaleLowerCase("da").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export default function duolingo(cfg, { done }) {
  const lang = cfg.sprog ?? "it-IT";
  const queue = (cfg.opgaver ?? []).map((ex, i) => ({ ...ex, i }));
  const total = queue.length;
  let right = 0;
  let mistakes = 0;

  const root = h("div", "app duo");
  const top = h("div", "duo-top");
  const bar = h("div", "duo-bar");
  const fill = h("div", "duo-fill");
  bar.append(fill);
  top.append(h("span", "duo-x", "✕"), bar, h("span", "duo-streak", `🔥 ${cfg.streak ?? 12}`));
  const body = h("div", "duo-body");
  const foot = h("div", "duo-foot");
  root.append(top, body, foot);

  const speak = (text) => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = 0.9;
      const voice = speechSynthesis.getVoices().find((v) => v.lang?.replace("_", "-").startsWith(lang.slice(0, 2)));
      if (voice) u.voice = voice;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch { /* no speech */ }
  };
  try { speechSynthesis.getVoices(); } catch { /* load voices early */ }

  const progress = () => fill.style.setProperty("--p", String(right / total));

  // ---- one exercise
  function next() {
    progress();
    const ex = queue.shift();
    if (!ex) return finish();
    const kind = ex.type in TITLES ? ex.type : "vælg";
    const title = h("p", "duo-title", ex.titel ?? TITLES[kind]);
    const check = button("TJEK", "duo-btn", () => {
      if (!check.disabled) grade();
    });
    check.disabled = true;
    const ready = (on) => { check.disabled = !on; };
    let answer = () => null; // returns { ok }
    let grade = () => {};

    const view = { vælg, byg, par, udfyld }[kind](ex, ready, (fn) => (answer = fn));
    body.replaceChildren(title, view);
    foot.className = "duo-foot";
    foot.replaceChildren(check);
    body.classList.remove("in");
    void body.offsetWidth;
    body.classList.add("in");

    grade = () => {
      const { ok } = answer();
      view.classList.add("locked");
      if (ok) {
        right++;
        progress();
        beep(988, 90);
        setTimeout(() => beep(1319, 140), 100);
      } else {
        mistakes++;
        queue.push(ex);
        beep(196, 220);
        navigator.vibrate?.(160);
      }
      const sheet = h("div", "duo-sheet");
      sheet.append(h("p", "duo-sheet-head", ok ? `✓  ${PRAISE[(Math.random() * PRAISE.length) | 0]}` : "✕  Ikke helt rigtigt"));
      if (!ok) sheet.append(h("p", "duo-sheet-sol", "Den kommer igen senere 💪"));
      foot.className = `duo-foot ${ok ? "ok" : "bad"}`;
      foot.replaceChildren(sheet, button("FORTSÆT", "duo-btn", next));
    };
  }

  // ---- exercise types

  function vælg(ex, ready, setAnswer) {
    const grid = h("div", "duo-choices");
    let picked = null;
    const options = ex.valg ?? [];
    options.forEach((o, n) => {
      const card = button("", "duo-choice", () => {
        picked = o;
        grid.querySelectorAll(".duo-choice").forEach((c) => c.classList.toggle("sel", c === card));
        if (o.tekst) speak(o.tekst);
        ready(true);
      });
      card.append(...(o.emoji ? [h("span", "duo-choice-emoji", o.emoji)] : []), h("span", "duo-choice-text", o.tekst ?? ""), h("span", "duo-choice-n", String(n + 1)));
      grid.append(card);
    });
    const wrap = h("div");
    if (ex.spørgsmål) wrap.append(h("p", "duo-q", ex.spørgsmål));
    wrap.append(grid);
    setAnswer(() => ({ ok: !!picked?.rigtig }));
    return wrap;
  }

  function byg(ex, ready, setAnswer) {
    const wrap = h("div");
    const say = h("div", "duo-say");
    const bubble = h("button", "duo-bubble");
    bubble.type = "button";
    bubble.append(h("span", "duo-speaker", ex.læs === false ? "" : "🔊"), h("span", null, ex.sætning ?? ""));
    if (ex.læs !== false) bubble.addEventListener("click", () => speak(ex.sætning));
    say.append(h("span", "duo-owl", "🦉"), bubble);
    const line = h("div", "duo-line");
    const bank = h("div", "duo-bank");
    const chosen = [];
    const draw = () => {
      line.replaceChildren(...chosen.map((t) => t.chip));
      ready(chosen.length > 0);
    };
    (ex.ord ?? []).forEach((word) => {
      const slot = h("span", "duo-slot");
      const chip = button(word, "duo-chip", () => {
        const at = chosen.findIndex((t) => t.chip === chip);
        if (at >= 0) {
          chosen.splice(at, 1);
          slot.append(chip);
        } else {
          chosen.push({ word, chip });
          if (ex.læs === false) speak(word);
        }
        draw();
      });
      slot.append(chip);
      bank.append(slot);
    });
    // The bank keeps an empty placeholder where a chosen word was, like the real thing.
    const observer = () => bank.querySelectorAll(".duo-slot").forEach((s) => s.classList.toggle("empty", !s.firstChild));
    line.addEventListener("click", () => requestAnimationFrame(observer));
    bank.addEventListener("click", () => requestAnimationFrame(observer));
    wrap.append(say, line, bank);
    setTimeout(() => ex.læs !== false && speak(ex.sætning), 350);
    const accepted = [].concat(ex.svar ?? []);
    setAnswer(() => ({
      ok: accepted.some((a) => clean(a) === clean(chosen.map((t) => t.word).join(" "))),
    }));
    return wrap;
  }

  function udfyld(ex, ready, setAnswer) {
    const wrap = h("div");
    const blank = h("span", "duo-blank", " ");
    const sentence = h("p", "duo-fill-line");
    sentence.append(document.createTextNode(`${ex.før ?? ""} `), blank, document.createTextNode(` ${ex.efter ?? ""}`));
    const opts = h("div", "duo-bank");
    let picked = null;
    for (const word of ex.valg ?? []) {
      const chip = button(word, "duo-chip", () => {
        picked = word;
        blank.textContent = word;
        blank.classList.add("filled");
        opts.querySelectorAll(".duo-chip").forEach((c) => c.classList.toggle("sel", c === chip));
        speak(word);
        ready(true);
      });
      opts.append(chip);
    }
    wrap.append(sentence, ...(ex.oversættelse ? [h("p", "duo-q", ex.oversættelse)] : []), opts);
    setAnswer(() => ({ ok: clean(picked) === clean(ex.svar) }));
    return wrap;
  }

  function par(ex, ready, setAnswer) {
    // Two columns, shuffled; tap one on each side. Right pairs turn grey, wrong ones flash red.
    const pairs = ex.par ?? [];
    const left = h("div", "duo-col");
    const right2 = h("div", "duo-col");
    let sel = null; // { side, idx, el }
    let matched = 0;
    let slips = 0;
    const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(([, v]) => v);
    const make = (side, idx, text, col) => {
      const b = button(text, "duo-pair", () => {
        if (b.disabled) return;
        if (side === 0) speak(text);
        if (!sel || sel.side === side) {
          sel?.el.classList.remove("sel");
          sel = { side, idx, el: b };
          b.classList.add("sel");
          return;
        }
        const other = sel;
        sel = null;
        other.el.classList.remove("sel");
        if (other.idx === idx) {
          beep(1175, 70);
          for (const el of [b, other.el]) {
            el.classList.add("ok");
            el.disabled = true;
          }
          if (++matched === pairs.length) ready(true);
        } else {
          slips++;
          beep(196, 150);
          for (const el of [b, other.el]) {
            el.classList.remove("bad");
            void el.offsetWidth;
            el.classList.add("bad");
          }
        }
      });
      col.append(b);
    };
    shuffle(pairs.map((p, i) => [i, p[0]])).forEach(([i, t]) => make(0, i, t, left));
    shuffle(pairs.map((p, i) => [i, p[1]])).forEach(([i, t]) => make(1, i, t, right2));
    const wrap = h("div", "duo-pairs");
    wrap.append(left, right2);
    setAnswer(() => ({ ok: true, slips }));
    return wrap;
  }

  // ---- lesson complete
  function finish() {
    fill.style.setProperty("--p", "1");
    beep(1047, 100);
    setTimeout(() => beep(1319, 100), 120);
    setTimeout(() => beep(1568, 200), 240);
    const acc = Math.round((total / (total + mistakes)) * 100);
    const box = h("div", "duo-done");
    const stats = h("div", "duo-stats");
    const stat = (label, value, cls) => {
      const s = h("div", `duo-stat ${cls}`);
      s.append(h("p", "duo-stat-label", label), h("p", "duo-stat-value", value));
      return s;
    };
    stats.append(stat("XP I ALT", `⚡ ${cfg.xp ?? total * 5}`, "xp"), stat("PRÆCIS", `🎯 ${acc}%`, "acc"));
    box.append(h("p", "duo-done-emoji", "🦉🍋"), h("p", "duo-done-title", cfg.færdig ?? "Lektion fuldført!"), ...(cfg.tekst ? [h("p", "duo-done-text", cfg.tekst)] : []), stats);
    body.replaceChildren(box);
    foot.className = "duo-foot";
    foot.replaceChildren(button("FORTSÆT", "duo-btn", done));
  }

  next();
  return { el: root, deactivate: () => { try { speechSynthesis.cancel(); } catch { /* ignore */ } } };
}
