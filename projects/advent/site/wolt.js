// Step "wolt": a food-delivery app. Read the message, find the right restaurant,
// put the right dish in the basket and order it. Then the order is tracked to
// the door.
//
//   { "type": "wolt", "besked": "Bestil det sædvanlige 😉", "restauranter": [
//       { "navn": "Den Hvide Elefant", "emoji": "🐘", "farve": "#e8eef3",
//         "undertitel": "Thai · Holte", "rating": "9,4", "tid": "25–35 min", "levering": 29,
//         "retter": [ { "nr": "8", "navn": "Rød karry i kokosmælk", "tekst": "…", "pris": 139, "rigtig": true },
//                     { "nr": "13", "navn": "Cremet rød karry", "pris": 139, "nej": "Næsten…" } ] },
//       { "navn": "…", "nej": "Forkert sted 😉", "retter": [ … ] } ] }
//
// The order is right when the basket only holds dishes marked "rigtig" (any
// amount). "nej" on a restaurant or dish is shown when that is ordered instead.

import { h, button, shake } from "/felles.js";
import { kr, beep } from "/trin.js";

const WRONG_PLACE = "Hmm… er det nu derfra, vi plejer at bestille? 🤔";
const WRONG_DISH = "Det er vist ikke det sædvanlige 🤔";
const TOO_MUCH = "Kun det sædvanlige, tak 😄";

export default function wolt(cfg, { done }) {
  const restaurants = cfg.restauranter ?? [];
  const root = h("div", "app wolt");
  const top = h("div", "wolt-top");
  top.append(h("span", "wolt-logo", "Wolt"), h("span", "wolt-addr", "📍 Hjem"));
  const screen = h("div", "wolt-screen");
  const cartBar = button("", "wolt-cartbar", () => showCart());
  cartBar.hidden = true;
  root.append(top, screen, cartBar);

  // Basket: one restaurant at a time, like the real thing.
  let cartFrom = null;
  const cart = new Map(); // dish -> amount
  const count = () => [...cart.values()].reduce((a, b) => a + b, 0);
  const sum = () => [...cart].reduce((a, [d, n]) => a + Number(d.pris ?? 0) * n, 0);

  let first = true;
  const go = (...children) => {
    screen.replaceChildren(...children);
    screen.classList.remove("in");
    void screen.offsetWidth;
    screen.classList.add("in");
    if (!first) root.scrollIntoView({ behavior: "smooth", block: "start" });
    first = false;
  };

  let onCart = false; // the bar is hidden on the basket and tracking screens
  const updateBar = () => {
    const n = count();
    cartBar.hidden = n === 0 || onCart;
    cartBar.replaceChildren(h("span", "wolt-cartcount", String(n)), h("span", null, "Se bestilling"), h("span", null, kr(sum())));
  };

  // ---- home: message + restaurant list
  function showHome() {
    onCart = false;
    updateBar();
    const msg = h("div", "wolt-msg");
    msg.append(h("span", "wolt-msg-from", cfg.fra ?? "💬"), h("p", "wolt-msg-text", cfg.besked ?? ""));
    const list = h("div", "wolt-list");
    for (const r of restaurants) {
      const card = button("", "wolt-card", () => showMenu(r));
      const pic = h("span", "wolt-pic", r.emoji ?? "🍽️");
      if (r.farve) pic.style.background = r.farve;
      const info = h("span", "wolt-card-info");
      info.append(
        h("span", "wolt-card-name", r.navn),
        h("span", "wolt-card-sub", r.undertitel ?? ""),
        h("span", "wolt-card-meta", [r.rating && `★ ${r.rating}`, r.tid && `🛵 ${r.tid}`, r.levering != null && kr(r.levering)].filter(Boolean).join("  ·  ")),
      );
      card.append(pic, info);
      list.append(card);
    }
    go(...(cfg.besked ? [msg] : []), h("p", "wolt-h", "Restauranter i nærheden"), list);
  }

  // ---- restaurant menu
  function showMenu(r) {
    onCart = false;
    updateBar();
    const back = button("‹  Alle restauranter", "wolt-back", showHome);
    const hero = h("div", "wolt-hero", r.emoji ?? "🍽️");
    if (r.farve) hero.style.background = r.farve;
    const head = h("div", "wolt-menu-head");
    head.append(h("p", "wolt-menu-name", r.navn), h("p", "wolt-card-sub", r.undertitel ?? ""), h("p", "wolt-card-meta", [r.rating && `★ ${r.rating}`, r.tid && `🛵 ${r.tid}`].filter(Boolean).join("  ·  ")));

    const toast = h("p", "wolt-toast");
    const list = h("div", "wolt-dishes");
    const rows = (r.retter ?? []).map((d) => {
      const row = h("div", "wolt-dish");
      const info = h("div", "wolt-dish-info");
      info.append(h("p", "wolt-dish-name", d.nr ? `${d.nr}. ${d.navn}` : d.navn), ...(d.tekst ? [h("p", "wolt-dish-text", d.tekst)] : []), h("p", "wolt-dish-price", kr(d.pris ?? 0)));
      const add = button("+", "wolt-add", () => {
        if (cartFrom !== r) {
          if (cart.size) toast.textContent = `Ny kurv startet hos ${r.navn}`;
          cart.clear();
          cartFrom = r;
        }
        cart.set(d, (cart.get(d) ?? 0) + 1);
        navigator.vibrate?.(10);
        add.classList.remove("bump");
        void add.offsetWidth;
        add.classList.add("bump");
        mark();
        updateBar();
      });
      add.setAttribute("aria-label", `Tilføj ${d.navn}`);
      row.append(info, add);
      list.append(row);
      return { row, add, d };
    });
    const mark = () => rows.forEach(({ row, add, d }) => {
      const n = cartFrom === r ? cart.get(d) ?? 0 : 0;
      row.classList.toggle("in-cart", n > 0);
      add.textContent = n > 0 ? String(n) : "+";
    });
    mark();
    go(back, hero, head, toast, list);
  }

  // ---- basket + order
  function showCart() {
    const r = cartFrom;
    if (!r || !count()) return showHome();
    onCart = true;
    const back = button(`‹  ${r.navn}`, "wolt-back", () => showMenu(r));
    const lines = h("div", "wolt-lines");
    const totals = h("div", "wolt-totals");
    const msg = h("p", "wolt-err");
    const draw = () => {
      msg.textContent = "";
      lines.replaceChildren(...[...cart].map(([d, n]) => {
        const line = h("div", "wolt-line");
        const qty = h("span", "wolt-qty");
        qty.append(
          button("−", "wolt-qbtn", () => { n > 1 ? cart.set(d, n - 1) : cart.delete(d); updateBar(); count() ? draw() : showMenu(r); }),
          h("span", null, String(n)),
          button("+", "wolt-qbtn", () => { cart.set(d, n + 1); updateBar(); draw(); }),
        );
        line.append(qty, h("span", "wolt-line-name", d.nr ? `${d.nr}. ${d.navn}` : d.navn), h("span", "wolt-line-price", kr(Number(d.pris ?? 0) * n)));
        return line;
      }));
      const fee = Number(r.levering ?? 0);
      totals.replaceChildren(
        row2("Varer", kr(sum())),
        row2("Levering", kr(fee)),
        row2("I alt", kr(sum() + fee), "wolt-total"),
      );
    };
    draw();
    const order = button("Bestil", "wolt-order", () => {
      const wrong = verdict(r);
      if (!wrong) return track(r);
      navigator.vibrate?.(160);
      msg.textContent = wrong;
      shake(order);
    });
    cartBar.hidden = true;
    go(back, h("p", "wolt-h", "Din bestilling"), h("p", "wolt-card-sub", `${r.navn} · levering til Hjem`), lines, totals, msg, order);
  }

  /** null when the order is right, otherwise what to say. */
  function verdict(r) {
    const dishes = [...cart.keys()];
    if (!(r.retter ?? []).some((d) => d.rigtig)) return dishes.find((d) => d.nej)?.nej ?? r.nej ?? WRONG_PLACE;
    if (dishes.every((d) => d.rigtig)) return null;
    if (dishes.some((d) => d.rigtig)) return TOO_MUCH;
    return dishes.find((d) => d.nej)?.nej ?? WRONG_DISH;
  }

  // ---- order tracking, then done
  function track(r) {
    onCart = true;
    beep(1320, 90);
    navigator.vibrate?.([30, 40, 30]);
    const map = h("div", "wolt-map");
    map.append(h("span", "wolt-map-from", r.emoji ?? "🍽️"), h("span", "wolt-map-road"), h("span", "wolt-map-bike", "🛵"), h("span", "wolt-map-home", "🏠"));
    const dishName = [...cart.keys()][0]?.navn ?? "maden";
    const steps = [
      "Bestillingen er sendt",
      `${r.navn} har modtaget din bestilling`,
      `Køkkenet laver ${dishName.toLocaleLowerCase("da")}`,
      "Buddet er på vej 🛵",
      "Leveret! Velbekomme ❤️",
    ];
    const list = h("ol", "wolt-track");
    const items = steps.map((s) => list.appendChild(h("li", null, s)));
    cartBar.hidden = true;
    go(h("p", "wolt-h", "Din mad er på vej"), map, list);
    let i = 0;
    const tick = () => {
      items.forEach((li, j) => li.classList.toggle("on", j <= i));
      map.style.setProperty("--p", String(i / (steps.length - 1)));
      if (i === steps.length - 1) {
        map.classList.add("arrived");
        navigator.vibrate?.([40, 50, 120]);
        return setTimeout(done, 1600);
      }
      i++;
      setTimeout(tick, 1100);
    };
    setTimeout(tick, 300);
  }

  showHome();
  return { el: root };
}

function row2(a, b, cls) {
  const r = h("div", `wolt-row${cls ? ` ${cls}` : ""}`);
  r.append(h("span", null, a), h("span", null, b));
  return r;
}
