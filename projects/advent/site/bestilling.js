// Order-terminal puzzle: a receipt with a riddle and a POS keypad. Type the right
// dish number and "order" it; the printer prints the order and the number unlocks.
//
//   { "type": "bestilling", "svar": "8", "ret": "Rød karry i kokosmælk", "tal": "3",
//     "bon": ["STED: …", "RET: …"],
//     "næsten": { "13": "Rød karry, ja… men ikke vores 😉" } }
//
// "bon" lines are printed on the receipt as the riddle. "næsten" maps near-miss
// answers to a friendlier message.

import { h, button, shake, taskShell, intro } from "/felles.js";

const MAX_DIGITS = 3;

export function bestillingOpgave(opgave, ctx) {
  const answer = String(opgave.svar ?? "").replace(/\D/g, "").replace(/^0+/, "");
  const nearMiss = Object.fromEntries(Object.entries(opgave.næsten ?? {}).map(([k, v]) => [k.replace(/^0+/, ""), v]));

  function renderLocked(card, solve) {
    // ---- receipt
    const receipt = h("div", "bon");
    const now = new Date();
    const stamp = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}  ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    receipt.append(
      h("p", "bon-head", "★ BESTILLING ★"),
      h("p", "bon-meta", stamp),
      h("p", "bon-rule"),
      ...(opgave.bon ?? []).map((line) => h("p", "bon-line", line)),
      h("p", "bon-rule"),
      h("p", "bon-ask", "NR. ???"),
    );
    const printed = h("div", "bon-printed");
    receipt.append(printed);

    // ---- terminal
    const terminal = h("div", "pos");
    const display = h("div", "pos-display");
    const lcdTop = h("span", "pos-lcd-label", "TAST RETTENS NR.");
    const lcd = h("span", "pos-lcd");
    display.append(lcdTop, lcd);

    const keys = h("div", "pos-keys");
    let digits = "";
    let busy = false;

    const render = () => {
      lcd.textContent = `NR. ${digits.padEnd(MAX_DIGITS, "_")}`;
      lcd.classList.remove("small");
    };
    const flash = (top, text, kind) => {
      display.classList.remove("ok", "bad");
      void display.offsetWidth;
      display.classList.add(kind);
      lcdTop.textContent = top;
      lcd.textContent = text;
      lcd.classList.toggle("small", text.length > 14);
    };
    const press = (fn) => () => {
      if (busy) return;
      navigator.vibrate?.(8);
      fn();
    };

    for (const k of ["1", "2", "3", "4", "5", "6", "7", "8", "9"]) {
      keys.append(button(k, "pos-key", press(() => {
        if (digits.length < MAX_DIGITS) digits += k;
        lcdTop.textContent = "TAST RETTENS NR.";
        display.classList.remove("ok", "bad");
        render();
      })));
    }
    const back = button("⌫", "pos-key pos-fn", press(() => {
      digits = digits.slice(0, -1);
      display.classList.remove("bad");
      lcdTop.textContent = "TAST RETTENS NR.";
      render();
    }));
    back.setAttribute("aria-label", "Slet");
    const zero = button("0", "pos-key", press(() => {
      if (digits && digits.length < MAX_DIGITS) digits += "0";
      render();
    }));
    const order = button("BESTIL", "pos-key pos-go", press(() => {
      const n = digits.replace(/^0+/, "");
      if (!n) return shake(display);
      if (n === answer) {
        busy = true;
        flash("BESTILT", "✓ NR. " + n, "ok");
        navigator.vibrate?.([30, 40, 30, 40, 120]);
        printOrder(printed, n, opgave.ret);
        setTimeout(solve, 2600);
        return;
      }
      navigator.vibrate?.(180);
      if (nearMiss[n]) flash(`NR. ${n}`, nearMiss[n], "bad");
      else flash(`NR. ${n}`, "UKENDT RET 🤔", "bad");
      shake(display);
      digits = "";
    }));
    keys.append(back, zero, order);

    terminal.append(display, keys);
    render();
    card.replaceChildren(...intro(opgave), receipt, terminal);
  }

  return taskShell(opgave, ctx, { renderLocked });
}

/** Animate the printer adding the order to the receipt. */
function printOrder(target, n, dish) {
  const lines = [
    h("p", "bon-rule"),
    h("p", "bon-order", `1× ${n}. ${String(dish ?? "").toLocaleUpperCase("da")}`.trim()),
    h("p", "bon-rule"),
    h("p", "bon-thanks", "TAK FOR BESTILLINGEN ♥"),
  ];
  lines.forEach((line, i) => {
    line.classList.add("bon-print");
    line.style.animationDelay = `${i * 280}ms`;
    target.append(line);
  });
  target.closest(".bon")?.classList.add("printing");
}
