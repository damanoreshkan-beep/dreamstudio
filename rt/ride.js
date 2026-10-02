import { distanceM } from "./trace.js";

export const G = 9.80665;
export const KMH = 3.6;
const DEG = 180 / Math.PI;

export const V_ZERO = 0.6;
export const V_STOP = 3 / KMH;
export const V_GO = 5 / KMH;
export const V_100 = 100 / KMH;
export const V_LAUNCH = 3 / KMH;
export const V_KIN = 15 / KMH;
export const V_GRAV = 10 / KMH;
export const V_LEVEL = 30 / KMH;
export const STOP_MS = 3000;
export const GAP_MS = 5000;
export const GAP_MAX_MS = 120000;
export const ACC_MAX = 12;
export const BUCKET_MS = 5000;
export const SERIES_MAX = 240;
export const LEAN_MAX = 65;
export const LEAN_TAU = 1.5;
export const CORNER_DEG = 15;
export const CORNER_MS = 1500;
export const TIERS = [25, 30, 35, 40, 45];

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a, min = 1e-9) => { const n = norm(a); return n > min ? [a[0] / n, a[1] / n, a[2] / n] : null; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const P = (f) => ({ lat: f.lat, lon: f.lng });
const within = (f, m) => typeof f?.accuracy === "number" && f.accuracy <= m;

const SCREEN_UP = { 0: [0, 1, 0], 90: [1, 0, 0], 180: [0, -1, 0], 270: [-1, 0, 0] };

// The bike's axes in the DEVICE frame, from one gravity sample. A readable screen faces the rider, so
// "up" is the gravity axis on the side of (screen-top + screen-normal) — that resolves the iOS/Android
// sign split without sniffing — and "forward" is the level part of (screen-top − screen-normal).
export function mountFrame(acc, screenAngle = 0) {
  const n = acc ? norm(acc) : 0;
  if (!(n > 0.5 * G && n < 1.5 * G)) return null;
  const top = SCREEN_UP[((Math.round(screenAngle / 90) * 90) % 360 + 360) % 360] || SCREEN_UP[0];
  const sign = dot(acc, [top[0], top[1], top[2] + 1]) >= 0 ? 1 : -1;
  const up = [acc[0] * sign / n, acc[1] * sign / n, acc[2] * sign / n];
  return level(up, [top[0], top[1], top[2] - 1], sign);
}

function level(up, ahead, sign) {
  const k = dot(ahead, up);
  const fwd = unit([ahead[0] - k * up[0], ahead[1] - k * up[1], ahead[2] - k * up[2]], 0.15);
  return fwd ? { up, fwd, left: cross(up, fwd), sign } : null;
}

export const leanInit = () => ({ frame: null, phi: 0, yaw: 0, bias: [0, 0, 0], kin: false, straight: 0 });

// phi > 0 leans RIGHT. Gyro roll rate carries the short term; the reference it relaxes to is the turn
// itself at speed (sin phi = v * yawRate / g — gravity reads ~0 in a coordinated turn) and gravity when slow.
export function leanStep(st, sample, vMs, dtS, screenAngle = 0) {
  const dt = clamp(dtS, 0, 0.1);
  const { acc, rot } = sample;
  let { frame, phi, yaw, bias, kin, straight } = st;
  if (!frame && acc) frame = mountFrame(acc, screenAngle);
  if (!frame || !rot) return frame === st.frame ? st : { ...st, frame };

  const w = [rot[0] - bias[0], rot[1] - bias[1], rot[2] - bias[2]];
  const roll = dot(w, frame.fwd), turn = dot(w, frame.up);
  yaw += (turn - yaw) * (dt / (0.25 + dt));
  kin = vMs != null && vMs > V_KIN ? true : vMs == null || vMs < V_GRAV ? false : kin;

  let g = null;
  if (acc) { const n = norm(acc); if (n > 0.6 * G && n < 1.4 * G) g = [acc[0] * frame.sign / n, acc[1] * frame.sign / n, acc[2] * frame.sign / n]; }
  const ref = kin ? -Math.asin(clamp(vMs * (yaw / DEG) / G, -1, 1)) * DEG
    : g ? Math.atan2(dot(g, frame.left), dot(g, frame.up)) * DEG : null;
  phi += roll * dt;
  if (ref != null) phi += (ref - phi) * (dt / (LEAN_TAU + dt));
  phi = clamp(phi, -LEAN_MAX, LEAN_MAX);

  if (vMs != null && vMs < 0.3 && norm(rot) < 3) { const k = dt / (2 + dt); bias = bias.map((b, i) => b + (rot[i] - b) * k); }

  // Upright is learned on the road: fast, straight and steady means gravity IS the bike's vertical, so a
  // start on the side stand corrects itself and no "zero" button exists to get wrong.
  if (g && vMs != null && vMs > V_LEVEL && Math.abs(yaw) < 2 && Math.abs(roll) < 3) {
    straight += dt;
    if (straight > 1) {
      const k = dt / (3 + dt);
      const up = unit(frame.up.map((u, i) => u + (g[i] - u) * k));
      frame = (up && level(up, frame.fwd, frame.sign)) || frame;
    }
  } else straight = 0;
  return { frame, phi, yaw, bias, kin, straight };
}

export const leanStats = (day) => ({ smooth: 0, maxL: day?.maxL || 0, maxR: day?.maxR || 0, corners: day?.corners || 0, inMs: 0, counted: false });

// A record needs speed and 0.3 s of hold (a pothole is not a lean); a corner is 15° held for 1.5 s.
export function leanTrack(s, phi, vMs, dtS) {
  if (!(vMs > V_KIN)) return s.smooth || s.inMs || s.counted ? { ...s, smooth: 0, inMs: 0, counted: false } : s;
  const dt = clamp(dtS, 0, 0.1);
  const smooth = s.smooth + (phi - s.smooth) * (dt / (0.3 + dt));
  let { corners, inMs, counted } = s;
  const a = Math.abs(smooth);
  if (a > CORNER_DEG) { inMs += dt * 1000; if (!counted && inMs >= CORNER_MS) { corners++; counted = true; } }
  else if (a < CORNER_DEG / 2) { inMs = 0; counted = false; }
  return { smooth, maxL: Math.max(s.maxL, -smooth), maxR: Math.max(s.maxR, smooth), corners, inMs, counted };
}

export const leanTier = (deg) => TIERS.filter((t) => deg >= t).length;

export function fixSpeed(fix, last) {
  if (typeof fix.speed === "number" && isFinite(fix.speed) && fix.speed >= 0) return fix.speed;
  if (!last) return null;
  const dt = (fix.t - last.t) / 1000;
  if (!(dt > 0.2) || !within(fix, 20) || !within(last, 20)) return null;
  return distanceM(P(last), P(fix)) / dt;
}

const SPRINT0 = { on: false, armed: false, t0: 0, peak: 0, last: null };

export const tripInit = (day) => ({
  dist: day?.dist || 0, moveMs: day?.moveMs || 0, max: day?.max || 0, best: day?.best ?? null,
  series: Array.isArray(day?.series) ? day.series.slice() : [], bucketMs: day?.bucketMs || BUCKET_MS, bkMs: 0, bkMax: 0,
  last: null, raw: null, v: null, moving: false, slowMs: 0, heading: null, sprint: SPRINT0,
});

const pairMax = (a) => { const out = []; for (let i = 0; i < a.length; i += 2) out.push(Math.max(a[i], a[i + 1] ?? a[i])); return out; };

// Distance is the integral of Doppler speed while moving, never a sum of position deltas: at a red light
// position wanders by metres and speed reads zero.
export function tripStep(s, fix) {
  const last = s.last, dtMs = last ? fix.t - last.t : 0;
  if (last && !(dtMs > 0)) return s;
  const gap = dtMs > GAP_MS, prev = gap ? null : s.raw;
  let raw = fixSpeed(fix, gap ? null : last);
  if (raw != null && raw < V_ZERO) raw = 0;
  const capped = raw == null ? null : prev == null ? raw : Math.min(raw, prev + ACC_MAX * dtMs / 1000);
  const v = raw == null ? null : raw === 0 || s.v == null || gap ? raw : s.v + (raw - s.v) * 0.5;

  let { moving, slowMs, dist, moveMs, max, best, series, bucketMs, bkMs, bkMax, heading, sprint } = s;
  if (raw != null) {
    if (!moving) { if (raw > V_GO) { moving = true; slowMs = 0; } }
    else if (raw < V_STOP) { slowMs += dtMs; if (slowMs >= STOP_MS) moving = false; }
    else slowMs = 0;
  }

  let moved = 0;
  if (last && !gap && moving && raw != null && prev != null) { dist += (raw + prev) / 2 * dtMs / 1000; moved = dtMs; }
  else if (last && gap && dtMs <= GAP_MAX_MS && within(fix, 30) && within(last, 30)) {
    const d = distanceM(P(last), P(fix));
    if (d >= 30 && d / (dtMs / 1000) <= 70) { dist += d; moved = dtMs; }
  }
  moveMs += moved;
  if (capped != null && (fix.accuracy == null || fix.accuracy <= 30)) max = Math.max(max, capped);

  if (moved) {
    bkMs += moved; bkMax = Math.max(bkMax, capped || 0);
    if (bkMs >= bucketMs) {
      series = [...series, Math.round(bkMax * KMH)]; bkMs = 0; bkMax = 0;
      if (series.length > SERIES_MAX) { series = pairMax(series); bucketMs *= 2; }
    }
  }

  if (raw == null || gap) sprint = { ...sprint, on: false, armed: false };
  else if (sprint.on) {
    const peak = Math.max(sprint.peak, raw);
    if (raw >= V_100) {
      const t100 = prev != null && prev < V_100 ? last.t + (V_100 - prev) / (raw - prev) * dtMs : fix.t;
      const secs = Math.round((t100 - sprint.t0) / 100) / 10, ok = secs >= 1.5 && secs <= 60;
      if (ok) best = best == null ? secs : Math.min(best, secs);
      sprint = { ...SPRINT0, last: ok ? secs : sprint.last };
    } else if (raw < 0.8 * peak - 0.5 || fix.t - sprint.t0 > 60000) sprint = { ...SPRINT0, armed: raw === 0, last: sprint.last };
    else sprint = { ...sprint, peak };
  } else if (raw === 0) sprint = { ...sprint, armed: true };
  else if (sprint.armed && raw > V_LAUNCH) {
    sprint = prev == null ? { ...sprint, armed: false }
      : { ...sprint, on: true, armed: false, peak: raw, t0: prev >= V_LAUNCH ? last.t : last.t + (V_LAUNCH - prev) / (raw - prev) * dtMs };
  }

  if (raw != null && raw > 2 && typeof fix.heading === "number" && isFinite(fix.heading)) heading = ((fix.heading % 360) + 360) % 360;
  return {
    dist, moveMs, max, best, series, bucketMs, bkMs, bkMax, raw, v, moving, slowMs, heading, sprint,
    last: { t: fix.t, lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy },
  };
}

export const dayRecord = (trip, lean) => ({
  dist: Math.round(trip.dist), moveMs: Math.round(trip.moveMs), max: Math.round(trip.max * 100) / 100, best: trip.best,
  series: trip.series, bucketMs: trip.bucketMs,
  maxL: Math.round(lean.maxL * 10) / 10, maxR: Math.round(lean.maxR * 10) / 10, corners: lean.corners,
});

export const avgMs = (d) => (d?.moveMs > 0 ? d.dist / (d.moveMs / 1000) : 0);
export const compass8 = (deg) => Math.round((((deg % 360) + 360) % 360) / 45) % 8;

export function records(days) {
  const r = { top: 0, lean: 0, best: null, far: 0, total: 0, rides: 0 };
  for (const d of days || []) {
    if (!(d.dist > 0)) continue;
    r.rides++; r.total += d.dist;
    r.top = Math.max(r.top, d.max || 0); r.far = Math.max(r.far, d.dist);
    r.lean = Math.max(r.lean, d.maxL || 0, d.maxR || 0);
    if (d.best != null) r.best = r.best == null ? d.best : Math.min(r.best, d.best);
  }
  return r;
}

const pad2 = (n) => String(n).padStart(2, "0");
const dayBefore = (key) => { const [y, m, d] = key.split("-").map(Number); const p = new Date(y, m - 1, d - 1); return `${p.getFullYear()}-${pad2(p.getMonth() + 1)}-${pad2(p.getDate())}`; };

// Days ridden in a row, ending today — or yesterday, so a streak is not "lost" before today's ride.
export function streak(keys, today) {
  const have = new Set(keys);
  let k = have.has(today) ? today : dayBefore(today), n = 0;
  while (have.has(k)) { n++; k = dayBefore(k); }
  return n;
}
