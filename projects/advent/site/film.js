// Step "film": a little cartoon between two puzzles (the same drive as the
// Fitness World scene, see koretur.js). It plays by itself; "Videre" appears
// when it's over. With "direkte": true the next step follows straight away
// (no "Klaret ✓" in between).
//
//   { "type": "film", "direkte": true, "mål": "hus", "køretid": 9,
//     "passagerer": true, "noder": true,
//     "bobler": [ { "fra": "frederik", "tekst": "🎶 La la laaa 🎶", "ved": 0.5 } ],
//     "fra": "finn", "boble": "…", "knap": "Videre →" }

import { h, button } from "/felles.js";
import { driveScene } from "/koretur.js";

export default function film(cfg, { done }) {
  const root = h("div", "app bil scene film");
  const scene = driveScene(cfg);
  const next = button(cfg.knap ?? "Videre →", "btn film-next", done);
  next.hidden = true;
  root.append(scene.el, next);
  let played = false;
  return {
    el: root,
    activate() {
      if (played) return;
      played = true;
      scene.play().then(() => {
        next.hidden = false;
        next.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    },
  };
}
