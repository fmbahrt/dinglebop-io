// Step "tv": "what shall we watch tonight?" A streaming app with a grid of shows
// and a list of demands from the sofa. Exactly one show meets all of them; any
// other gets vetoed with its "nej" line.
//
//   { "type": "tv", "krav": [ { "hvem": "Dig", "tekst": "Intet uhyggeligt 🙈" }, … ],
//     "serier": [ { "titel": "Badehotellet", "genre": "Drama", "min": 44, "land": "🇩🇰",
//                   "set": true, "billede": "tv-badehotellet.jpg",
//                   "nej": "Den har vi set. Flere gange 🙄" },
//
// "set" is true, false or "lidt" (partly seen). "billede" is a poster in the
// week folder; without it a poster is drawn from "emoji" + "farve" (two colours).
//                 { "titel": "…", "rigtig": true } ],
//     "afspil": "…og så faldt vi i søvn efter ti minutter 😴" }

import { h, button, shake } from "/felles.js";
import { beep } from "/trin.js";

export default function tv(cfg, { slug, done }) {
  const root = h("div", "app tv");
  const top = h("div", "tv-top");
  top.append(h("span", "tv-logo", "TV 2 PLAY"), h("span", "tv-avatar", "🛋️"));

  const ask = h("p", "tv-h", cfg.spørgsmål ?? "Hvad skal vi se i aften?");
  const krav = h("ul", "tv-krav");
  for (const k of cfg.krav ?? []) {
    const li = h("li");
    li.append(h("b", null, k.hvem ?? ""), h("span", null, k.tekst ?? ""));
    krav.append(li);
  }

  const grid = h("div", "tv-grid");
  const sheet = h("div", "tv-sheet");
  sheet.hidden = true;

  for (const s of cfg.serier ?? []) {
    const card = button("", "tv-card", () => pick(s, card));
    card.setAttribute("aria-label", s.titel ?? "");
    card.append(poster(s, slug), metaEl(s));
    grid.append(card);
  }

  function pick(s, card) {
    grid.querySelectorAll(".tv-card").forEach((c) => c.classList.toggle("picked", c === card));
    const big = poster(s, slug, true);
    const info = h("div", "tv-sheet-info");
    const veto = h("p", "tv-veto");
    const play = button("▶  Afspil", "tv-play", () => {
      if (s.rigtig) return playIt(s);
      navigator.vibrate?.(160);
      veto.textContent = s.nej ?? "Næh, ikke den i aften 🤔";
      veto.classList.add("show");
      shake(play);
    });
    info.append(h("p", "tv-sheet-title", s.titel), metaEl(s), play);
    sheet.replaceChildren(big, info, veto);
    sheet.hidden = false;
    sheet.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function playIt(s) {
    beep(990, 70);
    const player = h("div", "tv-player");
    const bar = h("div", "tv-player-bar");
    const fill = h("div", "tv-player-fill");
    bar.append(fill);
    const spinner = h("div", "tv-spinner");
    const joke = h("p", "tv-joke", cfg.afspil ?? "");
    player.append(h("p", "tv-player-title", s.titel), spinner, bar, joke);
    root.replaceChildren(top, player);
    root.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => player.classList.add("playing"), 1400);
    setTimeout(() => player.classList.add("joke"), 4200);
    setTimeout(done, cfg.afspil ? 7600 : 4800);
  }

  root.append(top, ask, krav, grid, sheet);
  return { el: root };
}

const meta = (s) => [s.genre, s.min != null && `${s.min} min`, s.land].filter(Boolean).join("  ·  ");
function metaEl(s) {
  const el = h("span", "tv-card-meta", meta(s));
  if (s.set) el.append(h("span", "tv-seen-text", s.set === "lidt" ? "Set lidt" : "Set ✓"));
  return el;
}

function poster(s, slug, big = false) {
  const p = h("span", `tv-poster${big ? " big" : ""}`);
  if (s.billede) {
    const img = h("img");
    img.src = `/${slug}/${s.billede}`;
    img.alt = s.titel ?? "";
    img.decoding = "async";
    p.append(img);
  } else {
    const [a, b] = s.farve ?? ["#3a3f5c", "#14161f"];
    p.style.background = `linear-gradient(160deg, ${a}, ${b})`;
    p.append(h("span", "tv-poster-emoji", s.emoji ?? "🎬"), h("span", "tv-poster-title", s.titel));
  }
  if (s.set) {
    const some = s.set === "lidt";
    p.classList.add("seen");
    const bar = h("span", "tv-seen");
    if (some) bar.style.width = "30%";
    p.append(bar);
  }
  return p;
}
