// Answer puzzle: type the right answer to unlock the number.
//
//   { "type": "svar", "spørgsmål": "…", "svar": ["rudolf", "rudolph"], "tal": "2" }
//
// Case, spaces and punctuation are ignored when comparing.

import { h, button, shake, taskShell, intro } from "/felles.js";

const norm = (s) => String(s ?? "").toLocaleLowerCase("da").replace(/[^\p{L}\p{N}]/gu, "");

export function svarOpgave(opgave, ctx) {
  const answers = [].concat(opgave.svar ?? []).map(norm).filter(Boolean);

  function renderLocked(card, solve) {
    const form = h("form", "manual");
    const input = h("input");
    Object.assign(input, { autocomplete: "off", spellcheck: false, placeholder: "Dit svar" });
    input.setAttribute("aria-label", "Dit svar");
    const msg = h("p", "manual-msg");
    form.append(input, button("Svar", "btn btn-small", () => form.requestSubmit()), msg);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (answers.includes(norm(input.value))) return solve();
      msg.textContent = "Hmm, det passer ikke 🤔";
      shake(form);
    });
    card.replaceChildren(
      ...intro(opgave),
      ...(opgave.spørgsmål ? [h("p", "task-question", opgave.spørgsmål)] : []),
      form,
    );
  }

  return taskShell(opgave, ctx, { renderLocked });
}
