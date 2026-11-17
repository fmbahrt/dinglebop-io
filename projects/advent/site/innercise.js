// Step "innercise": book the right sauna gus in an Innercise-like booking app
// (dark schedule with a week strip, class cards, a detail page with a big
// button). A note says which one; the schedule has look-alikes (wrong day,
// wrong gus master, too early, full, too few spots), each with its own answer.
//
//   { "type": "innercise", "besked": "Book os på Brians aftengus …",
//     "mål": { "dag": "Søn 29/11", "mester": "Brian", "efter": 18, "personer": 2 },
//     "dage": ["Man 23/11", …, "Søn 29/11"], "startdag": 0,
//     "sted": "Sauna på tagterrasse, Bådehavnsgade 12", "pris": 275, "varighed": 75,
//     "hold": [ { "dag": "Søn 29/11", "tid": "19:30", "titel": "Sydhavn - Is & ild", "mester": "Brian",
//                 "ledige": 3, "tema": "Aromaterapi i sauna", "tekst": "Saunagus, åndedræt, dufte og isbad" }, … ],
//     "billet": "Din billet med QR-kode er gemt et sted derhjemme 🔍" }

import { h, button, shake } from "/felles.js";
import { beep } from "/trin.js";

const WEEKDAY = { Man: "Mandag", Tir: "Tirsdag", Ons: "Onsdag", Tor: "Torsdag", Fre: "Fredag", Lør: "Lørdag", Søn: "Søndag" };
const MONTH = ["jan.", "feb.", "mar.", "apr.", "maj", "jun.", "jul.", "aug.", "sep.", "okt.", "nov.", "dec."];
const AVATAR = { Brian: "🧔‍♂️", Mette: "👩‍🦰", Jonas: "👨‍🦱", Sofie: "👩" };
const ICON = {
  people: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm7 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM9 13c-3.3 0-6 1.6-6 3.6V19h12v-2.4C15 14.6 12.3 13 9 13zm7 0c-.6 0-1.2.1-1.7.2 1.1.9 1.7 2 1.7 3.4V19h5v-2.4c0-2-2.2-3.6-5-3.6z"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M21 3 3 10.5l7.5 3L14 21z"/></svg>`,
  back: `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>`,
  cal: `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>`,
  filter: `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M7 12h10M10 17h4"/></svg>`,
};
const TABS = [["🕘", "Skema"], ["☰", "Kurser"], ["🛒", "Priser"], ["👤", "Profil"], ["•••", "Mere"]];

const addMin = (t, m) => {
  const [hh, mm] = t.split(":").map(Number);
  const x = hh * 60 + mm + m;
  return `${Math.floor(x / 60) % 24}:${String(x % 60).padStart(2, "0")}`;
};
const parseDay = (d) => {
  const [wd, date = ""] = d.split(" ");
  const [day, month] = date.split("/").map(Number);
  return { wd, day, month, long: `${WEEKDAY[wd] ?? wd}, ${day} ${MONTH[(month || 1) - 1]}` };
};
const svgEl = (html, cls = "") => {
  const s = h("span", `inn-ico ${cls}`);
  s.innerHTML = html;
  return s;
};

export default function innercise(cfg, { done }) {
  const goal = { dag: "", mester: "Brian", efter: 18, personer: 2, ...(cfg.mål ?? {}) };
  const days = cfg.dage ?? [];
  const sessions = cfg.hold ?? [];
  const minutes = Number(cfg.varighed ?? 75);
  const price = cfg.pris ?? 275;
  const place = cfg.sted ?? "Sauna på tagterrasse";
  let day = days[cfg.startdag ?? 0];

  const root = h("div", "app inn");
  const screen = h("div", "inn-screen");
  const tabbar = h("nav", "inn-tabbar");
  TABS.forEach(([icon, label], i) => {
    const t = h("span", `inn-tabbar-item${i === 0 ? " on" : ""}`);
    t.append(h("span", "inn-tabbar-icon", icon), h("span", null, label));
    tabbar.append(t);
  });
  root.append(screen, tabbar);

  const go = (...children) => {
    screen.replaceChildren(...children);
    screen.classList.remove("in");
    void screen.offsetWidth;
    screen.classList.add("in");
  };

  // ---- schedule: week strip + the selected day and the days after it
  function showSchedule(scrollTo) {
    const head = h("div", "inn-head");
    head.append(h("span", "inn-brand", "Innercise"), svgEl(ICON.cal), svgEl(ICON.filter, "dot"));
    const note = h("div", "inn-note");
    note.append(h("span", "inn-note-from", "💬"), h("p", null, cfg.besked ?? ""));

    const strip = h("div", "inn-week");
    for (const d of days) {
      const p = parseDay(d);
      const has = sessions.some((s) => s.dag === d);
      const b = button("", `inn-day${d === day ? " on" : ""}${p.wd === "Lør" || p.wd === "Søn" ? " weekend" : ""}`, () => {
        day = d;
        showSchedule(true);
      });
      b.append(h("span", "inn-day-wd", p.wd.toUpperCase()), h("span", "inn-day-n", String(p.day)), h("span", `inn-day-dot${has ? "" : " none"}`));
      strip.append(b);
    }

    const list = h("div", "inn-list");
    for (const d of days.slice(days.indexOf(day))) {
      const today = sessions.filter((s) => s.dag === d).sort((a, b) => a.tid.localeCompare(b.tid));
      const group = h("section", "inn-group");
      const gh = h("div", "inn-group-head");
      gh.append(h("span", "inn-group-day", parseDay(d).long), h("span", "inn-group-n", today.length ? `${today.length} hold` : "Ingen hold"));
      group.append(gh, ...today.map(card));
      list.append(group);
    }

    go(head, ...(cfg.besked ? [note] : []), strip, list);
    if (scrollTo) root.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function card(s) {
    const full = !s.ledige;
    const c = button("", `inn-card${full ? " full" : ""}`, () => showDetail(s));
    const time = h("div", "inn-card-time");
    time.append(h("span", "inn-t-start", s.tid), h("span", "inn-t-len", `${minutes} min`), h("span", "inn-t-end", addMin(s.tid, minutes)));
    const body = h("div", "inn-card-body");
    const chips = h("div", "inn-chips");
    const phys = h("span", "inn-chip");
    phys.append(svgEl(ICON.people), document.createTextNode("FYSISK HOLD"));
    chips.append(phys, ...(full ? [h("span", "inn-chip light", "FULDT BOOKET")] : []));
    const who = h("p", "inn-card-who");
    who.append(document.createTextNode(`${s.mester} • `), svgEl(ICON.pin), document.createTextNode(` ${place}`));
    const spots = h("span", "inn-pill");
    spots.append(svgEl(full ? ICON.clock : ICON.people), document.createTextNode(full ? `${s.venteliste ?? 0} på venteliste` : `${s.ledige} ledig${s.ledige === 1 ? "" : "e"} plads${s.ledige === 1 ? "" : "er"}`));
    body.append(chips, h("p", "inn-price", `${price} kr.`), h("p", "inn-card-title", s.titel ?? "Saunagus og isbad"), who, spots);
    c.append(time, body);
    return c;
  }

  // ---- detail page
  function showDetail(s) {
    const p = parseDay(s.dag);
    const full = !s.ledige;
    const top = h("div", "inn-detail-top");
    const back = button("", "inn-back", () => showSchedule());
    back.innerHTML = ICON.back;
    back.setAttribute("aria-label", "Tilbage");
    top.append(back, h("span", null, `${p.day}. ${MONTH[(p.month || 1) - 1].replace(".", "").replace(/^./, (c) => c.toUpperCase())} · ${s.tid}–${addMin(s.tid, minutes)}`));

    const hero = h("div", "inn-hero");
    const logo = h("div", "inn-hero-logo");
    logo.append(h("span", "inn-hero-brand", "innercise"), h("span", "inn-hero-tag", "ægte styrke bygges indefra"));
    const gennem = h("div", "inn-hero-gennem");
    gennem.append(h("b", null, "Gennem"), h("span", null, s.tekst ?? "Saunagus, åndedræt, dufte og isbad"));
    hero.append(h("span", "inn-hero-len", `${minutes} MIN`), logo, h("p", "inn-hero-theme", s.tema ?? "Aromaterapi i sauna"), gennem);

    const chips = h("div", "inn-chips big");
    const phys = h("span", "inn-chip");
    phys.append(svgEl(ICON.people), document.createTextNode("FYSISK HOLD"));
    chips.append(phys, h("span", "inn-chips-text", full ? "Fuldt booket" : `${s.ledige} ledig${s.ledige === 1 ? "" : "e"} plads${s.ledige === 1 ? "" : "er"}`));

    const teacher = h("div", "inn-row");
    teacher.append(h("span", "inn-avatar", AVATAR[s.mester] ?? "🧖"), h("span", "inn-row-text"));
    teacher.lastChild.append(h("span", "inn-row-label", "UNDERVISER"), h("span", "inn-row-value", s.mester));
    const room = h("div", "inn-row");
    room.append(svgEl(ICON.pin, "inn-avatar small"), h("span", "inn-row-text"));
    room.lastChild.append(h("span", "inn-row-label", "LOKALE"), h("span", "inn-row-value", place));

    let people = 1;
    const count = h("span", "inn-count", "1");
    const minus = button("−", "inn-step", () => { people = Math.max(1, people - 1); count.textContent = String(people); err.textContent = ""; });
    const plus = button("+", "inn-step", () => { people = Math.min(6, people + 1); count.textContent = String(people); err.textContent = ""; });
    const stepper = h("div", "inn-stepper");
    stepper.append(h("span", null, "Antal pladser"), minus, count, plus);
    const err = h("p", "inn-err");
    const book = button(full ? "Skriv på venteliste" : "Book", "inn-book", () => {
      const why = verdict(s, people);
      if (!why) return confirm(s, people);
      navigator.vibrate?.(140);
      err.textContent = why;
      shake(book);
    });

    go(top, hero, h("p", "inn-price", `${price} kr.`), h("p", "inn-detail-title", s.titel ?? "Saunagus og isbad"), chips, teacher, room, stepper, err, book);
    root.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** null when this is the right booking, otherwise what to say. */
  function verdict(s, people) {
    if (s.nej) return s.nej;
    if (s.mester !== goal.mester) return `Det er ikke ${goal.mester} 😉`;
    if (goal.dag && s.dag !== goal.dag) return "Forkert dag 📅";
    if (Number(s.tid.split(":")[0]) < goal.efter) return "Det er ikke aften endnu 🌅";
    if (!s.ledige) return "Fuldt booket 😢 Find et andet hold";
    if (people > s.ledige) return `Der er kun ${s.ledige} ledig plads 😬`;
    if (people < goal.personer) return "Skal jeg ikke med? 🥲";
    if (people > goal.personer) return `Vi er kun ${goal.personer} 😄`;
    return null;
  }

  function confirm(s, people) {
    beep(1047, 90);
    setTimeout(() => beep(1568, 140), 110);
    navigator.vibrate?.([30, 50, 100]);
    const p = parseDay(s.dag);
    const box = h("div", "inn-done");
    const ticket = h("div", "inn-ticket");
    ticket.append(
      h("p", "inn-ticket-head", "✓ Du er booket!"),
      h("p", "inn-ticket-title", s.titel ?? "Saunagus og isbad"),
      h("p", "inn-ticket-meta", `${p.long} · ${s.tid}–${addMin(s.tid, minutes)}`),
      h("p", "inn-ticket-meta", `${s.mester} · ${people} pladser · ${place}`),
    );
    box.append(ticket, h("p", "inn-done-text", cfg.billet ?? "Din billet med QR-kode er gemt et sted derhjemme 🔍"), button("Find billetten →", "inn-book", done));
    go(box);
    root.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  showSchedule();
  return { el: root };
}
