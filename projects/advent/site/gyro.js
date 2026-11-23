// Gyro tracking: move what's drawn on the camera with the phone's rotation.
//
// Poster detection (ORB in a worker) is slow on a phone, a few answers a
// second, and each answer is already old when it arrives: it describes the
// frame that was grabbed before matching started. Turning the phone moves the
// whole picture, and the gyroscope says how much, right away and ~60 times a
// second. So:
//   - each answer is moved by the rotation since its frame was grabbed
//     (latency compensation), and
//   - between answers the drawn frame is moved by the rotation since the last
//     animation frame (so it sticks to the wall while she turns).
// Rotation of the camera (not walking around) moves the image by a homography
// K·R·K⁻¹, which needs the camera's focal length in pixels; that comes from an
// assumed field of view (phone main cameras are ~65–70° across the long side).
//
// Gyro axes (DeviceMotionEvent.rotationRate, deg/s, device frame): beta around
// x (right), gamma around y (up), alpha around z (out of the screen). The rear
// camera looks along −z.

const D2R = Math.PI / 180;
const HISTORY_MS = 2500;

/** 3×3 matrices as flat arrays (row major). */
const mul = (a, b) => {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
};
const transpose = (a) => [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];
const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Rotation by the vector v (radians, axis·angle), Rodrigues. */
function rot([x, y, z]) {
  const th = Math.hypot(x, y, z);
  if (th < 1e-12) return I;
  const kx = x / th, ky = y / th, kz = z / th, c = Math.cos(th), s = Math.sin(th), t = 1 - c;
  return [
    c + kx * kx * t, kx * ky * t - kz * s, kx * kz * t + ky * s,
    ky * kx * t + kz * s, c + ky * ky * t, ky * kz * t - kx * s,
    kz * kx * t - ky * s, kz * ky * t + kx * s, c + kz * kz * t,
  ];
}

/**
 * Start listening to the gyroscope. Call it from a tap: iPhone asks for
 * permission (DeviceMotionEvent.requestPermission) and only allows that on a
 * tap. → a tracker; tracker.active turns true once rotation data arrives.
 */
export function startGyro() {
  const tracker = {
    active: false,
    hz: 0,
    /** Rotation that moves directions seen at time t1 to time t2 (ms, performance.now). */
    between(t1, t2) { return mul(at(t2), transpose(at(t1))); },
    stop() { removeEventListener("devicemotion", onMotion); },
  };
  // A[t]: world directions → camera directions at time t. Kept as a short history.
  let A = I, lastT = 0, count = 0, since = performance.now();
  const hist = [];
  function at(t) {
    if (!hist.length) return I;
    if (t >= hist[hist.length - 1].t) return hist[hist.length - 1].A;
    // newest sample at or before t
    for (let i = hist.length - 1; i >= 0; i--) if (hist[i].t <= t) return hist[i].A;
    return hist[0].A;
  }
  function onMotion(e) {
    const r = e.rotationRate;
    if (!r || r.alpha == null) return;
    const t = e.timeStamp || performance.now();
    const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0;
    lastT = t;
    // Device axes → screen axes (the camera picture is shown upright on screen).
    const ang = ((screen.orientation?.angle ?? window.orientation ?? 0) * D2R);
    const c = Math.cos(ang), s = Math.sin(ang);
    const bx = r.beta * D2R, gy = r.gamma * D2R, az = r.alpha * D2R;
    const wx = bx * c + gy * s, wy = -bx * s + gy * c;
    // The phone turns by ω·dt, so what it sees turns the other way.
    A = mul(rot([-wx * dt, -wy * dt, -az * dt]), A);
    hist.push({ t, A });
    while (hist.length > 2 && hist[0].t < t - HISTORY_MS) hist.shift();
    count++;
    const span = t - since;
    if (span > 1000) { tracker.hz = Math.round((count * 1000) / span); count = 0; since = t; }
    if (dt) tracker.active = true;
  }
  const listen = () => addEventListener("devicemotion", onMotion);
  const ask = globalThis.DeviceMotionEvent?.requestPermission;
  if (typeof ask === "function") {
    ask.call(DeviceMotionEvent).then((p) => { if (p === "granted") listen(); }, () => { /* no gyro */ });
  } else listen();
  return tracker;
}

/**
 * Move screen points by a camera rotation R. f: focal length in screen px,
 * (cx, cy): the picture's centre on screen. Points that end up behind the
 * camera are left where they were.
 */
export function warpPoints(points, R, f, cx, cy) {
  return points.map(([u, v]) => {
    // screen px → direction (x right, y up, −z forward)
    const x = (u - cx) / f, y = -(v - cy) / f, z = -1;
    const X = R[0] * x + R[1] * y + R[2] * z;
    const Y = R[3] * x + R[4] * y + R[5] * z;
    const Z = R[6] * x + R[7] * y + R[8] * z;
    if (Z > -1e-3) return [u, v];
    return [cx + (f * X) / -Z, cy - (f * Y) / -Z];
  });
}
