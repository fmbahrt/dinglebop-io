// Shared building blocks for the weekly puzzles (stregkode.js, kryds.js, ...).
//
// Every puzzle type exports a function (opgave, { week, slug }) that returns the
// task interface app.js drives:
//   { el, activate(), deactivate(), isSolved(), reset(), onSolved(fn) }
// taskShell() implements that interface; a puzzle only renders its locked view
// and calls solve() when it is done.

const ORDINAL = ["Første", "Andet", "Tredje", "Fjerde"];

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
      h("p", "task-label", `${ORDINAL[week - 1] ?? ""} tal`.trim()),
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

/** Optional heading + text from opgave.json (left out = nothing, so nothing is given away). */
export function intro(opgave) {
  return [
    ...(opgave.overskrift ? [h("h2", "task-title", opgave.overskrift)] : []),
    ...(opgave.tekst ? [h("p", "task-text", opgave.tekst)] : []),
  ];
}
