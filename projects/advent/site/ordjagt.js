// Word search: find the listed words in a grid of random letters. Drag a finger
// across a word (or tap its first and last letter). Used inside the crossword app:
//
//   "ordjagt": { "ord": ["CATANIA", "ETNA"], "størrelse": 10, "baglæns": true }
//
// Words run right, down and diagonally (and backwards with "baglæns"). The grid
// is generated from a fixed seed, so it looks the same on every visit.

import { h } from "/felles.js";

const up = (s) => String(s ?? "").toLocaleUpperCase("da").replace(/\s+/g, "");
const FORWARD = [[0, 1], [1, 0], [1, 1], [-1, 1]];
const FILL = "ABCDEFGHIJKLMNOPRSTUVZ";
const COLORS = ["#e9c46a", "#7fd1ae", "#f4978e", "#9ecbff", "#c9a3ff", "#ffd27f", "#a8e6a1"];

/** Small seeded random generator (mulberry32). */
function rng(seedText) {
  let a = 0;
  for (const ch of seedText) a = (Math.imul(a ^ ch.codePointAt(0), 2654435761) + 1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Place every word in a size×size grid; null if it doesn't fit with this seed. */
function generate(words, size, backwards, rand) {
  const dirs = backwards ? [...FORWARD, ...FORWARD.map(([r, c]) => [-r, -c])] : FORWARD;
  const grid = Array.from({ length: size }, () => Array(size).fill(null));
  const placed = [];
  const longest = [...words].sort((a, b) => b.length - a.length);
  for (const word of longest) {
    let ok = false;
    for (let tries = 0; tries < 400 && !ok; tries++) {
      const [dr, dc] = dirs[Math.floor(rand() * dirs.length)];
      const r0 = Math.floor(rand() * size), c0 = Math.floor(rand() * size);
      const cells = [...word].map((_, i) => [r0 + dr * i, c0 + dc * i]);
      if (!cells.every(([r, c]) => r >= 0 && c >= 0 && r < size && c < size)) continue;
      if (!cells.every(([r, c], i) => grid[r][c] === null || grid[r][c] === word[i])) continue;
      cells.forEach(([r, c], i) => (grid[r][c] = word[i]));
      placed.push(word);
      ok = true;
    }
    if (!ok) return null;
  }
  for (const row of grid) for (let c = 0; c < size; c++) row[c] ??= FILL[Math.floor(rand() * FILL.length)];
  return grid;
}

/**
 * Builds the word search. found = saved words, onFound(list) saves progress,
 * onSolved() runs once all words are found. Returns [grid, word list, message].
 */
export function ordjagt(cfg, { seed = "", found: saved = [], onFound = () => {}, onSolved = () => {} } = {}) {
  const words = (cfg.ord ?? []).map(up);
  const size = Number(cfg.størrelse ?? Math.max(10, ...words.map((w) => w.length)));
  let grid = null;
  for (let n = 0; !grid && n < 50; n++) grid = generate(words, size, cfg.baglæns !== false, rng(`${seed}|${words.join()}|${n}`));
  if (!grid) throw new Error("ordjagt: ordene kan ikke være i gitteret – gør det større");

  const found = new Set(saved.filter((w) => words.includes(w)));
  const wrap = h("div", "oj");
  const board = h("div", "oj-grid");
  board.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  const boxes = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const b = h("span", "oj-cell", grid[r][c]);
      b.dataset.r = r;
      b.dataset.c = c;
      boxes.push(b);
      board.append(b);
    }
  }

  // Found words and the current selection are drawn as rounded strokes on top.
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "oj-lines");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("aria-hidden", "true");
  const line = (a, b, cls, color) => {
    const l = document.createElementNS(NS, "line");
    l.setAttribute("x1", a[1] + 0.5); l.setAttribute("y1", a[0] + 0.5);
    l.setAttribute("x2", b[1] + 0.5); l.setAttribute("y2", b[0] + 0.5);
    l.setAttribute("class", cls);
    if (color) l.style.stroke = color;
    svg.append(l);
    return l;
  };
  board.append(svg);

  const list = h("ul", "oj-list");
  const items = new Map(words.map((w) => {
    const li = h("li", null, w.charAt(0) + w.slice(1).toLocaleLowerCase("da"));
    list.append(li);
    return [w, li];
  }));
  const msg = h("p", "oj-msg");
  const count = () => { msg.textContent = found.size === words.length ? "Alle ord fundet! ✨" : `${found.size} af ${words.length} ord fundet`; };

  /** Where in the grid is this word? (Needed to redraw saved words.) */
  function locate(word) {
    const all = [...FORWARD, ...FORWARD.map(([r, c]) => [-r, -c])];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) for (const [dr, dc] of all) {
      const end = [r + dr * (word.length - 1), c + dc * (word.length - 1)];
      if (end.some((v) => v < 0 || v >= size)) continue;
      if ([...word].every((ch, i) => grid[r + dr * i][c + dc * i] === ch)) return [[r, c], end];
    }
    return null;
  }

  function mark(word, a, b, animate) {
    const l = line(a, b, `oj-found${animate ? " pop" : ""}`, COLORS[words.indexOf(word) % COLORS.length]);
    items.get(word).classList.add("found");
    return l;
  }
  for (const w of found) {
    const at = locate(w);
    if (at) mark(w, ...at, false);
  }
  count();

  // Selection: drag from the first letter to the last, snapped to 8 directions.
  let start = null, sel = null, tapStart = null;
  const cellAt = (x, y) => {
    const el = document.elementFromPoint(x, y)?.closest?.(".oj-cell");
    return el && board.contains(el) ? [Number(el.dataset.r), Number(el.dataset.c)] : null;
  };
  /** Snap the end point to the nearest straight line from start. */
  function snap(a, b) {
    const dr = b[0] - a[0], dc = b[1] - a[1];
    const len = Math.max(Math.abs(dr), Math.abs(dc));
    if (!len) return a;
    const angle = Math.round(Math.atan2(dr, dc) / (Math.PI / 4)) * (Math.PI / 4);
    const sr = Math.round(Math.sin(angle)), sc = Math.round(Math.cos(angle));
    let n = len;
    while (n > 0 && (a[0] + sr * n < 0 || a[0] + sr * n >= size || a[1] + sc * n < 0 || a[1] + sc * n >= size)) n--;
    return [a[0] + sr * n, a[1] + sc * n];
  }
  function lettersBetween(a, b) {
    const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
    const sr = Math.sign(b[0] - a[0]), sc = Math.sign(b[1] - a[1]);
    return Array.from({ length: n + 1 }, (_, i) => grid[a[0] + sr * i][a[1] + sc * i]).join("");
  }
  function draw(a, b) {
    sel ??= line(a, b, "oj-sel");
    sel.setAttribute("x1", a[1] + 0.5); sel.setAttribute("y1", a[0] + 0.5);
    sel.setAttribute("x2", b[1] + 0.5); sel.setAttribute("y2", b[0] + 0.5);
  }
  function clearSel() {
    sel?.remove();
    sel = null;
    boxes.forEach((b) => b.classList.remove("start"));
  }
  /** Check the selection a→b. Returns true if it was a (new) word. */
  function finish(a, b) {
    const text = lettersBetween(a, b);
    const word = words.find((w) => !found.has(w) && (w === text || w === [...text].reverse().join("")));
    clearSel();
    if (!word) return false;
    found.add(word);
    mark(word, a, b, true);
    navigator.vibrate?.(30);
    count();
    onFound([...found]);
    if (found.size === words.length) {
      wrap.classList.add("done");
      setTimeout(onSolved, 900);
    }
    return true;
  }

  board.addEventListener("pointerdown", (e) => {
    if (found.size === words.length) return;
    const at = cellAt(e.clientX, e.clientY);
    if (!at) return;
    e.preventDefault();
    board.setPointerCapture?.(e.pointerId);
    start = at;
    draw(at, at);
  });
  board.addEventListener("pointermove", (e) => {
    if (!start) return;
    const at = cellAt(e.clientX, e.clientY);
    if (at) draw(start, snap(start, at));
  });
  const end = (e) => {
    if (!start) return;
    const at = cellAt(e.clientX, e.clientY);
    const a = start;
    start = null;
    const b = at ? snap(a, at) : a;
    if (b[0] !== a[0] || b[1] !== a[1]) {
      tapStart = null;
      if (!finish(a, b)) wrong();
      return;
    }
    // A tap: first tap marks the start, the second tap the end.
    if (!tapStart) {
      tapStart = a;
      clearSel();
      boxes[a[0] * size + a[1]].classList.add("start");
    } else {
      const s = tapStart;
      tapStart = null;
      const t = snap(s, a);
      if ((t[0] !== s[0] || t[1] !== s[1]) && !finish(s, t)) wrong();
      else clearSel();
    }
  };
  board.addEventListener("pointerup", end);
  board.addEventListener("pointercancel", () => { start = null; tapStart = null; clearSel(); });

  function wrong() {
    board.classList.remove("nope");
    void board.offsetWidth;
    board.classList.add("nope");
  }

  if (found.size === words.length) wrap.classList.add("done");
  wrap.append(board, msg, list);
  return wrap;
}
