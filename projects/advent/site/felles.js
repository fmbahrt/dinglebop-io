// Shared building blocks for the weekly puzzles (stregkode.js, kryds.js, ...).
//
// Every puzzle type exports a function (opgave, { week, slug }) that returns the
// task interface app.js drives:
//   { el, activate(), deactivate(), isSolved(), reset(), onSolved(fn) }
// taskShell() implements that interface; a puzzle only renders its locked view
// and calls solve() when it is done.

// Debug mode: ?debug in the URL turns it on for the rest of the visit (also
// across links, back and forward), ?nodebug turns it off again.
export const DEBUG = (() => {
  const q = new URLSearchParams(location.search);
  try {
    if (q.has("nodebug")) sessionStorage.removeItem("advent:debug");
    else if (q.has("debug")) sessionStorage.setItem("advent:debug", "1");
    return sessionStorage.getItem("advent:debug") === "1";
  } catch {
    return q.has("debug");
  }
})();
/** A same-site link that keeps ?debug on. */
export const link = (path) => (DEBUG ? `${path}?debug` : path);

export function h(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

export function button(text, className, onClick) {
  const b = h("button", className, text);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

/** localStorage wrapper that never throws (private mode, blocked storage). */
export function store(key) {
  return {
    get() { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
    set(value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ } },
    clear() { try { localStorage.removeItem(key); } catch { /* ignore */ } },
  };
}

/** Shake an element (wrong answer). */
export function shake(el) {
  el.classList.remove("shake");
  void el.offsetWidth;
  el.classList.add("shake");
}

/**
 * Common task plumbing: solved state, the unlocked number view, reset and listeners.
 *   renderLocked(card, solve)  draws the puzzle into card; call solve() when done
 *   activate / deactivate      start/stop anything live (camera) while visible
 *   onReset                    clear the puzzle's own saved progress
 */
export function taskShell(opgave, { week, slug }, { renderLocked, activate = () => {}, deactivate = () => {}, onReset = () => {} }) {
  const solved = store(`advent:${slug}:løst`);
  const card = h("section", "task");
  const listeners = [];

  function showLocked() {
    card.className = "task";
    renderLocked(card, solve);
  }

  function showUnlocked(animate) {
    card.className = `task unlocked${animate ? " pop" : ""}`;
    card.replaceChildren(
      h("p", "task-label", `Klaret · ciffer ${week} af 4`),
      h("p", "task-number", opgave.tal ?? "?"),
      h("p", "task-text", opgave.løst ?? "Godt klaret! Husk tallet 🎉"),
    );
  }

  function solve() {
    deactivate();
    solved.set(true);
    navigator.vibrate?.([40, 60, 120]);
    showUnlocked(true);
    listeners.forEach((fn) => fn());
  }

  solved.get() ? showUnlocked(false) : showLocked();

  return {
    el: card,
    isSolved: () => solved.get() === true,
    activate: () => { if (solved.get() !== true) activate(); },
    deactivate: () => deactivate(),
    reset: () => {
      deactivate();
      solved.clear();
      onReset();
      showLocked();
    },
    onSolved: (fn) => listeners.push(fn),
  };
}

/**
 * Optional text from opgave.json (left out = nothing, so nothing is given away).
 * "overskrift" is the page headline now, so it isn't repeated above the puzzle.
 */
export function intro(opgave) {
  return [
    ...(opgave.tekst ? [h("p", "task-text", opgave.tekst)] : []),
  ];
}

/** In an app's built-in browser (QR scanner, Facebook, Instagram …)? Those
 *  borrow the app's permissions and usually may not use the microphone. */
export function inAppBrowser() {
  const ua = navigator.userAgent;
  return /; wv\)/.test(ua) || /FBAN|FBAV|Instagram|Line\/|Snapchat|GSA\//.test(ua);
}

/**
 * A helpful message when the microphone or camera won't open, from the error's
 * name. what = "mikrofonen" | "kameraet". In debug the raw error is appended.
 */
export function mediaError(e, what) {
  const ios = /iPhone|iPad/.test(navigator.userAgent);
  const browser = ios ? "Safari" : "Chrome";
  const name = e?.name ?? "";
  let text;
  if (!navigator.mediaDevices?.getUserMedia) text = `Den her browser kan ikke bruge ${what}. Åbn siden i ${browser} 🙏`;
  else if (inAppBrowser()) text = `Den indbyggede browser må ikke bruge ${what}. Åbn siden i ${browser} (⋮ → "Åbn i ${browser}") 🙏`;
  else if (name === "NotAllowedError" || name === "SecurityError") text = `Jeg fik ikke lov at bruge ${what}. Tryk på 🔒 ved adressen, tillad ${what}, og prøv igen.`;
  else if (name === "NotFoundError" || name === "OverconstrainedError") text = `Jeg kan ikke finde ${what} på telefonen 🤔`;
  else if (name === "NotReadableError" || name === "AbortError") text = `En anden app bruger ${what} lige nu. Luk den, og prøv igen.`;
  else text = `${what[0].toUpperCase()}${what.slice(1)} ville ikke starte. Prøv igen.`;
  return DEBUG ? `${text} (${name || "?"}: ${e?.message ?? e})` : text;
}
