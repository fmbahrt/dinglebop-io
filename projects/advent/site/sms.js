// Finn's message for the week, as texts on her phone: the lock screen buzzes
// with a notification from Finn, a tap opens the thread, and the messages come
// in one by one ("…" while he types). The first one is a photo of his cut-out
// ransom collage. Paragraphs in brev.txt become messages (long ones are split
// into a few); a line with just a filename is a photo from the week's folder.
//
//   const sms = smsPhone({ body, slug, collage, onDone });   its own phone
//   const sms = smsApp(screen, { body, slug, collage, onDone });   inside another phone
//   sms.start()    lock screen → notification → thread, animated
//   sms.showAll()  the whole thread at once (reading it again)
//   sms.close()    (smsApp) go to that phone's home screen
//   smsApp(screen, { …, home })  adds an iOS home indicator ("Stryg op for at gå
//                                hjem", swipe up or tap) and a working ‹ once all texts are in

import { h, button } from "/felles.js";
import { phoneStatus, beep } from "/trin.js";

const IMAGE = /^[\w.-]+\.(jpe?g|png|webp|gif)$/i;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Paragraphs → messages; long paragraphs are split at sentence ends. */
function messages(body) {
  const out = [];
  for (const para of body.split(/\n\s*\n/)) {
    const text = para.trim();
    if (!text) continue;
    if (IMAGE.test(text)) { out.push({ photo: text }); continue; }
    if (text.length <= 160) { out.push({ text }); continue; }
    let chunk = "";
    for (const sentence of text.split(/(?<=[.!?…)])\s+/)) {
      if (chunk && chunk.length + sentence.length > 130) { out.push({ text: chunk }); chunk = ""; }
      chunk = chunk ? `${chunk} ${sentence}` : sentence;
    }
    if (chunk) out.push({ text: chunk });
  }
  return out;
}

/** A phone of its own with Finn's texts. */
export function smsPhone(opts) {
  const phone = h("div", "iph sms-phone");
  const screen = h("div", "iph-screen");
  const { el: status, tick } = phoneStatus();
  screen.append(status);
  const app = smsApp(screen, { ...opts, tick });
  screen.append(h("span", "iph-homebar-static"));
  phone.append(screen);
  return { el: phone, start: app.start, showAll: app.showAll };
}

/**
 * Finn's texts inside an existing phone screen (.iph-screen with a status bar),
 * e.g. the phone that gets plugged into the car in week 4. While the texts are
 * up the screen has .sms-mode (its home screen is hidden); close() goes home.
 */
/** Has she read this week's texts to the end before? (key: smsData.seenKey) */
export function smsRead(key) {
  try { return !!key && localStorage.getItem(key) === "1"; } catch { return false; }
}

export function smsApp(screen, { body, slug, collage, seenKey, from = "Finn 🐾", avatar = "🐶", onDone: done = () => {}, home = null, tick = () => {} }) {
  // With "home" (a phone that has a home screen): once all texts are in, the
  // home indicator (swipe up, like iOS) and the ‹ arrow close the thread and
  // then call home().
  let canLeave = false;
  const goHome = () => {
    if (!canLeave) return;
    screen.querySelector(".sms-gohome")?.remove();
    close();
    home?.();
  };
  const onDone = () => {
    try { if (seenKey) localStorage.setItem(seenKey, "1"); } catch { /* private mode */ }
    if (home) {
      canLeave = true;
      screen.querySelector(".sms-gohome")?.remove();
      screen.append(homeIndicator());
    }
    done();
  };
  /** iOS style: "Stryg op for at gå hjem" over the home indicator; swipe up (or tap). */
  function homeIndicator() {
    const el = button("", "sms-gohome", goHome);
    el.setAttribute("aria-label", "Gå hjem");
    el.append(h("span", "sms-gohome-text", "Stryg op for at gå hjem"), h("span", "sms-gohome-bar"));
    let y0 = null;
    el.addEventListener("pointerdown", (e) => { y0 = e.clientY; el.setPointerCapture?.(e.pointerId); });
    el.addEventListener("pointermove", (e) => {
      if (y0 == null) return;
      const up = Math.max(0, y0 - e.clientY);
      el.style.setProperty("--lift", `${Math.min(up, 40)}px`);
      if (up > 36) { y0 = null; goHome(); }
    });
    const reset = () => { y0 = null; el.style.setProperty("--lift", "0px"); };
    el.addEventListener("pointerup", reset);
    el.addEventListener("pointercancel", reset);
    return el;
  }
  screen.classList.add("sms-screen", "sms-mode");
  const msgs = [...(collage ? [{ collage }] : []), ...messages(body)];
  // The notification shows the first real line (skipping a short "Kære Anne").
  const texts = msgs.filter((m) => m.text).map((m) => m.text);
  const firstText = texts.find((t) => t.length > 15) ?? texts[0] ?? "📷 Billede";

  // ---- lock screen
  const lock = h("div", "sms-lock");
  const now = new Date();
  const date = h("p", "sms-date", now.toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long" }));
  const time = h("p", "sms-time", now.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" }).replace(".", ":"));
  const notes = h("div", "sms-notes");
  const tapHint = h("p", "sms-taphint", "");
  lock.append(date, time, notes, tapHint);

  // ---- the thread
  const thread = h("div", "sms-thread");
  const head = h("div", "sms-head");
  const back = button("‹", "sms-back", goHome);
  back.setAttribute("aria-label", "Tilbage");
  head.append(back, h("span", "sms-avatar", avatar), h("span", "sms-name", from));
  const list = h("div", "sms-list");
  const input = h("div", "sms-input");
  input.append(h("span", "sms-plus", "+"), h("span", "sms-field", "iMessage"));
  thread.append(head, list, input);

  screen.append(lock, thread);

  let run = 0;     // bumps on every (re)start so an old run stops
  let skip = null; // resolves the current wait early (tap = faster)
  const wait = (ms) => new Promise((r) => {
    const t = setTimeout(r, reducedMotion ? 0 : ms);
    skip = () => { clearTimeout(t); r(); };
  });
  list.addEventListener("click", () => skip?.());

  function bubble(m, animate) {
    let b;
    if (m.collage) {
      b = h("div", "sms-bubble sms-pic");
      b.append(m.collage.cloneNode(true));
    } else if (m.photo) {
      b = h("div", "sms-bubble sms-pic");
      const img = h("img");
      img.src = `/${slug}/${m.photo}`;
      img.alt = "";
      b.append(img);
    } else {
      b = h("div", "sms-bubble", m.text);
      if (/^P\.?S\b/i.test(m.text)) b.classList.add("ps");
    }
    if (animate) b.classList.add("pop");
    return b;
  }
  const toBottom = () => { list.scrollTop = list.scrollHeight; };

  function reset() {
    run++;
    skip?.();
    tick();
    list.replaceChildren(h("p", "sms-day", `I dag ${time.textContent}`));
    notes.replaceChildren();
    tapHint.textContent = "";
    screen.classList.remove("open");
    screen.classList.add("sms-mode");
    canLeave = false;
    screen.querySelector(".sms-gohome")?.remove();
  }

  async function start() {
    reset();
    const mine = run;
    await wait(900);
    if (mine !== run) return;
    // Bzzz: the notification.
    const note = button("", "sms-note", () => openThread(mine));
    const top = h("span", "sms-note-top");
    top.append(h("span", "sms-note-app", "💬"), h("span", "sms-note-label", "BESKEDER"), h("span", "sms-note-when", "nu"));
    note.append(top, h("span", "sms-note-from", from), h("span", "sms-note-text", firstText));
    notes.append(note);
    // Phones only allow vibration after a tap on the page.
    if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([60, 80, 60]);
    beep(1568, 90);
    setTimeout(() => beep(2093, 120), 120);
    await wait(1400);
    if (mine === run && !screen.classList.contains("open")) tapHint.textContent = "Tryk på beskeden for at åbne";
  }

  async function openThread(mine) {
    if (mine !== run || screen.classList.contains("open")) return;
    screen.classList.add("open");
    await wait(450);
    for (const m of msgs) {
      if (mine !== run) return;
      const typing = h("div", "sms-bubble sms-typing");
      typing.append(h("i"), h("i"), h("i"));
      list.append(typing);
      toBottom();
      const len = m.text?.length ?? 40;
      await wait(Math.min(1900, 550 + len * 14));
      if (mine !== run) return;
      typing.replaceWith(bubble(m, true));
      beep(880, 40);
      toBottom();
      await wait(350);
    }
    if (mine !== run) return;
    list.append(h("p", "sms-day", "Leveret"));
    toBottom();
    onDone();
  }

  function showAll() {
    reset();
    screen.classList.add("open");
    list.append(...msgs.map((m) => bubble(m, false)), h("p", "sms-day", "Leveret"));
    requestAnimationFrame(toBottom);
    onDone();
  }

  /** Leave the thread for the home screen underneath. */
  function close() {
    run++;
    canLeave = false;
    screen.querySelector(".sms-gohome")?.remove();
    screen.classList.remove("open", "sms-mode");
  }

  return { start, showAll, close };
}
