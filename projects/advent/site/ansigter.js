// Face puzzle: point the camera at the faces of the listed people (photos, TV,
// magazines …). Each recognised person is ticked off; all found unlocks the number.
//
//   { "type": "ansigter", "tal": "1", "personer": [
//       { "navn": "Kendis 1", "billede": "kendis-1.jpg" }, … ] }
//
// "billede" is a reference photo in the same folder: one clear, front-facing
// face. Recognition runs fully in the browser with face-api (site/vendor/face-api).

import { h, store, taskShell, DEBUG } from "/felles.js";
import { camera } from "/kamera.js";

const MODELS = "/vendor/face-api/models";
// Max face-descriptor distance that counts as the same person. face-api's
// default is 0.6; slightly stricter keeps different people apart, while still
// matching a photo of a photo through a phone camera. Override per week with
// "grænse" in opgave.json.
const MATCH = 0.56;
// Add ?debug to the URL to see what the camera sees (face score, distances).


let faceapiReady = null;
function loadFaceApi() {
  return (faceapiReady ??= (async () => {
    const faceapi = await import("/vendor/face-api/face-api.esm.js");
    await faceapi.tf.ready();
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODELS),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODELS),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODELS),
    ]);
    return faceapi;
  })().catch((e) => {
    faceapiReady = null;
    throw e;
  }));
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`kunne ikke hente ${src}`));
    img.src = src;
  });
}

export function ansigterOpgave(opgave, ctx) {
  return taskShell(opgave, ctx, faceTask(opgave, ctx));
}

/** As a step in a "trin" task: { "type": "ansigter", "overskrift": "…", "personer": [ … ] }. */
export default function ansigterTrin(cfg, { slug, done }) {
  const task = faceTask(cfg, { slug });
  const el = h("div", "face-trin");
  task.renderLocked(el, done);
  return { el, activate: task.activate, deactivate: task.deactivate };
}

function faceTask(opgave, ctx) {
  const people = (opgave.personer ?? []).map((p, i) => ({ ...p, i, src: `/${ctx.slug}/${p.billede}` }));
  const found = store(`advent:${ctx.slug}:ansigter`);
  const foundSet = () => new Set(found.get() ?? []);
  let refs = null; // Promise<[{ person, descriptor }]>
  let cam = null;

  async function references(faceapi) {
    return (refs ??= Promise.all(people.map(async (person) => {
      try {
        const img = await loadImage(person.src);
        const det = await faceapi
          .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.3 }))
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (!det) throw new Error(`fandt intet ansigt i ${person.billede}`);
        return { person, descriptor: det.descriptor };
      } catch (e) {
        console.error("Ansigter:", e.message);
        return null;
      }
    })).then((list) => list.filter(Boolean)));
  }

  function renderLocked(card, solve) {
    const slots = h("div", "face-slots");
    const drawSlots = () => {
      const got = foundSet();
      slots.replaceChildren(...people.map((p) => {
        const slot = h("div", `face-slot${got.has(p.i) ? " found" : ""}`);
        const ring = h("div", "face-ring");
        if (got.has(p.i)) {
          const img = h("img");
          img.src = p.src;
          img.alt = p.navn ?? "";
          ring.append(img);
        } else {
          ring.textContent = "?";
        }
        slot.append(ring, h("p", "face-name", got.has(p.i) ? (p.navn ?? "✓") : ""));
        return slot;
      }));
    };
    drawSlots();

    cam = camera({ shape: "face", laser: false });
    const agent = agentOverlay(cam.view);
    const debugLine = DEBUG ? h("p", "face-debug", "debug: venter på kamera…") : null;

    cam.onLive(async () => {
      const mine = ++uiToken;
      cam.setMsg("Gør klar…");
      let faceapi, known;
      try {
        faceapi = await loadFaceApi();
        known = await references(faceapi);
      } catch (e) {
        console.error(e);
        return cam.setMsg("Kameraet kunne ikke starte.", true);
      }
      if (mine !== uiToken) return;
      if (known.length < people.length) cam.setMsg(`Mangler billeder: ${people.length - known.length} af ${people.length} kunne ikke læses`, true);
      else cam.setMsg("");

      // Low score threshold: faces on a screen or printed photo score lower than real ones.
      // Slow phones get a smaller detector input (see below).
      let size = 416;
      let options = new faceapi.TinyFaceDetectorOptions({ inputSize: size, scoreThreshold: 0.35 });
      const limit = Number(opgave.grænse) || MATCH;
      // Average time one detection takes. On slow phones this can be close to a
      // second, so the "lost the face" grace period has to scale with it.
      let avgMs = 0;
      const grace = () => Math.max(GRACE_MS, avgMs * 2.5);

      // Shared between the detection loop (~7/s) and the animation loop (60/s).
      let seen = null;       // { at, mode: "scan" | "known" | "unknown", person }
      let target = null;     // { i, since } — person being locked on to
      let lockedUntil = 0;   // showing "IDENTIFICERET" until then; detection paused

      cam.run(async (video) => {
        if (performance.now() < lockedUntil) return false;
        const t0 = performance.now();
        const det = await faceapi.detectSingleFace(video, options).withFaceLandmarks().withFaceDescriptor();
        if (mine !== uiToken) return true;
        const took = performance.now() - t0;
        avgMs = avgMs ? avgMs * 0.7 + took * 0.3 : took;
        if (avgMs > 450 && size > 224) {
          size = size === 416 ? 320 : 224;
          options = new faceapi.TinyFaceDetectorOptions({ inputSize: size, scoreThreshold: 0.35 });
          avgMs *= 0.7; // give the smaller size a chance before shrinking again
        }
        if (!det) {
          if (debugLine) debugLine.textContent = "debug: intet ansigt";
          return false;
        }

        let best = null;
        const dists = known.map((ref) => ({ ref, d: faceapi.euclideanDistance(det.descriptor, ref.descriptor) }));
        for (const { ref, d } of dists) {
          if (d < limit && (!best || d < best.d)) best = { d, person: ref.person };
        }
        if (debugLine) {
          const list = dists.map(({ ref, d }) => `${ref.person.navn ?? ref.person.i + 1} ${d.toFixed(2)}`).join(" · ");
          debugLine.textContent = `debug: ansigt ${det.detection.score.toFixed(2)} | ${list} (grænse ${limit}) | ${Math.round(avgMs)} ms, ${size}px, ${faceapi.tf.getBackend()}`;
        }

        const now = performance.now();
        agent.place(det.detection.box, video);
        if (!best) {
          seen = { at: now, mode: "unknown" };
          target = null;
        } else if (foundSet().has(best.person.i)) {
          seen = { at: now, mode: "known", person: best.person };
          target = null;
        } else {
          seen = { at: now, mode: "scan", person: best.person };
          if (target?.i !== best.person.i) target = { i: best.person.i, since: now };
        }
        return false;
      }, 140);

      const frame = (now) => {
        if (mine !== uiToken) return;
        requestAnimationFrame(frame);
        if (now < lockedUntil) return;
        if (lockedUntil) {
          lockedUntil = 0;
          agent.hide();
        }

        // Lost the face (allow a short gap so a single missed frame doesn't reset).
        if (!seen || now - seen.at > grace()) {
          seen = null;
          target = null;
          agent.hide();
          return;
        }

        if (seen.mode === "unknown") return agent.show("unknown", "UKENDT PERSON", "INGEN MATCH", 0);
        if (seen.mode === "known") return agent.show("known", "ALLEREDE IDENTIFICERET", up(seen.person.navn), 1);

        const p = Math.min(1, (now - target.since) / HOLD_MS);
        agent.show("scan", "ANALYSERER…", scramble(up(seen.person.navn ?? "???"), p), p);
        if (p < 1) return;

        // Locked on for HOLD_MS: identified.
        const person = seen.person;
        const got = foundSet();
        got.add(person.i);
        found.set([...got]);
        drawSlots();
        navigator.vibrate?.([40, 50, 90]);
        agent.show("locked", "IDENTIFICERET ✓", up(person.navn), 1);
        lockedUntil = now + 1800;
        seen = null;
        target = null;

        const name = person.navn ?? "Fundet";
        if (got.size >= people.length) {
          cam.setMsg(`${name}! Du fandt dem alle ✨`);
          cam.pause();
          setTimeout(solve, 1900);
        } else {
          cam.setMsg(`${name}! ${got.size} af ${people.length} ✨`);
        }
      };
      requestAnimationFrame(frame);
    });

    // The same camera-app look as the other camera puzzles (black app, top bar,
    // viewfinder, then who's been found).
    const app = h("div", "app cam face-app");
    const top = h("div", "cam-top");
    top.append(h("span", "cam-mode", opgave.mode ?? "ANSIGTER"), h("span", "cam-badge", `📍 ${opgave.sted ?? "Fitness World"}`));
    const text = opgave.tekst ? [h("p", "fj-intro", opgave.tekst)] : [];
    app.append(top, ...text, cam.view, slots, cam.msg, ...(debugLine ? [debugLine] : []));
    card.replaceChildren(app);
    // Start loading the models in the background so the camera is ready sooner.
    loadFaceApi().catch(() => {});
  }

  return {
    renderLocked,
    activate: () => cam?.start(),
    deactivate: () => {
      uiToken++;
      cam?.stop();
    },
    onReset: () => found.clear(),
  };
}

// ---------- agent overlay ----------

const HOLD_MS = 1500;  // how long a face must stay in view to be identified
const GRACE_MS = 600;  // how long a face may drop out before the lock resets
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZÆØÅ0123456789#%&@";
let uiToken = 0;       // bumps when the camera stops so the animation loop exits

const up = (s) => String(s ?? "").toLocaleUpperCase("da");

/** "KÅRE QUIST" with only the first p-share of letters decoded, the rest random glyphs. */
function scramble(text, p) {
  const shown = Math.floor(text.length * p);
  return [...text].map((ch, i) => (i < shown || ch === " " ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join("");
}

/** Cheesy spy-movie targeting reticle that follows the detected face. */
function agentOverlay(view) {
  const root = h("div", "agent");
  root.setAttribute("aria-hidden", "true");
  const box = h("div", "agent-box");
  for (const c of ["tl", "tr", "bl", "br"]) box.append(h("span", `agent-c ${c}`));
  box.append(h("div", "agent-grid"), h("div", "agent-scan"), h("div", "agent-cross"));

  const top = h("div", "agent-top");
  const label = h("p", "agent-label");
  const sub = h("p", "agent-sub");
  top.append(label, sub);

  const bottom = h("div", "agent-bottom");
  const bar = h("div", "agent-bar");
  const fill = h("div", "agent-fill");
  bar.append(fill);
  const pct = h("span", "agent-pct");
  const hex = h("span", "agent-hex");
  bottom.append(bar, pct, hex);

  box.append(top, bottom);
  root.append(box);
  view.append(root);

  let lastHex = 0;
  return {
    /** Map the face box from video pixels to the on-screen (object-fit: cover) view. */
    place(b, video) {
      const vw = video.videoWidth, vh = video.videoHeight;
      const cw = view.clientWidth, ch = view.clientHeight;
      if (!vw || !cw) return;
      const s = Math.max(cw / vw, ch / vh);
      const ox = (cw - vw * s) / 2, oy = (ch - vh * s) / 2;
      const pad = 0.28; // the detector box is tight around the face
      const w = b.width * s * (1 + pad), hgt = b.height * s * (1 + pad * 1.3);
      const x = b.x * s + ox - (w - b.width * s) / 2;
      const y = b.y * s + oy - (hgt - b.height * s) / 2;
      box.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      box.style.width = `${w.toFixed(1)}px`;
      box.style.height = `${hgt.toFixed(1)}px`;
    },
    show(mode, title, subtitle, p) {
      root.className = `agent show ${mode}`;
      label.textContent = title;
      sub.textContent = subtitle;
      fill.style.transform = `scaleX(${p.toFixed(3)})`;
      pct.textContent = mode === "unknown" ? "0%" : `${Math.floor(p * 100)}%`;
      const now = performance.now();
      if (now - lastHex > 90) {
        lastHex = now;
        hex.textContent = `0x${((Math.random() * 0xffffff) | 0).toString(16).toUpperCase().padStart(6, "0")}`;
      }
    },
    hide() {
      root.className = "agent";
    },
  };
}
