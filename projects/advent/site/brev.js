// Finn's ransom note: the letter that starts it all. It is "played" in the
// intro (intro.js, after the QR code) and can be read again on the front page
// (app.js), where it has a badge until it has been read.

export const SEEN_KEY = "advent:finn-brev";
export const markLetterSeen = () => { try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* private mode */ } };

export const LETTER = {
  title: ["DIN", "GAVE", "ER", "MIN"],
  lines: [
    "Kære Anne",
    "Jeg har taget din adventsgave og låst den inde i MIN kiste. Med en hængelås. Fire cifre.",
    "Hver søndag i advent åbner jeg en portal. Bag den venter en prøve. Klarer du den, får du et ciffer. Fire portaler, fire cifre, én kiste.",
    "Jeg ved godt, hvor meget du hader escape rooms. Men jeg håber stadig, du har lyst til at lege med. 🥺",
    "Ingen snyd.",
    "Finn 🐾",
    "PS. Godbidder fremskynder IKKE processen. Måske lidt.",
  ],
};

/** The letter itself: cut-out title, handwritten body, paw stamp. */
export function letterParts() {
  const title = cutout(LETTER.title);
  const body = document.createElement("div");
  body.className = "ransom-body";
  for (const text of LETTER.lines) {
    const p = document.createElement("p");
    p.textContent = text;
    body.append(p);
  }
  body.lastElementChild.className = "ransom-ps";
  body.children[5].className = "ransom-sign";
  const stamp = document.createElement("span");
  stamp.className = "ransom-paw";
  stamp.textContent = "🐾";
  stamp.setAttribute("aria-hidden", "true");
  return [title, body, stamp];
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
  el.append(summary, ...letterParts());
  el.addEventListener("toggle", () => {
    if (!el.open) return;
    markLetterSeen();
    el.classList.remove("unread");
    el.querySelector(".ransom-badge")?.remove();
  });
  return el;
}

