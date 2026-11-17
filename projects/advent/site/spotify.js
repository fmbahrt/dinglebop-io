// Step "spotify": find the right song in a playlist. Wrong songs get skipped with
// a message; the right one opens "now playing", and then the step is done.
//
//   { "type": "spotify", "spilleliste": "Køretur 🚗", "beskrivelse": "Vores køresang…",
//     "sange": [ { "titel": "…", "kunstner": "…", "billede": "cover-1.jpg", "nej": "Skip ⏭️" },
//                { "titel": "…", "kunstner": "…", "rigtig": true } ],
//     "afspil": ["Første linje vist mens den spiller", "…"] }
//
// "billede" is album art in the week folder; without it a cover is drawn from
// "emoji" and "farve" (two colours).

import { h, button } from "/felles.js";
import { beep } from "/trin.js";

const fold = (s) => String(s ?? "").toLocaleLowerCase("da").normalize("NFD").replace(/[̀-ͯ]/g, "");
const SKIPS = ["Næh, skip ⏭️", "Ikke den… ⏭️", "Den skipper vi altid ⏭️"];

// Inside the car (bil.js) it runs embedded: { embedded: true, onPlay(song) } — no
// page scrolling, and onPlay fires as soon as the right song starts.
export default function spotify(cfg, { slug, done, embedded = false, onPlay }) {
  const songs = cfg.sange ?? [];
  const root = h("div", "app spot");

  const cover = (s, cls) => {
    const c = h("span", `spot-cover ${cls ?? ""}`);
    if (s.billede) {
      const img = h("img");
      img.src = `/${slug}/${s.billede}`;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      c.append(img);
    } else {
      const [a, b] = s.farve ?? ["#535353", "#181818"];
      c.style.background = `linear-gradient(135deg, ${a}, ${b})`;
      c.textContent = s.emoji ?? "🎵";
    }
    return c;
  };

  function showList() {
    const head = h("div", "spot-head");
    const art = h("span", "spot-plcover", cfg.ikon ?? "🚗");
    const info = h("div", "spot-plinfo");
    info.append(h("p", "spot-plname", cfg.spilleliste ?? "Køretur"), ...(cfg.beskrivelse ? [h("p", "spot-pldesc", cfg.beskrivelse)] : []), h("p", "spot-plmeta", `${songs.length} sange`));
    head.append(art, info);

    const search = h("input", "spot-search");
    Object.assign(search, { type: "search", placeholder: "Find i playliste", autocomplete: "off", spellcheck: false });
    search.setAttribute("aria-label", "Find i playliste");

    const toast = h("p", "spot-toast");
    const shuffle = button("", "spot-shuffle", () => {
      toast.textContent = cfg.shuffle ?? "Shuffle? Nej, vi skal have den rigtige 😉";
      flashToast();
    });
    shuffle.setAttribute("aria-label", "Bland");
    shuffle.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13l11-6.5z"/></svg>`;
    const tools = h("div", "spot-tools");
    tools.append(search, shuffle);

    const list = h("ol", "spot-list");
    const rows = songs.map((s) => {
      const li = h("li");
      const row = button("", "spot-row", () => pick(s, row));
      const text = h("span", "spot-rowtext");
      text.append(h("span", "spot-title", s.titel), h("span", "spot-artist", s.kunstner ?? ""));
      row.append(cover(s, "small"), text, h("span", "spot-dots", "⋯"));
      li.append(row);
      list.append(li);
      return { s, li };
    });
    const empty = h("p", "spot-empty", "Ingen sange matcher 🤷");
    empty.hidden = true;
    search.addEventListener("input", () => {
      const q = fold(search.value.trim());
      let shown = 0;
      for (const { s, li } of rows) {
        const hit = !q || fold(`${s.titel} ${s.kunstner}`).includes(q);
        li.hidden = !hit;
        shown += hit;
      }
      empty.hidden = shown > 0;
    });

    let toastTimer = 0;
    const flashToast = () => {
      toast.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
    };

    function pick(s, row) {
      if (s.rigtig) return play(s);
      navigator.vibrate?.(120);
      row.classList.remove("skip");
      void row.offsetWidth;
      row.classList.add("skip");
      toast.textContent = s.nej ?? SKIPS[(Math.random() * SKIPS.length) | 0];
      flashToast();
    }

    root.replaceChildren(head, tools, list, empty, toast);
  }

  function play(s) {
    beep(880, 60);
    const screen = h("div", "spot-now");
    const bar = h("div", "spot-prog");
    bar.append(h("div", "spot-prog-fill"));
    const times = h("div", "spot-times");
    times.append(h("span", null, "0:00"), h("span", null, s.længde ?? "3:30"));
    const ctrls = h("div", "spot-ctrls");
    ctrls.append(h("span", null, "⏮"), h("span", "spot-pause", "⏸"), h("span", null, "⏭"));
    const lyric = h("p", "spot-lyric");
    screen.append(h("p", "spot-now-from", `AFSPILLER FRA PLAYLISTE · ${cfg.spilleliste ?? ""}`.trim()), cover(s, "big"), h("p", "spot-now-title", s.titel), h("p", "spot-artist", s.kunstner ?? ""), bar, times, ctrls, lyric);
    root.replaceChildren(screen);
    if (!embedded) root.scrollIntoView({ behavior: "smooth", block: "start" });
    onPlay?.(s);
    requestAnimationFrame(() => screen.classList.add("playing"));

    const lines = [].concat(cfg.afspil ?? []);
    lines.forEach((line, i) => setTimeout(() => {
      lyric.textContent = line;
      lyric.classList.remove("in");
      void lyric.offsetWidth;
      lyric.classList.add("in");
    }, 1200 + i * 2200));
    if (done) setTimeout(done, 1200 + Math.max(1, lines.length) * 2200 + 1200);
  }

  showList();
  return { el: root };
}

