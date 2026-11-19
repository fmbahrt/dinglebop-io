// Mini crossword: fill in all words correctly to unlock the number.
//
//   { "type": "kryds", "tal": "4", "ord": [
//       { "svar": "PANDA", "ledetråd": "…", "række": 1, "kolonne": 1, "retning": "vandret" },
//       { "svar": "NISSE", "ledetråd": "…", "række": 1, "kolonne": 3, "retning": "lodret" } ] }
//
// Rows/columns start at 1. Words that cross must share the same letter there.
// Also usable as a step in a "trin" task: { "type": "kryds", "ord": [ … ] }.

import { h, store, taskShell, intro } from "/felles.js";
import { ordjagt } from "/ordjagt.js";

const up = (s) => String(s ?? "").toLocaleUpperCase("da");
const DIRS = { vandret: [0, 1], lodret: [1, 0] };

export function krydsOpgave(opgave, ctx) {
  const progress = store(`advent:${ctx.slug}:kryds`);
  return taskShell(opgave, ctx, {
    renderLocked: (card, solve) => card.replaceChildren(...intro(opgave), ...board(opgave, progress, solve)),
    onReset: () => progress.clear(),
  });
}

/**
 * As a step in a "trin" task. With "ordjagt": { "ord": [ … ] } the app gets a
 * second tab with a word search; the step is done when both are solved.
 */
export default function krydsTrin(cfg, { slug, done }) {
  const el = h("div", "kryds-trin");
  const title = cfg.overskrift ? [h("p", "kryds-trin-title", cfg.overskrift)] : [];
  if (!cfg.ordjagt) {
    el.append(...title, ...board(cfg, store(`advent:${slug}:kryds`), done));
    return { el };
  }

  const state = store(`advent:${slug}:ordjagt`);
  const get = () => ({ kryds: false, fundet: [], ...(state.get() ?? {}) });
  const set = (patch) => state.set({ ...get(), ...patch });
  const both = () => get().kryds && get().fundet.length >= cfg.ordjagt.ord.length;
  const finish = () => { if (both()) done(); };

  const panes = [
    h("div", "kryds-pane"),
    h("div", "kryds-pane"),
  ];
  panes[0].append(...board(cfg, store(`advent:${slug}:kryds`), () => {
    set({ kryds: true });
    tabs[0].classList.add("ok");
    both() ? finish() : setTimeout(() => show(1), 700);
  }, { keep: true }));
  panes[1].append(...(cfg.ordjagt.overskrift ? [h("p", "oj-title", cfg.ordjagt.overskrift)] : []), ordjagt(cfg.ordjagt, {
    seed: slug,
    found: get().fundet,
    onFound: (fundet) => set({ fundet }),
    onSolved: () => {
      tabs[1].classList.add("ok");
      both() ? finish() : show(0);
    },
  }));

  const tabs = ["Krydsord", cfg.ordjagt.navn ?? "Find ordene"].map((label, i) => {
    const b = h("button", "kryds-tab", label);
    b.type = "button";
    b.addEventListener("click", () => show(i));
    return b;
  });
  if (get().kryds) tabs[0].classList.add("ok");
  if (get().fundet.length >= cfg.ordjagt.ord.length) tabs[1].classList.add("ok");

  function show(i) {
    tabs.forEach((t, j) => t.classList.toggle("on", i === j));
    panes.forEach((p, j) => (p.hidden = i !== j));
  }
  show(get().kryds && !tabs[1].classList.contains("ok") ? 1 : 0);

  const bar = h("div", "kryds-tabs");
  bar.append(...tabs);
  el.append(...title, bar, ...panes);
  return { el };
}

/**
 * The crossword itself: [clue bar, grid, message, clue lists]. Letters are saved
 * in progress; with keep they stay after solving (shown as solved next time).
 */
function board(opgave, progress, solve, { keep = false } = {}) {
  const words = buildWords(opgave.ord ?? []);
  {
    const { cells, rows, cols, minR, minC } = layout(words);
    const saved = progress.get() ?? {};

    const grid = h("div", "kryds");
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    grid.style.maxWidth = `${cols * 3.4}rem`;
    const clueBar = h("p", "kryds-clue", "Tryk på et felt for at starte");
    const msg = h("p", "kryds-msg");

    let current = null; // { cell, dir }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = cells.get(`${r + minR},${c + minC}`);
        if (!cell) {
          grid.append(h("div", "kryds-blank"));
          continue;
        }
        const box = h("div", "kryds-cell");
        if (cell.number) box.append(h("span", "kryds-num", cell.number));
        const input = h("input");
        Object.assign(input, { maxLength: 2, autocomplete: "off", spellcheck: false, value: saved[cell.key] ?? "" });
        input.setAttribute("autocapitalize", "characters");
        input.setAttribute("autocorrect", "off");
        input.setAttribute("enterkeyhint", "next");
        input.setAttribute("aria-label", `Felt ${cell.r}, ${cell.c}`);
        box.append(input);
        grid.append(box);
        cell.box = box;
        cell.input = input;

        input.addEventListener("pointerdown", () => {
          // Tapping the focused cell again flips direction (where two words cross).
          if (current?.cell === cell && cell.words.length > 1) {
            requestAnimationFrame(() => select(cell, current.dir === "vandret" ? "lodret" : "vandret"));
          }
        });
        input.addEventListener("focus", () => select(cell, current?.cell === cell ? current.dir : undefined));
        input.addEventListener("input", () => {
          const letters = [...up(input.value)].filter((ch) => /\p{L}/u.test(ch));
          input.value = letters.at(-1) ?? "";
          save();
          if (input.value) move(1);
          check();
        });
        input.addEventListener("keydown", (e) => {
          if (e.key === "Backspace" && !input.value) {
            e.preventDefault();
            const prev = step(-1);
            if (prev) {
              prev.input.value = "";
              save();
              prev.input.focus();
            }
          } else if (e.key === "Enter") {
            e.preventDefault();
            nextWord();
          }
        });
      }
    }

    const lists = h("div", "kryds-lists");
    for (const dir of ["vandret", "lodret"]) {
      const ws = words.filter((w) => w.dir === dir);
      if (!ws.length) continue;
      const section = h("div", "kryds-list");
      section.append(h("p", "kryds-list-title", dir === "vandret" ? "Vandret" : "Lodret"));
      const ol = h("ol");
      for (const w of ws) {
        const li = h("li");
        li.append(h("b", null, `${w.number}`), document.createTextNode(` ${w.clue}`));
        li.addEventListener("click", () => {
          const target = w.cells.find((c) => !c.input.value) ?? w.cells[0];
          current = { cell: target, dir: w.dir };
          target.input.focus();
        });
        w.li = li;
        ol.append(li);
      }
      section.append(ol);
      lists.append(section);
    }


    function wordAt(cell, dir) {
      return cell.words.find((w) => w.dir === dir) ?? cell.words[0];
    }

    function select(cell, dir) {
      const word = wordAt(cell, dir ?? current?.dir ?? "vandret");
      current = { cell, dir: word.dir };
      for (const c of cells.values()) c.box?.classList.remove("in-word", "focus");
      for (const w of words) w.li?.classList.remove("active");
      word.cells.forEach((c) => c.box.classList.add("in-word"));
      cell.box.classList.add("focus");
      word.li?.classList.add("active");
      clueBar.textContent = `${word.number} ${word.dir}: ${word.clue}`;
    }

    function step(delta) {
      if (!current) return null;
      const word = wordAt(current.cell, current.dir);
      const i = word.cells.indexOf(current.cell);
      return word.cells[i + delta] ?? null;
    }

    function move(delta) {
      const next = step(delta);
      if (next) next.input.focus();
      else if (delta > 0) nextWord();
    }

    function nextWord() {
      if (!current) return;
      const word = wordAt(current.cell, current.dir);
      const order = words.indexOf(word);
      for (let i = 1; i <= words.length; i++) {
        const w = words[(order + i) % words.length];
        const empty = w.cells.find((c) => !c.input.value);
        if (empty) {
          current = { cell: empty, dir: w.dir };
          return empty.input.focus();
        }
      }
    }

    function save() {
      const letters = {};
      for (const c of cells.values()) if (c.input?.value) letters[c.key] = c.input.value;
      progress.set(letters);
    }

    function check() {
      const all = [...cells.values()];
      if (all.some((c) => !c.input.value)) {
        msg.textContent = "";
        return;
      }
      if (all.every((c) => up(c.input.value) === c.letter)) {
        document.activeElement?.blur();
        grid.classList.add("done");
        msg.textContent = "Det er rigtigt! ✨";
        setTimeout(() => {
          if (!keep) progress.clear();
          solve();
        }, 900);
      } else {
        msg.textContent = "Næsten! Noget passer ikke helt 🤔";
      }
    }

    // Already solved earlier (keep): show it filled in and locked.
    const all = [...cells.values()];
    if (keep && all.every((c) => up(c.input.value) === c.letter)) {
      grid.classList.add("done");
      all.forEach((c) => (c.input.readOnly = true));
      clueBar.textContent = "Løst ✓";
    }

    return [clueBar, grid, msg, lists];
  }
}

/** Normalise the words from opgave.json and number them like a newspaper crossword. */
function buildWords(raw) {
  const words = raw.map((w) => ({
    answer: [...up(w.svar).replace(/\s+/g, "")],
    clue: w.ledetråd ?? "",
    r: Number(w.række ?? 1),
    c: Number(w.kolonne ?? 1),
    dir: w.retning === "lodret" ? "lodret" : "vandret",
  }));
  const starts = [...new Set(words.map((w) => `${w.r},${w.c}`))]
    .map((k) => k.split(",").map(Number))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const w of words) w.number = starts.findIndex(([r, c]) => r === w.r && c === w.c) + 1;
  return words.sort((a, b) => a.number - b.number || (a.dir === "vandret" ? -1 : 1));
}

function layout(words) {
  const cells = new Map();
  for (const w of words) {
    const [dr, dc] = DIRS[w.dir];
    w.cells = w.answer.map((letter, i) => {
      const r = w.r + dr * i, c = w.c + dc * i;
      const key = `${r},${c}`;
      let cell = cells.get(key);
      if (!cell) cells.set(key, (cell = { key, r, c, letter, words: [] }));
      else if (cell.letter !== letter) console.warn(`Kryds: ${key} er både "${cell.letter}" og "${letter}"`);
      if (i === 0) cell.number = w.number;
      cell.words.push(w);
      return cell;
    });
  }
  const rs = [...cells.values()].map((c) => c.r), cs = [...cells.values()].map((c) => c.c);
  const minR = Math.min(...rs), minC = Math.min(...cs);
  return { cells, minR, minC, rows: Math.max(...rs) - minR + 1, cols: Math.max(...cs) - minC + 1 };
}
