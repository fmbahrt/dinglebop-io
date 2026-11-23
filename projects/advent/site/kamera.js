// Inline camera view shared by the camera puzzles (stregkode, ansigter).
//
//   const cam = camera({ shape: "wide" | "face", laser: true });
//   card.append(cam.view, cam.msg);
//   cam.onLive(() => cam.run(async (video) => { ...; return done; }));
//   cam.start(); cam.stop();

import { h, button, mediaError } from "/felles.js";

const CAMERA_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/></svg>`;

export function camera({ shape = "wide", laser = true } = {}) {
  const view = h("div", `scan-view scan-${shape}`);
  const video = h("video");
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("muted", "");
  const frame = h("div", "scan-frame");
  if (laser) frame.append(h("div", "scan-laser"));
  const startBtn = button("", "btn scan-start", () => api.start());
  startBtn.innerHTML = `${CAMERA_ICON}<span>Start kamera</span>`;
  view.append(video, frame, startBtn);
  const msg = h("p", "scan-msg");

  let stream = null;
  let session = 0; // bumps on every start/stop so stale loops exit
  let onLive = () => {};

  const api = {
    view,
    msg,
    frame,
    video,

    setMsg(text, wrong = false) {
      msg.textContent = text;
      msg.classList.toggle("wrong", wrong);
    },

    onLive(fn) { onLive = fn; },

    async start() {
      if (stream) return;
      const mine = ++session;
      startBtn.hidden = true;
      api.setMsg("Starter kameraet…");
      let s;
      try {
        s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
      } catch (e) {
        if (mine !== session) return;
        startBtn.hidden = false;
        api.setMsg(mediaError(e, "kameraet"), true);
        return;
      }
      if (mine !== session) return s.getTracks().forEach((t) => t.stop());
      stream = s;
      stream.getVideoTracks()[0]?.applyConstraints?.({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
      video.srcObject = stream;
      await video.play().catch(() => {});
      view.classList.add("live");
      api.setMsg("");
      onLive();
    },

    stop() {
      session++;
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      video.srcObject = null;
      view.classList.remove("live");
    },

    /** Calls fn(video) repeatedly while the camera is live, until fn returns true. */
    run(fn, every = 120) {
      const mine = session;
      const tick = async () => {
        if (mine !== session) return;
        const done = video.readyState >= 2 ? await fn(video).catch((e) => (console.error(e), false)) : false;
        if (mine !== session || done) return;
        setTimeout(tick, every);
      };
      tick();
    },

    /** Freeze the loop (e.g. to show a success state) without turning the camera off yet. */
    pause() { session++; },

    flash(kind) {
      frame.classList.remove("ok", "nope");
      void frame.offsetWidth;
      frame.classList.add(kind);
    },
  };
  return api;
}
