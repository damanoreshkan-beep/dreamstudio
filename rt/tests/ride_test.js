import { assert, assertEquals, assertAlmostEquals } from "jsr:@std/assert@1";
import {
  G, KMH, V_100, mountFrame, leanInit, leanStep, leanStats, leanTrack, leanTier, fixSpeed, tripInit, tripStep,
  dayRecord, avgMs, compass8, records, streak, SERIES_MAX, BUCKET_MS,
} from "../ride.js";

const RAD = Math.PI / 180;
const near = (a, b, eps, msg) => assert(Math.abs(a - b) <= eps, `${msg || ""} got ${a}, want ${b} ± ${eps}`);
const vec = (a, b, eps = 1e-6) => a.every((x, i) => Math.abs(x - b[i]) <= eps);

// Flat on the tank, top of the phone forward: device x = right, y = forward, z = up.
const FLAT = [0, 0, G];
// A coordinated turn leaning `phi` (right positive) at `v`: the yaw vector is world-up, which in the bike
// frame is cos·up + sin·left; apparent gravity stays on the bike's own vertical.
const turnSample = (phi, v) => {
  const psi = -G * Math.tan(phi * RAD) / v;
  return { rot: [-psi * Math.sin(phi * RAD) / RAD, 0, psi * Math.cos(phi * RAD) / RAD], acc: [0, 0, G / Math.cos(phi * RAD)] };
};
const run = (st, sample, v, secs, hz = 60) => { for (let i = 0; i < secs * hz; i++) st = leanStep(st, sample, v, 1 / hz); return st; };

Deno.test("ride: mountFrame finds the bike's axes, whichever way the platform signs gravity", () => {
  const a = mountFrame(FLAT), i = mountFrame([0, 0, -G]);
  assert(vec(a.up, [0, 0, 1]) && vec(a.fwd, [0, 1, 0]) && vec(a.left, [-1, 0, 0]), "flat, Android sign");
  assert(vec(i.up, [0, 0, 1]) && vec(i.fwd, [0, 1, 0]) && i.sign === -1, "flat, iOS sign");
  const c = Math.SQRT1_2;
  const t = mountFrame([0, G * c, G * c]);
  assert(vec(t.up, [0, c, c]) && vec(t.fwd, [0, c, -c]) && vec(t.left, [-1, 0, 0]), "portrait, tilted back 45°");
  const l = mountFrame([G * c, 0, G * c], 90);
  assert(vec(l.up, [c, 0, c]) && vec(l.fwd, [c, 0, -c]) && vec(l.left, [0, 1, 0]), "landscape (angle 90), tilted back 45°");
  assertEquals(mountFrame(null), null);
  assertEquals(mountFrame([0, 0, 2.5 * G]), null, "not a resting sample");
  assertEquals(mountFrame([0, G * c, -G * c]), null, "screen facing the road: no forward to find");
});

Deno.test("ride: lean in a steady turn comes from the turn itself, not from gravity", () => {
  for (const phi of [30, -30, 45, -12]) {
    const st = run({ ...leanInit(), frame: mountFrame(FLAT) }, turnSample(phi, 20), 20, 10);
    near(st.phi, phi, 1, `steady ${phi}°`);
  }
  const f = mountFrame(FLAT), a = turnSample(40, 20).acc;
  const naive = Math.atan2(a[0] * f.left[0] + a[1] * f.left[1] + a[2] * f.left[2], a[2]) / RAD;
  assertEquals(naive, 0, "gravity alone reads zero in a 40° turn — the trap this module exists for");
});

Deno.test("ride: the gyro carries a quick roll-in; gravity sets the angle at a standstill", () => {
  let st = { ...leanInit(), frame: mountFrame(FLAT), kin: true };
  st = run(st, { rot: [0, 60, 0], acc: FLAT }, 20, 0.5);
  assert(st.phi > 20 && st.phi < 31, `0.5 s at 60°/s about the forward axis leans right: ${st.phi}`);
  const rest = { rot: [0, 0, 0], acc: [-G * Math.sin(10 * RAD), 0, G * Math.cos(10 * RAD)] };
  near(run({ ...leanInit(), frame: mountFrame(FLAT) }, rest, 0, 10).phi, 10, 0.3, "standing, leaned right 10°");
  near(run(leanInit(), { rot: [0, 0, 0], acc: FLAT }, null, 2).phi, 0, 1e-6, "no GPS yet: upright reads 0");
  assertEquals(leanStep(leanInit(), { rot: null, acc: null }, 10, 0.016).frame, null, "no sensor: no frame, no angle");
});

Deno.test("ride: gyro bias is learned at a stop and upright is learned on a straight", () => {
  let st = { ...leanInit(), frame: mountFrame(FLAT) };
  st = run(st, { rot: [0, 0.8, 0], acc: FLAT }, 0, 20);
  near(st.bias[1], 0.8, 0.05, "bias");
  near(st.phi, 0, 0.5, "a drifting gyro does not walk the angle away at rest");

  const stand = [-G * Math.sin(10 * RAD), 0, G * Math.cos(10 * RAD)];
  let s2 = leanStep(leanInit(), { rot: [0, 0, 0], acc: stand }, 0, 0.016);
  near(Math.acos(s2.frame.up[2]) / RAD, 10, 0.1, "started on the side stand: 'up' is 10° off");
  s2 = run(s2, { rot: [0, 0, 0], acc: FLAT }, 20, 30);
  near(Math.acos(s2.frame.up[2]) / RAD, 0, 0.3, "30 s of straight road levels it");
});

Deno.test("ride: lean records need speed and hold; a corner is 15° for 1.5 s", () => {
  const step = (s, phi, v, secs) => { for (let i = 0; i < secs * 60; i++) s = leanTrack(s, phi, v, 1 / 60); return s; };
  let s = step(leanStats(), 40, 2, 5);
  assertEquals([s.maxL, s.maxR, s.corners], [0, 0, 0], "walking pace: nothing counts");
  s = step(leanStats(), 50, 20, 0.05);
  assert(s.maxR < 10, `a 50 ms spike is not a record: ${s.maxR}`);
  s = step(leanStats(), 38, 20, 3);
  near(s.maxR, 38, 0.1); assertEquals(s.corners, 1);
  s = step(s, 0, 20, 2); s = step(s, -33, 20, 3);
  near(s.maxL, 33, 0.1); assertEquals(s.corners, 2, "the other side is a second corner");
  s = step(s, -33, 20, 5);
  assertEquals(s.corners, 2, "a long corner is still one");
  assertEquals([leanTier(24.9), leanTier(25), leanTier(41), leanTier(60)], [0, 1, 4, 5]);
  assertEquals(leanStats({ maxL: 31, maxR: 29, corners: 7 }).corners, 7, "seeded from the stored day");
});

const fixes = (speeds, { t0 = 1e6, dt = 1000, acc = 6 } = {}) => speeds.map((speed, i) => ({ t: t0 + i * dt, lat: 50, lng: 30, accuracy: acc, speed, heading: 45 }));
const feed = (s, list) => list.reduce(tripStep, s);

Deno.test("ride: distance integrates speed while moving and never grows at a red light", () => {
  let s = feed(tripInit(), fixes(Array(61).fill(20)));
  near(s.dist, 1200, 1, "60 s at 20 m/s");
  assertEquals(s.moveMs, 60000);
  near(avgMs(s) * KMH, 72, 0.1);
  assertEquals(s.heading, 45);

  const jitter = Array.from({ length: 120 }, (_, i) => (i % 3) * 0.25);
  s = feed(tripInit(), fixes(jitter));
  assertEquals([s.dist, s.moveMs, s.v, s.moving], [0, 0, 0, false], "0–0.5 m/s Doppler noise is standing still");

  s = feed(tripInit(), fixes([10, 10, 10, 0.7, 0.7, 0.7, 0.7, 0.7]));
  assertEquals(s.moving, false, "3 s under 3 km/h is a stop");
  const d = s.dist;
  s = feed(s, fixes([0.7, 0.7, 0.7], { t0: 1e6 + 8000 }));
  assertEquals(s.dist, d, "creeping noise after the stop adds nothing");
});

Deno.test("ride: a GPS spike cannot set the top speed, and a tunnel is credited as a straight line", () => {
  let s = feed(tripInit(), fixes([20, 20, 95, 20, 20]));
  near(s.max, 32, 0.01, "one fix cannot out-accelerate 12 m/s²");

  const a = { t: 0, lat: 50, lng: 30, accuracy: 8, speed: 25 }, b = { t: 1000, lat: 50.0002, lng: 30, accuracy: 8, speed: 25 };
  const out = { t: 41000, lat: 50.009, lng: 30, accuracy: 8, speed: 25 };
  s = feed(tripInit(), [a, b, out]);
  near(s.dist, 25 + 978.6, 3, "40 s gap: haversine between the last fix and the first one after");
  assertEquals(s.moveMs, 41000);
  s = feed(tripInit(), [a, b, { ...out, t: 1000 + 600000 }]);
  near(s.dist, 25, 0.01, "a 10 min gap is a locked phone, not a tunnel — nothing is invented");
  assertEquals(tripStep(s, { ...out, t: 5 }), s, "an out-of-order fix is ignored");
});

Deno.test("ride: speed falls back to position only when both fixes are good", () => {
  const a = { t: 0, lat: 50, lng: 30, accuracy: 8, speed: null }, b = { t: 1000, lat: 50.0001, lng: 30, accuracy: 8, speed: null };
  near(fixSpeed(b, a), 11.12, 0.05);
  assertEquals(fixSpeed(b, null), null);
  assertEquals(fixSpeed({ ...b, accuracy: 40 }, a), null);
  assertEquals(fixSpeed({ ...b, speed: 7 }, a), 7, "the Doppler speed wins when the device has one");
  assertEquals(fixSpeed({ ...b, speed: NaN }, null), null);
});

Deno.test("ride: 0–100 is timed between interpolated crossings, and an aborted run records nothing", () => {
  const ramp = (a, n) => [0, 0, ...Array.from({ length: n }, (_, i) => a * (i + 1))];
  let s = feed(tripInit(), fixes(ramp(5, 8)));
  near(s.best, V_100 / 5, 0.25, "5 m/s² from rest");
  assertEquals(s.sprint.last, s.best);
  const first = s.best;
  s = feed(s, fixes([20, 10, 0, 0, ...ramp(4, 9).slice(2)], { t0: 2e6 }));
  assertEquals(s.best, first, "a slower run does not replace the best");
  near(s.sprint.last, V_100 / 4, 0.25);

  s = feed(tripInit(), fixes([0, 0, 5, 10, 15, 8, 20, 30]));
  assertEquals([s.best, s.sprint.on], [null, false], "backing off cancels the run");
  s = feed(tripInit(), fixes([12, 20, 30]));
  assertEquals(s.best, null, "a roll-on that never stood still is not a 0–100");
  assertEquals(tripInit({ best: 4.2 }).best, 4.2);
});

Deno.test("ride: the speed series is bucketed by moving time and halves itself instead of growing", () => {
  let s = feed(tripInit(), fixes(Array(31).fill(25)));
  assertEquals(s.series, Array(6).fill(90), "30 s moving = six 5 s buckets of 90 km/h");
  s = feed(tripInit(), fixes(Array((SERIES_MAX + 3) * 5 + 1).fill(25)));
  assert(s.series.length <= SERIES_MAX && s.series.length > SERIES_MAX / 2 - 2, `length ${s.series.length}`);
  assertEquals(s.bucketMs, BUCKET_MS * 2);
  assert(s.series.every((v) => v === 90));
});

Deno.test("ride: a day is what gets stored, and it seeds the next session", () => {
  let trip = feed(tripInit(), fixes(Array(31).fill(25)));
  const day = dayRecord(trip, { maxL: 31.26, maxR: 28.94, corners: 4 });
  assertEquals(day, { dist: 750, moveMs: 30000, max: 25, best: null, series: Array(6).fill(90), bucketMs: BUCKET_MS, maxL: 31.3, maxR: 28.9, corners: 4 });
  trip = feed(tripInit(day), fixes(Array(11).fill(30), { t0: 5e6 }));
  near(trip.dist, 1050, 1); assertEquals(trip.max, 30); assertEquals(trip.series.length, 8);
  assertEquals(avgMs({ dist: 0, moveMs: 0 }), 0);
});

Deno.test("ride: records, streaks and the compass rose", () => {
  const days = [
    { id: "2026-09-30", dist: 42000, max: 31, maxL: 28, maxR: 33, best: 5.1 },
    { id: "2026-10-01", dist: 120500, max: 44, maxL: 39, maxR: 35, best: 4.4 },
    { id: "2026-10-02", dist: 0, max: 0 },
  ];
  assertEquals(records(days), { top: 44, lean: 39, best: 4.4, far: 120500, total: 162500, rides: 2 });
  assertEquals(records([]), { top: 0, lean: 0, best: null, far: 0, total: 0, rides: 0 });
  const keys = ["2026-09-28", "2026-09-30", "2026-10-01"];
  assertEquals(streak(keys, "2026-10-02"), 2, "not ridden yet today: yesterday's streak still stands");
  assertEquals(streak([...keys, "2026-10-02"], "2026-10-02"), 3);
  assertEquals(streak(keys, "2026-10-04"), 0);
  assertEquals(streak(["2026-02-28", "2026-03-01"], "2026-03-01"), 2, "across a month boundary");
  assertEquals([0, 22, 23, 45, 180, 337, 338, 359, -45].map(compass8), [0, 0, 1, 1, 4, 7, 0, 0, 7]);
});
