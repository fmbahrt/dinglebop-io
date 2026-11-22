// Finn's letters:
//   INTRO_LETTER  the ransom note that starts it all, "played" in the intro
//                 (intro.js, after the QR code); its clue leads to the poster.
//   HOME_LETTER   on the front page (app.js, "Brev fra Finn", with a badge until
//                 read): well done finding the way in, and how the escape room works.

const SEEN_KEY = "advent:finn-brev-hjem";

export const INTRO_LETTER = {
  dots: true, // Kusama dots: part of the clue, so only here
  title: ["DIN", "GAVE", "ER", "MIN"],
  lines: [
    "Kære Anne",
    "Jeg har taget din adventsgave og låst den inde i MIN kiste. Med en hængelås. Fire cifre.",
    "Jeg ved godt, hvor meget du hader escape rooms. Men jeg håber stadig, du har lyst til at lege med. 🥺",
    "Kunsten gemmer på en hemmelighed.",
    "Finn 🐾",
    "PS. Godbidder fremskynder IKKE processen. Måske lidt.",
  ],
};

export const HOME_LETTER = {
  title: ["DU", "FANDT", "IND"],
  lines: [
    "Kære Anne",
    "Okay. Du fandt portalen i kunsten. Det skulle have taget meget længere tid. Godt gået. 😤",
    "Nu begynder det rigtige escape room. Hver søndag i advent åbner en af portalerne herunder. Bag hver portal venter en prøve.",
    "Klarer du prøven, får du et ciffer til hængelåsen på MIN kiste. Cifrene samler sig på låsen nederst på siden. Fire portaler, fire cifre, én kiste.",
    "Finn 🐾",
    "PS. Portalerne åbner ved midnat. Jeg har tjekket. Det er sent for en hund.",
  ],
};

/** A letter: one sheet (cut-out title, handwritten body) and a paw stamp. */
export function letterParts(letter = INTRO_LETTER) {
  const title = cutout(letter.title);
  const body = document.createElement("div");
  body.className = "ransom-body";
  for (const text of letter.lines) {
    const p = document.createElement("p");
    p.textContent = text;
    if (/^PS\b/.test(text)) p.className = "ransom-ps";
    else if (/^Finn\b/.test(text)) p.className = "ransom-sign";
    body.append(p);
  }
  const stamp = document.createElement("span");
  stamp.className = "ransom-paw";
  stamp.textContent = "🐾";
  stamp.setAttribute("aria-hidden", "true");
  // One sheet of paper. With `dots` (the intro's clue): a field of Kusama dots
  // at the top, the cut-out title overlapping its edge like the poster's name.
  const paper = document.createElement("div");
  paper.className = "ransom-paper";
  paper.append(...(letter.dots ? [kusamaDots()] : []), title, body);
  return [paper, stamp];
}

/** A title in cut-out magazine letters, like a proper ransom note. */
export function cutout(words, seed = 0) {
  const title = document.createElement("p");
  title.className = "ransom-title";
  let i = seed;
  for (const word of words) {
    const w = document.createElement("span");
    w.className = "ransom-word";
    for (const c of word) {
      const s = document.createElement("span");
      s.className = `cut k${(i * 7) % 5}`;
      s.style.setProperty("--r", `${((i * 37) % 13) - 6}deg`);
      s.textContent = c;
      w.append(s);
      i++;
    }
    title.append(w);
  }
  return title;
}

/** Finn's ransom note: folded, with a notification badge until she has opened it. */
export function ransomNote() {
  let seen = false;
  try { seen = localStorage.getItem(SEEN_KEY) === "1"; } catch { /* private mode */ }
  const el = document.createElement("details");
  el.className = "ransom";
  const summary = document.createElement("summary");
  summary.textContent = "🐾 Brev fra Finn";
  if (!seen) {
    el.classList.add("unread");
    const badge = document.createElement("span");
    badge.className = "ransom-badge";
    badge.textContent = "1";
    badge.setAttribute("aria-label", "ulæst");
    summary.append(badge);
  }
  el.append(summary, ...letterParts(HOME_LETTER));
  el.addEventListener("toggle", () => {
    if (!el.open) return;
    try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* private mode */ }
    el.classList.remove("unread");
    el.querySelector(".ransom-badge")?.remove();
  });
  return el;
}


/**
 * A dense field of red dots à la Yayoi Kusama: random sizes packed almost
 * touching (greedy circle packing, biggest first, fixed seed so the letter
 * looks the same every time). Returns an <svg>.
 */
export function kusamaDots({ width = 280, height = 130, seed = 11, gap = 1.1 } = {}) {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const dots = [];
  const CELL = 24;
  const grid = new Map();
  const key = (x, y) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
  const fits = (x, y, r) => {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    for (let i = cx - 1; i <= cx + 1; i++) for (let j = cy - 1; j <= cy + 1; j++) {
      for (const d of grid.get(`${i},${j}`) ?? []) if (Math.hypot(d.x - x, d.y - y) < d.r + r + gap) return false;
    }
    return true;
  };
  // Big ones first, then ever smaller ones fill the gaps.
  for (const [r0, r1, tries] of [[8, 10.5, 500], [6, 8, 3000], [4.2, 6, 8000], [3, 4.2, 10000], [2.2, 3, 10000]]) {
    for (let k = 0; k < tries; k++) {
      const r = r0 + rand() * (r1 - r0);
      const x = rand() * width, y = rand() * height;
      if (!fits(x, y, r)) continue;
      const d = { x, y, r };
      dots.push(d);
      const id = key(x, y);
      if (!grid.has(id)) grid.set(id, []);
      grid.get(id).push(d);
    }
  }
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "ransom-dots");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
  svg.setAttribute("aria-hidden", "true");
  for (const d of dots) {
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", d.x.toFixed(1));
    c.setAttribute("cy", d.y.toFixed(1));
    c.setAttribute("r", d.r.toFixed(1));
    svg.append(c);
  }
  return svg;
}
