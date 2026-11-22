// Several mini puzzles in a row around one theme. Each step must be solved before
// the next one shows (no progress bar: she shouldn't know what's coming);
// when the last one is done, the week's number unlocks.
//
//   { "type": "trin", "overskrift": "Hyggeaften 🛋️", "tal": "8", "trin": [
//       { "type": "wolt", "navn": "Mad", "ikon": "🍛", … },
//       { "type": "tv",   "navn": "TV",  "ikon": "📺", … },
//       { "type": "rema", "navn": "Slik", "ikon": "🍬", … } ] }
//
// With "visning": "telefon" the steps are apps on her phone instead, solved in
// any order. It is the same phone every week (PHONE_APPS below): this week's
// apps get a red badge, the rest only say "not now" ("nej" sets that text).
// On a step, "efter": "<type>" keeps the app closed ("låst" text) until that
// step is solved, and "udenfor": true puts it after the phone: once all apps
// are done the phone is put away and those steps follow in the normal card.
//
// A step module exports default (cfg, { slug, done }) => { el, activate?, deactivate? }
// and calls done() once its own success animation has finished.

import { h, button, store, taskShell, intro, DEBUG } from "/felles.js";
import { smsApp, smsRead } from "/sms.js";

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
  fotojagt: () => import("/fotojagt.js"),
  sang: () => import("/sang.js"),
  film: () => import("/film.js"),
  bil: () => import("/bil.js"),
  innercise: () => import("/innercise.js"),
  qr: () => import("/qrscan.js"),
  gus: () => import("/gus.js"),
};

// Her phone: the same home screen every week.
export const PHONE_APPS = [
  { type: "kryds", navn: "Krydsord", ikon: "✏️", farve: "linear-gradient(#ffffff, #f1e2b0)" },
  { type: "duolingo", navn: "Duolingo", ikon: "🦉", farve: "#58cc02" },
  { type: ["fotojagt", "panorama", "postkort"], navn: "Kamera", ikon: "📷", farve: "linear-gradient(#ececf0, #9d9da6)" },
  { type: "wolt", navn: "Wolt", html: "Wolt", klasse: "ic-wolt", farve: "#009de0" },
  { type: "rema", navn: "REMA 1000", html: "REMA<b>1000</b>", klasse: "ic-rema", farve: "#fff" },
  { type: "tv", navn: "TV 2 Play", html: "<b>TV 2</b>PLAY", klasse: "ic-tv2", farve: "linear-gradient(#1c1c22, #000)" },
  { type: "innercise", navn: "Innercise", html: "inner<b>cise</b>", klasse: "ic-inn", farve: "linear-gradient(#26221e, #0e0c0b)" },
  { type: "qr", navn: "Bruce", html: "bruce", klasse: "ic-bruce", farve: "linear-gradient(#2b2d33, #0d0e11)" },
  { navn: "Vejr", ikon: "☀️", farve: "linear-gradient(#4aa3ff, #2563eb)" },
  { navn: "Kort", ikon: "🗺️", farve: "linear-gradient(#bfe7b0, #7cc6f0)" },
  { navn: "Fotos", ikon: "🌸", farve: "#fff" },
  { navn: "Ur", ikon: "⏰", farve: "#111" },
];
export const PHONE_DOCK = [
  { navn: "Telefon", ikon: "📞", farve: "linear-gradient(#6ee36e, #24b324)" },
  { navn: "Safari", ikon: "🧭", farve: "#fff" },
  { navn: "Beskeder", ikon: "💬", farve: "linear-gradient(#6ee36e, #24b324)" },
  { navn: "Musik", ikon: "🎵", farve: "linear-gradient(#ff5e7a, #fa233b)" },
];

/** iPhone status bar: clock, dynamic island, signal, wifi and battery. */
export function phoneStatus() {
  const status = h("div", "iph-status");
  const clock = h("span", "iph-clock");
  const tick = () => { clock.textContent = new Date().toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" }).replace(".", ":"); };
  tick();
  const icons = h("span", "iph-icons");
  icons.innerHTML = '<svg viewBox="0 0 18 12" width="17" height="11" aria-hidden="true"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>'
    + '<svg viewBox="0 0 16 12" width="15" height="11" aria-hidden="true"><path d="M8 11.5 5.6 9a3.4 3.4 0 0 1 4.8 0zM3.5 7a6.4 6.4 0 0 1 9 0l1.5-1.5a8.5 8.5 0 0 0-12 0zM1.4 4.9a9.4 9.4 0 0 1 13.2 0L16 3.5a11.4 11.4 0 0 0-16 0z"/></svg>'
    + '<span class="iph-batt"><i></i></span>';
  status.append(clock, h("span", "iph-island"), icons);
  return { el: status, tick };
}

/** One app icon on the home screen (a = an entry from PHONE_APPS / PHONE_DOCK). */
export function phoneIcon(a, onTap, badge) {
  const b = button("", "iph-app", onTap);
  const tile = h("span", `iph-icon${a.klasse ? " " + a.klasse : ""}`);
  if (a.html) tile.innerHTML = a.html;
  else tile.textContent = a.ikon;
  tile.style.background = a.farve;
  if (badge) tile.append(badge);
  b.append(tile, h("span", "iph-label", a.navn));
  return b;
}

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
    if (opgave.visning === "telefon") return renderPhone(card, solve);
    card.classList.add("trin");
    const stage = h("div", "step-stage");


    const mine = ++gen;
    let at = -1; // the step on screen; a late done() from a skipped step is ignored
    const show = (n) => {
      at = n;
      current?.deactivate?.();
      current = null;
      if (n >= steps.length) return solve();
      current = makers[n](steps[n], { slug: ctx.slug, done: () => mine === gen && finished(n) });
      stage.replaceChildren(current.el);
      if (DEBUG) stage.append(button("⏭ Spring over (debug)", "debug-skip", () => mine === gen && finished(n)));
      if (active) current.activate?.();
    };

    // A step is done: save it, then a short "well done" before the next one.
    const finished = (n) => {
      if (n !== at) return;
      at = -1;
      progress.set(n + 1);
      current?.deactivate?.();
      current = null;
      if (n + 1 >= steps.length) return solve();
      // A cartoon in between needs no "well done": straight on.
      if (steps[n].direkte) return show(n + 1);
      const box = h("div", "step-done");
      box.append(
        h("p", "step-done-check", "✓"),
        h("p", "step-done-text", steps[n].klaret ?? "Klaret!"),
        button("Videre →", "btn", () => {
          show(n + 1);
          stage.scrollIntoView({ behavior: "smooth", block: "start" });
        }),
      );
      stage.replaceChildren(box);
    };

    card.replaceChildren(...intro(opgave), stage);
    show(Math.min(progress.get() ?? 0, steps.length));
  }

  // ---- phone home screen: apps in any order
  const solvedApps = store(`advent:${ctx.slug}:apps`);
  function renderPhone(card, solve) {
    card.classList.add("trin", "trin-phone");
    const mine = ++gen;
    const done = new Set(solvedApps.get() ?? []);
    let open = -1;
    let openMessages = null; // set below when Finn's texts live on this phone

    const phone = h("div", "iph");
    const screen = h("div", "iph-screen");
    const { el: status, tick } = phoneStatus();
    const toast = h("p", "iph-toast");
    let toastTimer = 0;
    const say = (text) => {
      toast.textContent = text;
      toast.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
    };

    const icon = phoneIcon;

    const home = h("div", "iph-home");
    const grid = h("div", "iph-grid");
    const dock = h("div", "iph-dock");
    const nope = () => say(opgave.nej ?? "Ikke nu 😉");
    // Every app on the phone; ones that aren't this week's steps are decoration.
    const inPhone = steps.map((s, i) => i).filter((i) => !steps[i].udenfor);
    const outside = steps.map((s, i) => i).filter((i) => steps[i].udenfor);
    const types = (a) => [a.type ?? []].flat();
    const stepOf = (a) => inPhone.find((i) => types(a).includes(steps[i].type)) ?? -1;
    const extra = inPhone.filter((i) => !PHONE_APPS.some((a) => types(a).includes(steps[i].type)));
    const waiting = (i) => steps[i].efter && !inPhone.some((j) => steps[j].type === steps[i].efter && done.has(j));
    const badgeFor = (i) => (done.has(i) ? h("span", "iph-badge ok", "✓") : waiting(i) ? null : h("span", "iph-badge", "1"));
    const appBtn = [];
    const drawHome = () => {
      grid.replaceChildren(
        ...PHONE_APPS.map((a) => {
          const i = stepOf(a);
          if (i < 0) return icon(a, nope);
          return (appBtn[i] = icon(a, () => openApp(i), badgeFor(i)));
        }),
        ...extra.map((i) => (appBtn[i] = icon({ navn: steps[i].navn, ikon: steps[i].ikon ?? "📱", farve: "#555" }, () => openApp(i), badgeFor(i)))),
      );
      // Beskeder opens Finn's thread again (when this week has one).
      dock.replaceChildren(...PHONE_DOCK.map((a) => icon(a, a.navn === "Beskeder" ? () => (openMessages?.() || nope()) : nope)));
    };
    const left = () => inPhone.filter((i) => !done.has(i)).length;
    const hint = h("p", "iph-hint");
    const drawHint = () => { hint.textContent = left() ? `${left()} ${left() === 1 ? "app venter" : "apps venter"} på dig` : "Alt er klaret ✨"; };
    home.append(grid, hint, dock);

    const view = h("div", "iph-view");
    const homeBar = button("", "iph-homebar", () => goHome());
    homeBar.setAttribute("aria-label", "Til hjemmeskærmen");

    function openApp(i) {
      if (open >= 0) return;
      if (done.has(i)) return say(steps[i].klaret ?? "Den er klaret ✓");
      if (waiting(i)) return say(steps[i].låst ?? "Ikke endnu 😉");
      open = i;
      toast.classList.remove("show");
      current = makers[i](steps[i], { slug: ctx.slug, done: () => mine === gen && finished(i) });
      view.replaceChildren(current.el);
      if (DEBUG) view.append(button("⏭ Spring over (debug)", "debug-skip", () => mine === gen && finished(i)));
      screen.classList.add("in-app");
      screen.dataset.app = steps[i].type;
      view.scrollTop = 0;
      if (active) current.activate?.();
      phone.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    function goHome() {
      current?.deactivate?.();
      current = null;
      open = -1;
      screen.classList.remove("in-app");
      view.replaceChildren();
      tick();
      drawHome();
      drawHint();
    }
    function finished(i) {
      if (i !== open || done.has(i)) return;
      done.add(i);
      solvedApps.set([...done]);
      goHome();
      say(steps[i].klaret ?? "Klaret! ✓");
      appBtn[i]?.classList.add("pop");
      if (!left()) setTimeout(() => mine === gen && putAway(), 1600);
    }

    // All apps done: put the phone away, then the steps outside the phone.
    function putAway() {
      if (!outside.length) return solve();
      say(opgave.væk ?? "Telefonen lægges væk 📵");
      setTimeout(() => phone.classList.add("away"), 900);
      setTimeout(() => mine === gen && nextOutside(), 1900);
    }
    function nextOutside() {
      const i = outside.find((j) => !done.has(j));
      if (i == null) return solve();
      card.classList.remove("trin-phone");
      const stage = h("div", "step-stage");
      card.replaceChildren(...intro(opgave), stage);
      open = i;
      const finish = () => {
        if (mine !== gen || open !== i) return;
        done.add(i);
        solvedApps.set([...done]);
        current?.deactivate?.();
        current = null;
        open = -1;
        nextOutside();
      };
      current = makers[i](steps[i], { slug: ctx.slug, done: finish });
      stage.replaceChildren(current.el);
      if (DEBUG) stage.append(button("⏭ Spring over (debug)", "debug-skip", finish));
      if (active) current.activate?.();
      stage.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    screen.append(status, home, view, toast, homeBar);
    phone.append(screen);
    card.replaceChildren(...intro(opgave), phone);
    drawHome();
    drawHint();

    // Finn's texts arrive on this same phone first (opgave.sms, set by app.js);
    // "Gå hjem" then shows the apps. Only on a fresh start, not halfway through.
    phoneMessages = null;
    if (opgave.sms) {
      const app = smsApp(screen, { ...opgave.sms, tick, home: () => {} });
      phoneMessages = () => {
        if (mine !== gen || !phone.isConnected || phone.classList.contains("away")) return false;
        if (open >= 0) goHome();
        app.showAll();
        return true;
      };
      openMessages = () => phoneMessages();
      // Fresh start: the texts first. Read before, or halfway through: straight to the apps.
      if (done.size === 0 && !smsRead(opgave.sms.seenKey)) requestAnimationFrame(() => app.start());
      else app.close();
    }
    if (!left()) nextOutside();
  }
  let phoneMessages = null;

  const task = taskShell(opgave, ctx, {
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
      solvedApps.clear();
      // Steps may save their own progress under advent:<slug>:…
      for (const k of ["kryds", "ordjagt", "ansigter"]) store(`advent:${ctx.slug}:${k}`).clear();
    },
  });
  /** Finn's texts again, on the same phone (false if that phone isn't on screen). */
  task.showMessages = () => phoneMessages?.() ?? false;
  return task;
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
